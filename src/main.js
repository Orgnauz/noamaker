import './style.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import products from './products.json';
import { STORE, CATEGORIES } from './config.js';
import { sb, fetchColors, fetchProductSettings } from './supabase.js';

gsap.registerPlugin(ScrollTrigger);

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const ils = (n) => `${n.toLocaleString('he-IL')} ₪`;
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const catOf = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[0];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- hero video: light file on small screens ---------- */
const heroVideo = $('#heroVideo');
if (heroVideo) {
  const small = window.matchMedia('(max-width: 760px)').matches;
  heroVideo.src = small ? heroVideo.dataset.srcSmall : heroVideo.dataset.src;
  if (reduceMotion) heroVideo.removeAttribute('autoplay');
  // keep the (fully loaded) poster image on screen; swap to the video only once it is actually playing
  const showVideo = () => heroVideo.classList.add('is-ready');
  heroVideo.addEventListener('playing', showVideo, { once: true });
  if (reduceMotion) heroVideo.addEventListener('canplaythrough', showVideo, { once: true });
}

/* ---------- show images only once fully loaded (no half-painted / white flashes) ---------- */
function markLoaded(img) { img.classList.add('is-loaded'); }
function reveal(img) {
  // decode() waits until the image is ready to paint in one go
  if (img.decode) img.decode().catch(() => {}).finally(() => markLoaded(img));
  else markLoaded(img);
}
document.addEventListener('load', (e) => { if (e.target.tagName === 'IMG') reveal(e.target); }, true);
function revealCached(root = document) {
  root.querySelectorAll('img:not(.is-loaded)').forEach((img) => {
    if (img.complete && img.naturalWidth) reveal(img);
  });
}

/* ---------- image fallbacks (art not downloaded yet) ---------- */
function fallbackTo(img, emoji) {
  const box = document.createElement('span');
  box.className = 'img-fallback';
  box.textContent = emoji;
  img.replaceWith(box);
}
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName === 'IMG' && img.dataset.fallback) fallbackTo(img, img.dataset.fallback);
}, true);

/* ---------- state ---------- */
const state = { cat: 'all', q: '', sort: 'default' };
// cart: { "SKU|colorId": qty }  (colorId is '' when no color chosen yet)
let cart = load();
// workshop colors (in stock). null = not loaded / unavailable -> store works without colors
let colors = null;
const colorById = (id) => (colors || []).find((c) => String(c.id) === String(id));
// per-product settings from the admin inventory page: { sku: { hidden, color_ids } }
let settings = {};
const isHidden = (sku) => !!settings[sku]?.hidden;
/** in-stock colors this product can be printed in (product's own list, or every in-stock color) */
function colorsFor(sku) {
  if (!colors) return [];
  const ids = settings[sku]?.color_ids || [];
  return ids.length ? colors.filter((c) => ids.map(String).includes(String(c.id))) : colors;
}
/** product limited to specific colors and none of them is in stock right now */
const outOfColor = (sku) => !!colors && (settings[sku]?.color_ids || []).length > 0 && colorsFor(sku).length === 0;
const shown = () => products.filter((p) => !isHidden(p.sku));
const keyOf = (sku, colorId) => `${sku}|${colorId ?? ''}`;
const splitKey = (k) => { const [sku, colorId = ''] = k.split('|'); return { sku, colorId }; };

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem('noamaker-cart') || '{}');
    // migrate old carts keyed by SKU only
    return Object.fromEntries(Object.entries(raw).map(([k, q]) => [k.includes('|') ? k : `${k}|`, q]));
  } catch { return {}; }
}
function save() {
  try { localStorage.setItem('noamaker-cart', JSON.stringify(cart)); } catch { /* storage blocked – cart lives in memory */ }
}

