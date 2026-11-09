// ===== Store settings – edit here =====
export const STORE = {
  name: 'נועמייקר',
  // Orders arrive on WhatsApp at this number (international format, no +)
  whatsapp: '972552423571',
  whatsappDisplay: '055-242-3571',
  payment: 'פייבוקס יאנג',
  deliveryArea: 'קיבוץ',
};

// Store categories (the inventory categories are mapped to these in scripts/build-products.py)
export const CATEGORIES = [
  { id: 'all',      label: 'הכל',               emoji: '✨', art: '/assets/brand/logo-sticker.webp' },
  { id: 'kitchen',  label: 'מטבח',              emoji: '🍳', art: '/assets/categories/kitchen.webp' },
  { id: 'home',     label: 'בית ועיצוב',         emoji: '🏠', art: '/assets/categories/home.webp' },
  { id: 'bath',     label: 'אמבטיה',            emoji: '🛁', art: '/assets/categories/bath.webp' },
  { id: 'entrance', label: 'כניסה ומדפים',       emoji: '🔑', art: '/assets/categories/entrance.webp' },
  { id: 'jewelry',  label: 'תכשיטים ואקססוריז',  emoji: '💍', art: '/assets/categories/jewelry.webp' },
  { id: 'fidget',   label: "לילדים: פידג'טים",   emoji: '🌀', art: '/assets/categories/fidget.webp' },
  { id: 'flexi',    label: 'לילדים: דמויות זזות', emoji: '🐉', art: '/assets/categories/flexi.webp' },
];
