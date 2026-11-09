"""Writes docs/product-photo-prompts.md + .csv: one original product-photo prompt per for-sale SKU."""
import csv, json, pathlib
from openpyxl import load_workbook
ROOT = pathlib.Path(__file__).resolve().parent.parent
wb = load_workbook(ROOT / 'scripts' / 'inventory.xlsx', data_only=True); ws = wb['מלאי']
hdr = [c.value for c in ws[1]]; col = {h: i for i, h in enumerate(hdr)}

SCENE = {
  'kitchen': 'on a light oak kitchen counter with a soft cream wall behind',
  'home': 'on a light oak sideboard with a soft cream wall behind',
  'bath': 'on a white bathroom shelf with soft cream tiles behind',
  'entrance': 'mounted on a soft cream wall in a bright home entrance',
  'jewelry': 'on a light oak dresser with a few simple rings and necklaces',
  'fidget': 'on a clean pastel cream surface with a soft orange shadow, playful',
  'flexi': 'on a clean pastel cream surface, posed playfully, slight curl',
}
cats = {p['sku']: p for p in json.loads((ROOT / 'src' / 'products.json').read_text(encoding='utf-8'))}
rows = []
for r in ws.iter_rows(min_row=2, values_only=True):
    sku = r[col['מק"ט']]
    if sku not in cats: continue
    p = cats[sku]
    en = r[col['שם מקורי (MakerWorld)']]
    prompt = (f"Original product photo of a 3D-printed '{en}' ({p['name']}), printed in matte PLA, "
              f"{SCENE[p['category']]}. Natural soft daylight from the side, shallow depth of field, "
              "square 1:1, centered, realistic subtle layer lines visible, no people, no text, no logos, no watermarks. "
              "Brand palette accents: warm orange #ff7a1a and teal #22a7a8 in props or filament color where it fits. "
              "Create a fresh composition, colors and angle – do not imitate any existing listing photo.")
    rows.append({'sku': sku, 'file': f'public/assets/products/{sku}.webp', 'name_he': p['name'],
                 'name_en': en, 'category': p['subcategory'],
                 'license': p['license'],
                 'commercial_license_needed': 'כן' if p['needsCommercialLicense'] else 'לא',
                 'prompt': prompt})

with open(ROOT / 'docs' / 'product-photo-prompts.csv', 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.DictWriter(f, fieldnames=rows[0].keys()); w.writeheader(); w.writerows(rows)

need = sum(r['commercial_license_needed'] == 'כן' for r in rows)
md = [
 '# תמונות מוצר לנועמייקר – רשימה ל-Codex',
 '',
 f'{len(rows)} מוצרים למכירה. לכל מוצר: שם קובץ יעד ופרומפט לתמונה מקורית.',
 '',
 '## איך להשתמש',
 '1. מייצרים תמונה לכל שורה (ריבועית, לפחות 1024×1024).',
 '2. שומרים בשם שבעמודה **קובץ** (למשל `public/assets/products/ORG-001.webp`). גם `.jpg` או `.png` עובדים.',
 '3. מריצים `npm run products` – האתר יזהה את התמונות ויחליף את ה"תמונה בקרוב".',
 '',
 '> 💡 הכי טוב בסוף: לצלם את ההדפסות האמיתיות של נועם. תמונה של המוצר שהלקוח יקבל בפועל היא גם הכי אמינה.',
 '',
 '## רישיונות',
 f'{need} מתוך {len(rows)} המוצרים הם בדגמים עם רישיון MakerWorld שמתיר שימוש אישי בלבד (Standard / Exclusive / Community). '
 'תמונה חדשה לא משנה את זה: כדי למכור הדפסות של דגם כזה צריך רישיון מסחרי מהמעצב (Commercial License ב-MakerWorld). '
 'העמודה "רישיון מסחרי נדרש" מסמנת אותם – כדאי לוודא שיש רישיון לכל אחד לפני שהוא עולה לאוויר.',
 '',
 '| מק"ט | מוצר | קטגוריה | רישיון מסחרי נדרש | קובץ | פרומפט |',
 '|---|---|---|---|---|---|',
]
for r in rows:
    md.append(f"| {r['sku']} | {r['name_he']} | {r['category']} | {r['commercial_license_needed']} | `{r['file']}` | {r['prompt']} |")
(ROOT / 'docs' / 'product-photo-prompts.md').write_text('\n'.join(md) + '\n', encoding='utf-8')
print(len(rows), 'prompts;', need, 'need commercial license')