/* ---------- categories ---------- */
function renderCats() {
  const counts = shown().reduce((m, p) => ((m[p.category] = (m[p.category] || 0) + 1), m), {});
  $('#cats').innerHTML = CATEGORIES.map((c) => `
    <button class="cat ${c.id === state.cat ? 'active' : ''}" role="tab" aria-selected="${c.id === state.cat}" data-cat="${c.id}">
      <span class="cat-art"><img src="${c.art}" alt="" data-fallback="${c.emoji}" loading="lazy" decoding="async" /></span>
      <span class="cat-label">${c.label}</span>
      <span class="cat-count">${c.id === 'all' ? shown().length : counts[c.id] || 0}</span>
    </button>`).join('');
  revealCached($('#cats'));
}
$('#cats').addEventListener('click', (e) => {
  const b = e.target.closest('.cat');
  if (!b) return;
  state.cat = b.dataset.cat;
  $$('.cat').forEach((x) => { x.classList.toggle('active', x === b); x.setAttribute('aria-selected', x === b); });
  renderGrid(true);
  b.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
});

/* ---------- product grid ---------- */
function filtered() {
  let list = shown().filter((p) =>
    (state.cat === 'all' || p.category === state.cat) &&
    (!state.q || p.name.includes(state.q) || (p.subcategory || '').includes(state.q)));
  if (state.sort === 'price-asc') list = [...list].sort((a, b) => a.price - b.price);
  if (state.sort === 'price-desc') list = [...list].sort((a, b) => b.price - a.price);
  return list;
}

function card(p) {
  const c = catOf(p.category);
  const media = p.image
    ? `<img src="${p.image}" alt="${p.name}" loading="lazy" decoding="async" data-fallback="${c.emoji}" />`
    : `<div class="ph"><img src="${c.art}" alt="" data-fallback="${c.emoji}" loading="lazy" decoding="async" /><span>תמונה בקרוב</span></div>`;
  const inCart = qtyOfSku(p.sku);
  const pc = colorsFor(p.sku);
  const dots = pc.length
    ? `<span class="mini-swatches" aria-label="${pc.length} צבעים לבחירה">${pc.slice(0, 6).map((c) => `<i style="--c:${c.hex}"></i>`).join('')}${pc.length > 6 ? `<b>+${pc.length - 6}</b>` : ''}</span>`
    : '';
  const sold = outOfColor(p.sku);
  return `
  <article class="card" data-sku="${p.sku}">
    <div class="card-media">${media}<span class="tag">${p.subcategory}</span></div>
    <div class="card-body">
      <h3>${p.name}</h3>
      <p class="meta">מודפס במיוחד בשבילכם · ${p.sku}</p>
      ${dots}
      <div class="card-foot">
        <strong class="price">${ils(p.price)}</strong>
        ${sold
          ? '<button class="add" disabled>אזל זמנית</button>'
          : `<button class="add ${inCart ? 'in' : ''}" data-add="${p.sku}" aria-label="הוספת ${p.name} לסל">
          ${inCart ? `בסל (${inCart}) +` : 'הוסף לסל'}
        </button>`}
      </div>
    </div>
  </article>`;
}

function renderGrid(animate = false) {
  const list = filtered();
  $('#grid').innerHTML = list.length
    ? list.map(card).join('')
    : `<div class="empty"><img src="/assets/characters/noam-apron.webp" alt="" /><p>לא מצאתי מוצר כזה… אבל אולי אני יכול להדפיס אותו? שלחו לי הודעה!</p></div>`;
  $('#resultsCount').textContent = `${list.length} מוצרים`;
  revealCached($('#grid'));
  if (animate && !reduceMotion) {
    gsap.from('#grid .card', { y: 30, opacity: 0, duration: 0.45, stagger: 0.03, ease: 'back.out(1.6)' });
  }
  ScrollTrigger.refresh();
}

$('#search').addEventListener('input', (e) => { state.q = e.target.value.trim(); renderGrid(); });
$('#sort').addEventListener('change', (e) => { state.sort = e.target.value; renderGrid(true); });

$('#grid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-add]');
  if (!b) return;
  const pc = colorsFor(b.dataset.add);
  if (pc.length > 1) openPicker(b.dataset.add, b);
  else addToCart(b.dataset.add, pc[0]?.id ?? '', b); // one color (or no color data) – add straight away
});

/* ---------- cart ---------- */
const bySku = Object.fromEntries(products.map((p) => [p.sku, p]));

