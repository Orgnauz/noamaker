"""Writes docs/product-photo-prompts.md + .csv: one product-photo prompt per for-sale SKU.

Colors:
  * Default: keep the model's ORIGINAL colors, using its first MakerWorld image as the reference.
  * Later:   fill scripts/colors.csv (sku,color – e.g. "ORG-001,matte terracotta orange")
             with filament colors you have in stock, re-run, and those SKUs get the new color.

Usage: python scripts/build-photo-prompts.py [--images "<path to 3D store\\images>"]
"""
import argparse, csv, json, os, pathlib
from openpyxl import load_workbook

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_IMAGES = r'C:\Users\User\OneDrive - Organuz.ai\Noam\3D store\images'
ap = argparse.ArgumentParser()
ap.add_argument('--images', default=DEFAULT_IMAGES, help='folder with ORG-XXX image subfolders')
ap.add_argument('--display-root', default=None, help='path prefix written to the CSV (defaults to --images)')
args = ap.parse_args()
display_root = args.display_root or args.images

SCENE = {
  'kitchen': 'on a light oak kitchen counter with a soft neutral wall behind',
  'home': 'on a light oak sideboard with a soft neutral wall behind',
  'bath': 'on a white bathroom shelf with soft neutral tiles behind',
  'entrance': 'mounted on a soft neutral wall in a bright home entrance',
  'jewelry': 'on a light oak dresser with a few simple rings and necklaces',
  'fidget': 'on a clean light neutral surface with a soft shadow, playful',
  'flexi': 'on a clean light neutral surface, posed playfully, slight curl',
}

def reference(sku):
    d = pathlib.Path(args.images) / sku
    try:
        files = sorted(f for f in os.listdir(d) if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')))
    except FileNotFoundError:
        return ''
    if not files:  # some models only have an animated GIF – still usable as a reference
        files = sorted(f for f in os.listdir(d) if f.lower().endswith('.gif'))
    return str(pathlib.PureWindowsPath(display_root) / sku / files[0]) if files else ''

colors = {}
cfile = ROOT / 'scripts' / 'colors.csv'
if cfile.exists():
    with open(cfile, encoding='utf-8-sig') as f:
        colors = {r['sku'].strip(): r['color'].strip() for r in csv.DictReader(f) if r.get('color', '').strip()}

wb = load_workbook(ROOT / 'scripts' / 'inventory.xlsx', data_only=True); ws = wb['מלאי']
hdr = [c.value for c in ws[1]]; col = {h: i for i, h in enumerate(hdr)}
products = {p['sku']: p for p in json.loads((ROOT / 'src' / 'products.json').read_text(encoding='utf-8'))}

rows = []
for r in ws.iter_rows(min_row=2, values_only=True):
    sku = r[col['מק"ט']]
    if sku not in products: continue
    p = products[sku]
    en = r[col['שם מקורי (MakerWorld)']]
    ref = reference(sku)
    color = colors.get(sku, '')
    color_part = (f"printed in {color} matte PLA (change only the color; keep the exact shape of the reference)"
                  if color else
                  "keep the exact shape AND the original colors of the object as shown in the reference image")
    prompt = (f"Product photo of the 3D-printed object '{en}' ({p['name']}), {color_part}, "
              f"{SCENE[p['category']]}. Natural soft daylight from the side, shallow depth of field, "
              "square 1:1, centered, realistic subtle layer lines visible, no people, no text, no logos, no watermarks. "
              "New camera angle, background and lighting – do not copy the reference photo's composition.")
    rows.append({'sku': sku, 'file': f'public/assets/products/{sku}.webp', 'name_he': p['name'], 'name_en': en,
                 'category': p['subcategory'], 'reference_image': ref, 'color': color or 'מקורי',
                 'license': p['license'],
                 'commercial_license_needed': 'כן' if p['needsCommercialLicense'] else 'לא',
                 'prompt': prompt})

with open(ROOT / 'docs' / 'product-photo-prompts.csv', 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.DictWriter(f, fieldnames=rows[0].keys()); w.writeheader(); w.writerows(rows)

need = sum(r['commercial_license_needed'] == 'כן' for r in rows)
md = [
 '# תמונות מוצר לנועמייקר – רשימה ל-Codex', '',
 f'{len(rows)} מוצרים למכירה. לכל מוצר: קובץ יעד, תמונת רפרנס ופרומפט.', '',
 '## איך להשתמש',
 '1. לכל שורה מצרפים ל-Codex את **תמונת הרפרנס** (עמודה reference_image) יחד עם הפרומפט.',
 '2. שומרים בשם שבעמודה **קובץ** (למשל `public/assets/products/ORG-001.webp`; גם `.jpg`/`.png` עובדים).',
 '3. מריצים `npm run products` – האתר מחליף את "תמונה בקרוב" בתמונה.', '',
 '## צבעים',
 '- **עכשיו:** כל הפרומפטים שומרים על הצבעים המקוריים של הדגם לפי תמונת הרפרנס.',
 '- **בעתיד:** ממלאים `scripts/colors.csv` (עמודות `sku,color`) בצבעי הפילמנט שיש במלאי ומריצים `npm run photo-prompts`. '
 'מוצר עם צבע בקובץ יקבל פרומפט שמשנה רק את הצבע ושומר על הצורה.', '',
 '## רישיונות',
 f'{need} מתוך {len(rows)} הדגמים ברישיון MakerWorld לשימוש אישי. תמונה חדשה לא משנה את זה – '
 'למכירת הדפסות צריך רישיון מסחרי מהמעצב. העמודה "רישיון מסחרי נדרש" מסמנת אותם.', '',
 '| מק"ט | מוצר | צבע | רפרנס | קובץ | פרומפט |', '|---|---|---|---|---|---|',
]
for r in rows:
    md.append(f"| {r['sku']} | {r['name_he']} | {r['color']} | `{r['reference_image']}` | `{r['file']}` | {r['prompt']} |")
(ROOT / 'docs' / 'product-photo-prompts.md').write_text('\n'.join(md) + '\n', encoding='utf-8')
print(len(rows), 'prompts;', sum(1 for r in rows if r['reference_image']), 'with reference;', len(colors), 'custom colors')
