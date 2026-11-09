"""Builds src/products.json from the store inventory (מלאי_חנות_3D.xlsx).
Usage: python scripts/build-products.py [path-to-xlsx]
Only rows with status 'מוכן למכירה' are published."""
import json, sys, pathlib
from openpyxl import load_workbook

ROOT = pathlib.Path(__file__).resolve().parent.parent
src = sys.argv[1] if len(sys.argv) > 1 else ROOT / 'scripts' / 'inventory.xlsx'

# inventory category -> store category id
CAT_MAP = {
    'מטבח': 'kitchen',
    'קערות ומגשים': 'home', 'עיצוב ואגרטלים': 'home', 'שלטים ושונות': 'home',
    'אמבטיה': 'bath',
    'כניסה ומפתחות': 'entrance', 'מדפים ומתלים': 'entrance',
    'תכשיטים ואקססוריז': 'jewelry',
    "צעצועי פידג'ט": 'fidget',
    'דמויות מפרקיות': 'flexi',
}
COMMERCIAL_OK = {'CC0'}  # licenses that allow selling prints without buying anything

wb = load_workbook(src, data_only=True)
ws = wb['מלאי']
hdr = [c.value for c in ws[1]]
col = {h: i for i, h in enumerate(hdr)}
out = []
for r in ws.iter_rows(min_row=2, values_only=True):
    sku = r[col['מק"ט']]
    if not sku or r[col['סטטוס']] != 'מוכן למכירה':
        continue
    lic = r[col['רישיון (MakerWorld)']] or ''
    out.append({
        'sku': sku,
        'name': r[col['שם המוצר']],
        'subcategory': r[col['קטגוריה']],
        'category': CAT_MAP.get(r[col['קטגוריה']], 'home'),
        'price': int(r[col['מחיר לצרכן כולל מע"מ (₪)']] or 0),
        'printHours': round(float(r[col['זמן הדפסה (שעות)']] or 0), 1),
        'license': lic,
        'needsCommercialLicense': lic not in COMMERCIAL_OK,
        'image': next((f'/assets/products/{sku}.{e}' for e in ('webp','jpg','jpeg','png')
                       if (ROOT / 'public' / 'assets' / 'products' / f'{sku}.{e}').exists()), None),
    })
dst = ROOT / 'src' / 'products.json'
dst.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
print(f'{len(out)} products -> {dst}')