function qtyOfSku(sku) {
  return Object.entries(cart).reduce((n, [k, q]) => n + (splitKey(k).sku === sku ? q : 0), 0);
}

function addToCart(sku, colorId, btn) {
  const k = keyOf(sku, colorId);
  cart[k] = (cart[k] || 0) + 1;
  save(); renderCart();
  if (btn) {
    btn.classList.add('in');
    btn.textContent = `בסל (${qtyOfSku(sku)}) +`;
    flyToCart(btn);
  }
  const c = colorById(colorId);
  toast(`${bySku[sku].name}${c ? ` ב${c.name}` : ''} נוסף לסל 🎉`);
}

/* ---------- color picker ---------- */
const picker = $('#picker'), pickerBackdrop = $('#pickerBackdrop');
let pick = { sku: null, colorId: null, btn: null, lastFocus: null };
function renderSwatches() {
  $('#swatches').innerHTML = colorsFor(pick.sku).map((c) => `
    <button class="swatch" role="radio" aria-checked="${String(c.id) === String(pick.colorId)}" data-color="${c.id}" style="--c:${c.hex}">
      <i></i><span>${esc(c.name)}</span>
    </button>`).join('');
  const chosen = colorById(pick.colorId);
  const add = $('#pickerAdd');
  add.disabled = !chosen;
  add.textContent = chosen ? `הוסף לסל · ${chosen.name}` : 'בחרו צבע';
}
function openPicker(sku, btn) {
  const p = bySku[sku];
  pick = { sku, colorId: null, btn, lastFocus: document.activeElement };
  $('#pickerName').textContent = `${p.name} · ${ils(p.price)}`;
  const th = $('#pickerThumb'); th.classList.remove('is-loaded'); th.src = p.image || catOf(p.category).art; revealCached(picker);
  renderSwatches();
  pickerBackdrop.hidden = false; picker.hidden = false;
  requestAnimationFrame(() => picker.classList.add('open'));
  document.body.classList.add('lock');
  $('#swatches .swatch')?.focus();
}
function closePicker() {
  picker.classList.remove('open');
  document.body.classList.remove('lock');
  setTimeout(() => { picker.hidden = true; pickerBackdrop.hidden = true; }, 220);
  pick.lastFocus?.focus?.();
}
$('#swatches').addEventListener('click', (e) => {
  const b = e.target.closest('[data-color]'); if (!b) return;
  pick.colorId = b.dataset.color; renderSwatches();
  $(`#swatches [data-color="${pick.colorId}"]`)?.focus();
});
$('#swatches').addEventListener('keydown', (e) => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
  const btns = $$('#swatches .swatch'); const i = btns.indexOf(document.activeElement); if (i < 0) return;
  e.preventDefault();
  const step = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? 1 : -1; // RTL: left = next
  const n = btns[(i + step + btns.length) % btns.length];
  pick.colorId = n.dataset.color; renderSwatches(); $(`#swatches [data-color="${pick.colorId}"]`).focus();
});
$('#pickerAdd').addEventListener('click', () => {
  if (!pick.colorId) return;
  const { sku, colorId, btn } = pick;
  closePicker();
  addToCart(sku, colorId, btn);
});
$('#pickerClose').addEventListener('click', closePicker);
pickerBackdrop.addEventListener('click', closePicker);

function flyToCart(btn) {
  if (reduceMotion) return;
  const from = btn.getBoundingClientRect();
  const to = $('#cartOpen').getBoundingClientRect();
  const dot = document.createElement('span');
  dot.className = 'fly-dot';
  document.body.appendChild(dot);
  gsap.fromTo(dot,
    { x: from.left + from.width / 2, y: from.top, scale: 1 },
    { x: to.left + to.width / 2, y: to.top + to.height / 2, scale: 0.4, duration: 0.7, ease: 'power2.in',
      onComplete: () => { dot.remove(); gsap.fromTo('#cartCount', { scale: 1.6 }, { scale: 1, duration: 0.4, ease: 'back.out(3)' }); } });
}

