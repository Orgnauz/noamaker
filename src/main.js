import './style.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import products from './products.json';
import { STORE, CATEGORIES } from './config.js';

gsap.registerPlugin(ScrollTrigger);

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const ils = (n) => `${n.toLocaleString('he-IL')} ₪`;
const catOf = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[0];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- hero video: light file on small screens ---------- */
const heroVideo = $('#heroVideo');
if (heroVideo) {
  const small = window.matchMedia('(max-width: 760px)').matches;
  heroVideo.src = small ? heroVideo.dataset.srcSmall : heroVideo.dataset.src;
  if (reduceMotion) heroVideo.removeAttribute('autoplay');
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
let cart = load();

function load() {
  try { return JSON.parse(localStorage.getItem('noamaker-cart') || '{}'); } catch { return {}; }
}
function save() {
  try { localStorage.setItem('noamaker-cart', JSON.stringify(cart)); } catch { /* storage blocked – cart lives in memory */ }
}

/* ---------- categories ---------- */
function renderCats() {
  const counts = products.reduce((m, p) => ((m[p.category] = (m[p.category] || 0) + 1), m), {});
  $('#cats').innerHTML = CATEGORIES.map((c) => `
    <button class="cat ${c.id === state.cat ? 'active' : ''}" role="tab" aria-selected="${c.id === state.cat}" data-cat="${c.id}">
      <span class="cat-art"><img src="${c.art}" alt="" data-fallback="${c.emoji}" loading="lazy" /></span>
      <span class="cat-label">${c.label}</span>
      <span class="cat-count">${c.id === 'all' ? products.length : counts[c.id] || 0}</span>
    </button>`).join('');
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
  let list = products.filter((p) =>
    (state.cat === 'all' || p.category === state.cat) &&
    (!state.q || p.name.includes(state.q) || (p.subcategory || '').includes(state.q)));
  if (state.sort === 'price-asc') list = [...list].sort((a, b) => a.price - b.price);
  if (state.sort === 'price-desc') list = [...list].sort((a, b) => b.price - a.price);
  return list;
}

function card(p) {
  const c = catOf(p.category);
  const media = p.image
    ? `<img src="${p.image}" alt="${p.name}" loading="lazy" data-fallback="${c.emoji}" />`
    : `<div class="ph"><img src="${c.art}" alt="" data-fallback="${c.emoji}" loading="lazy" /><span>תמונה בקרוב</span></div>`;
  const inCart = cart[p.sku] || 0;
  return `
  <article class="card" data-sku="${p.sku}">
    <div class="card-media">${media}<span class="tag">${p.subcategory}</span></div>
    <div class="card-body">
      <h3>${p.name}</h3>
      <p class="meta">מודפס במיוחד בשבילכם · ${p.sku}</p>
      <div class="card-foot">
        <strong class="price">${ils(p.price)}</strong>
        <button class="add ${inCart ? 'in' : ''}" data-add="${p.sku}" aria-label="הוספת ${p.name} לסל">
          ${inCart ? `בסל (${inCart}) +` : 'הוסף לסל'}
        </button>
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
  addToCart(b.dataset.add, b);
});

/* ---------- cart ---------- */
const bySku = Object.fromEntries(products.map((p) => [p.sku, p]));

function addToCart(sku, btn) {
  cart[sku] = (cart[sku] || 0) + 1;
  save(); renderCart();
  if (btn) {
    btn.classList.add('in');
    btn.textContent = `בסל (${cart[sku]}) +`;
    flyToCart(btn);
  }
  toast(`${bySku[sku].name} נוסף לסל 🎉`);
}

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

function setQty(sku, qty) {
  if (qty <= 0) delete cart[sku]; else cart[sku] = qty;
  save(); renderCart(); renderGrid();
}

function cartItems() {
  return Object.entries(cart).filter(([s]) => bySku[s]).map(([s, q]) => ({ ...bySku[s], qty: q }));
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
  $('#cartEmpty').hidden = items.length > 0;
  $('#orderForm').hidden = items.length === 0;
  $('#drawerFoot').hidden = items.length === 0;
  $('#cartList').innerHTML = items.map((i) => `
    <li class="cart-item">
      <img class="ci-thumb" src="${i.image || catOf(i.category).art}" alt="" loading="lazy" />
      <div class="ci-info"><strong>${i.name}</strong><small>${ils(i.price)} ליחידה</small></div>
      <div class="qty">
        <button data-q="${i.sku}" data-d="1" aria-label="הוספת יחידה">+</button>
        <span>${i.qty}</span>
        <button data-q="${i.sku}" data-d="-1" aria-label="הורדת יחידה">−</button>
      </div>
    </li>`).join('');
}
$('#cartList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-q]');
  if (b) setQty(b.dataset.q, (cart[b.dataset.q] || 0) + Number(b.dataset.d));
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
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeCart());

/* ---------- send order to WhatsApp ---------- */
$('#sendOrder').addEventListener('click', () => {
  const f = $('#orderForm');
  const data = Object.fromEntries(new FormData(f));
  const missing = ['name', 'address', 'phone'].filter((k) => !String(data[k] || '').trim());
  const err = $('#formError');
  if (missing.length) {
    err.textContent = 'רגע! צריך למלא שם, כתובת וטלפון כדי שאדע לאן להביא 🙂';
    err.hidden = false;
    f.querySelector(`[name="${missing[0]}"]`).focus();
    return;
  }
  err.hidden = true;
  const items = cartItems();
  const total = items.reduce((n, i) => n + i.qty * i.price, 0);
  const lines = [
    'היי נועם! 👋 הזמנה חדשה מנועמייקר:',
    '',
    ...items.map((i) => `• ${i.name} (${i.sku}) × ${i.qty} = ${ils(i.qty * i.price)}`),
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
  const url = `https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent(lines.join('\n'))}`;
  window.open(url, '_blank', 'noopener');
  toast('פותח וואטסאפ… תודה שהזמנתם! 🧡');
});

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
    gsap.to('.hero-media video', { scale: 1.12, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
    gsap.to('.hero-copy', { yPercent: -30, opacity: 0.2, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
  });
  mm.add('(max-width: 760px)', () => {
    // the framed video "prints" in layer by layer, Noam pops out of it
    gsap.fromTo('.hero-media', { clipPath: 'inset(100% 0 0 0 round 26px)' }, { clipPath: 'inset(0% 0 0 0 round 26px)', duration: 0.9, ease: 'steps(12)', delay: 0.1 });
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
    // "layer by layer" reveal of the art, like a 3D print
    gsap.fromTo(ch.querySelector('.chapter-art img'), { clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0% 0 0 0)', ease: 'steps(14)', duration: 1.1, scrollTrigger: { trigger: ch, start: 'top 72%' } });
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
renderCats();
renderGrid();
renderCart();
animate();