function setQty(key, qty) {
  if (qty <= 0) delete cart[key]; else cart[key] = qty;
  save(); renderCart(); renderGrid();
}

function setLineColor(key, colorId) {
  const { sku } = splitKey(key);
  const q = cart[key]; delete cart[key];
  const nk = keyOf(sku, colorId);
  cart[nk] = (cart[nk] || 0) + q;
  save(); renderCart();
}

function cartItems() {
  return Object.entries(cart)
    .map(([k, q]) => ({ key: k, ...splitKey(k), qty: q }))
    .filter((i) => bySku[i.sku] && !isHidden(i.sku))
    .map((i) => ({ ...bySku[i.sku], key: i.key, colorId: i.colorId, color: colorsFor(i.sku).find((c) => String(c.id) === String(i.colorId)), qty: i.qty }));
}

function colorSelect(i) {
  const pc = colorsFor(i.sku);
  if (!pc.length) return '';
  return `<label class="ci-color ${i.color ? '' : 'missing'}" style="--c:${i.color?.hex || 'transparent'}">
      <i aria-hidden="true"></i>
      <select data-color-of="${esc(i.key)}" aria-label="צבע עבור ${esc(i.name)}">
        ${i.color ? '' : '<option value="" selected>בחרו צבע</option>'}
        ${pc.map((c) => `<option value="${c.id}" ${String(c.id) === String(i.colorId) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select>
    </label>`;
}

function renderCart() {
  const items = cartItems();
  const count = items.reduce((n, i) => n + i.qty, 0);
  const total = items.reduce((n, i) => n + i.qty * i.price, 0);
  $('#cartCount').textContent = count;
  $('#cartBar').hidden = count === 0;
  $('#cartBarCount').textContent = count;
  $('#cartBarTotal').textContent = ils(total);
  document.body.classList.toggle('has-cart', count > 0);
  $('#cartTotal').textContent = ils(total);
  $('#cartEmpty').hidden = items.length > 0 || !$('#orderDone').hidden;
  $('#orderForm').hidden = items.length === 0 || !$('#orderDone').hidden;
  $('#drawerFoot').hidden = items.length === 0;
  $('#cartList').innerHTML = items.map((i) => `
    <li class="cart-item">
      <img class="ci-thumb" src="${i.image || catOf(i.category).art}" alt="" loading="lazy" decoding="async" />
      <div class="ci-info"><strong>${i.name}</strong><small>${ils(i.price)} ליחידה</small>${colorSelect(i)}</div>
      <div class="qty">
        <button data-q="${esc(i.key)}" data-d="1" aria-label="הוספת יחידה">+</button>
        <span>${i.qty}</span>
        <button data-q="${esc(i.key)}" data-d="-1" aria-label="הורדת יחידה">−</button>
      </div>
    </li>`).join('');
  revealCached($('#cartList'));
}
$('#cartList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-q]');
  if (b) setQty(b.dataset.q, (cart[b.dataset.q] || 0) + Number(b.dataset.d));
});
$('#cartList').addEventListener('change', (e) => {
  const s = e.target.closest('[data-color-of]');
  if (s && s.value) setLineColor(s.dataset.colorOf, s.value);
});

/* drawer */
const drawer = $('#drawer'), backdrop = $('#backdrop');
function openCart() {
  backdrop.hidden = false; drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('lock'); $('#cartClose').focus();
}
function closeCart() {
  drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('lock'); setTimeout(() => (backdrop.hidden = true), 300);
}
$('#cartOpen').addEventListener('click', openCart);
$('#cartBar').addEventListener('click', openCart);
$('#emptyToShop').addEventListener('click', () => { closeCart(); $('#shop').scrollIntoView({ behavior: 'smooth' }); });
$('#cartClose').addEventListener('click', closeCart);
backdrop.addEventListener('click', closeCart);
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!picker.hidden) closePicker(); else closeCart();
});

/* ---------- send order: save to the workshop's order list, then WhatsApp ---------- */
function waUrl(text) { return `https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent(text)}`; }

$('#sendOrder').addEventListener('click', async () => {
  const f = $('#orderForm');
  const data = Object.fromEntries(new FormData(f));
  const missing = ['name', 'address', 'phone'].filter((k) => !String(data[k] || '').trim());
  const err = $('#formError');
  const items = cartItems();
  if (missing.length) {
    err.textContent = 'רגע! צריך למלא שם, כתובת וטלפון כדי שאדע לאן להביא 🙂';
    err.hidden = false;
    f.querySelector(`[name="${missing[0]}"]`).focus();
    return;
  }
  if (items.some((i) => colorsFor(i.sku).length && !i.color)) {
    err.textContent = 'נשאר לבחור צבע לכל מוצר בסל 🎨';
    err.hidden = false;
    $('#cartList .ci-color.missing select')?.focus();
    return;
  }
  err.hidden = true;

  const btn = $('#sendOrder');
  btn.disabled = true; btn.classList.add('is-busy');
  // open the WhatsApp tab right away (inside the tap) so popup blockers allow it
  const win = window.open('', '_blank');

  let orderNo = null;
  try {
    const { data: no, error } = await sb.rpc('place_order', {
      p_name: data.name.trim(), p_address: data.address.trim(), p_phone: data.phone.trim(), p_notes: (data.notes || '').trim(),
      p_items: items.map((i) => ({ sku: i.sku, name: i.name, color_id: i.color ? Number(i.color.id) : null, qty: i.qty, unit_price: i.price })),
    });
    if (error) throw error;
    orderNo = no;
  } catch (e) {
    console.warn('order not saved, sending by WhatsApp only', e);
  }

  const total = items.reduce((n, i) => n + i.qty * i.price, 0);
  const lines = [
    `היי נועם! 👋 הזמנה חדשה מנועמייקר${orderNo ? ` (#${orderNo})` : ''}:`,
    '',
    ...items.map((i) => `• ${i.name}${i.color ? ` – ${i.color.name}` : ''} (${i.sku}) × ${i.qty} = ${ils(i.qty * i.price)}`),
    '',
    `סה״כ: ${ils(total)}`,
    '',
    `שם: ${data.name}`,
    `כתובת: ${data.address}`,
    `טלפון: ${data.phone}`,
    data.notes ? `הערות: ${data.notes}` : null,
    '',
    `אשלם ב${STORE.payment} אחרי שתאשר את ההזמנה 🙏`,
  ].filter((l) => l !== null);
  const url = waUrl(lines.join('\n'));
  if (win) win.location.href = url; else window.location.href = url;

  // success state
  cart = {}; save();
  $('#doneNo').textContent = orderNo ? `#${orderNo}` : '';
  $('#doneWa').href = url;
  $('#orderDone').hidden = false;
  f.reset();
  btn.disabled = false; btn.classList.remove('is-busy');
  renderCart(); renderGrid();
});
$('#doneClose').addEventListener('click', () => { $('#orderDone').hidden = true; closeCart(); renderCart(); });

/* ---------- toast ---------- */
let toastT;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------- footer ---------- */
$('#footerWa').href = `https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent('היי נועם! יש לי שאלה על נועמייקר 🙂')}`;
$('#year').textContent = new Date().getFullYear();

/* ---------- header shadow on scroll ---------- */
ScrollTrigger.create({ start: 40, onToggle: (s) => $('#topbar').classList.toggle('scrolled', s.isActive) });

/* ---------- animations ---------- */
function animate() {
  if (reduceMotion) return;

  // Hero intro
  const tl = gsap.timeline({ defaults: { ease: 'back.out(1.7)' } });
  tl.from('.hero .eyebrow', { y: 20, opacity: 0, duration: 0.5 })
    .from('.hero-title .line', { y: 60, opacity: 0, rotate: -3, duration: 0.7, stagger: 0.12 }, '-=0.2')
    .from('.hero-sub', { y: 20, opacity: 0, duration: 0.5 }, '-=0.3')
    .from('.hero-ctas .btn', { scale: 0.6, opacity: 0, duration: 0.5, stagger: 0.1 }, '-=0.2')
    .from('.hero-char', { y: 60, rotate: -10, scale: 0.9, opacity: 0, duration: 0.9, ease: 'elastic.out(1, 0.7)' }, 0.7);
  gsap.to('.wave', { rotate: 18, yoyo: true, repeat: -1, duration: 0.35, transformOrigin: '70% 70%', ease: 'sine.inOut', repeatDelay: 1.6 });

  // Hero parallax on scroll – desktop only (scrubbed transforms cost frames on phones)
  const mm = gsap.matchMedia();
  mm.add('(min-width: 761px)', () => {
    gsap.to('.hero-media video, .hero-poster', { scale: 1.12, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
    gsap.to('.hero-copy', { yPercent: -30, opacity: 0.2, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
  });
  mm.add('(max-width: 760px)', () => {
    // the framed video "prints" in layer by layer, Noam pops out of it
    gsap.from('.hero-media', { y: 16, scale: 0.97, opacity: 0, duration: 0.7, ease: 'power3.out', delay: 0.1 });
  });

  // Section heads
  $$('.section-head').forEach((h) => gsap.from(h.children, {
    y: 40, opacity: 0, duration: 0.7, stagger: 0.1, ease: 'power3.out',
    scrollTrigger: { trigger: h, start: 'top 82%' },
  }));

  // Story: the "print head" draws a line down the timeline as you scroll
  gsap.to('#printFill', { scaleY: 1, ease: 'none', scrollTrigger: { trigger: '.story-track', start: 'top 60%', end: 'bottom 60%', scrub: 0.4 } });
  gsap.to('#nozzle', { top: '100%', ease: 'none', scrollTrigger: { trigger: '.story-track', start: 'top 60%', end: 'bottom 60%', scrub: 0.4 } });
  $$('.chapter').forEach((ch, i) => {
    const dir = i % 2 ? -1 : 1;
    gsap.from(ch.querySelector('.chapter-art'), { x: 120 * dir, rotate: 6 * dir, opacity: 0, duration: 0.9, ease: 'power3.out', scrollTrigger: { trigger: ch, start: 'top 75%' } });
    gsap.from(ch.querySelectorAll('.chapter-copy > *'), { y: 30, opacity: 0, duration: 0.6, stagger: 0.08, ease: 'power3.out', scrollTrigger: { trigger: ch, start: 'top 70%' } });
  });

  // How-to-order: dotted path draws, steps pop in
  const path = $('#stepsPath');
  if (path) {
    const len = path.getTotalLength();
    gsap.fromTo(path, { strokeDashoffset: len, strokeDasharray: `2 16` }, { strokeDashoffset: 0, ease: 'none', scrollTrigger: { trigger: '.steps', start: 'top 75%', end: 'bottom 60%', scrub: 0.5 } });
  }
  $$('.step').forEach((s, i) => {
    gsap.from(s, { y: 60, opacity: 0, duration: 0.7, delay: i * 0.08, ease: 'power4.out', scrollTrigger: { trigger: '.steps', start: 'top 80%' } });
    gsap.to(s.querySelector('.step-char img'), { y: -8, yoyo: true, repeat: -1, duration: 1.4 + i * 0.15, ease: 'sine.inOut' });
  });

  // Category chips + delivery
  gsap.from('.cat', { y: 30, opacity: 0, duration: 0.5, stagger: 0.05, ease: 'back.out(1.6)', scrollTrigger: { trigger: '#cats', start: 'top 85%' } });
  gsap.from('.delivery-bike', { x: -300, rotate: -8, duration: 1.2, ease: 'power3.out', scrollTrigger: { trigger: '.delivery', start: 'top 80%' } });
}

/* ---------- boot ---------- */
revealCached();
renderCats();
renderGrid();
renderCart();
animate();
Promise.allSettled([fetchColors(), fetchProductSettings()]).then(([c, ps]) => {
  if (c.status === 'fulfilled') colors = c.value; else console.warn('colors unavailable – store works without color choice', c.reason);
  if (ps.status === 'fulfilled') settings = Object.fromEntries(ps.value.map((r) => [r.sku, r]));
  renderCats(); renderGrid(); renderCart();
});
