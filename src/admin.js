import './style.css';
import './admin.css';
import { sb, fetchColors, fetchProductSettings, ORDER_STATUS } from './supabase.js';
import products from './products.json';
import { CATEGORIES } from './config.js';

const ADMIN_EMAIL = 'admin@noamaker.app'; // shared workshop account – only the password is secret

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ils = (n) => `${Number(n || 0).toLocaleString('he-IL')} ₪`;
const OPEN = ['new', 'printing', 'ready'];
const statusOf = (id) => ORDER_STATUS.find((s) => s.id === id) || ORDER_STATUS[0];

const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const todayISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
function ago(iso) {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return 'עכשיו';
  if (m < 60) return `לפני ${m} דק׳`;
  const h = Math.round(m / 60); if (h < 24) return `לפני ${h} שע׳`;
  const d = Math.round(h / 24); return d === 1 ? 'אתמול' : `לפני ${d} ימים`;
}
function dueLabel(o) {
  if (!o.due_date || !OPEN.includes(o.status)) return '';
  const diff = Math.round((new Date(o.due_date) - new Date(todayISO())) / 86400000);
  if (diff < 0) return `<span class="due late">באיחור של ${-diff} ${-diff === 1 ? 'יום' : 'ימים'}</span>`;
  if (diff === 0) return '<span class="due today">למסירה היום</span>';
  if (diff === 1) return '<span class="due soon">למסירה מחר</span>';
  return `<span class="due">עוד ${diff} ימים</span>`;
}

let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2000);
}

/* ================= AUTH ================= */
async function start() {
  const { data } = await sb.auth.getSession();
  if (data.session) enterApp(); else showLogin();
}
function showLogin() { $('#app').hidden = true; $('#login').hidden = false; $('#loginForm [name=password]').focus(); }

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#loginError'); err.hidden = true;
  const btn = e.submitter; btn.disabled = true;
  const { error } = await sb.auth.signInWithPassword({ email: ADMIN_EMAIL, password: e.target.password.value });
  btn.disabled = false;
  if (error) {
    err.textContent = error.message.includes('Invalid') ? 'הסיסמה לא נכונה' : 'אין חיבור כרגע, נסו שוב';
    err.hidden = false; return;
  }
  e.target.reset(); enterApp();
});

$('#logout').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });

$('#pwForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, err = $('#pwError'); err.hidden = true;
  if (f.pw.value !== f.pw2.value) { err.textContent = 'הסיסמאות לא זהות'; err.hidden = false; return; }
  const { error } = await sb.auth.updateUser({ password: f.pw.value });
  if (error) { err.textContent = 'לא הצלחתי לשמור: ' + error.message; err.hidden = false; return; }
  f.reset(); toast('הסיסמה עודכנה ✔');
});

/* ================= TABS ================= */
$('.a-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]'); if (!b) return;
  $$('.a-tab').forEach((t) => { const on = t === b; t.classList.toggle('active', on); t.setAttribute('aria-selected', on); });
  $$('.panel').forEach((p) => (p.hidden = p.id !== `panel-${b.dataset.tab}`));
  if (b.dataset.tab === 'colors') renderUsage();
  if (b.dataset.tab === 'inventory') renderInventory();
});

/* ================= WORKSHOP DATA (admin only) ================= */
let workshop = {}; // sku -> { makerworld_url, grams, print_hours, profile, plates }
async function loadWorkshop() {
  const { data, error } = await sb.from('product_workshop').select('sku,makerworld_url,grams,print_hours,profile,plates');
  if (!error) workshop = Object.fromEntries(data.map((r) => [r.sku, r]));
}
const fmtG = (g) => g >= 1000 ? `${(g / 1000).toLocaleString('he-IL', { maximumFractionDigits: 2 })} ק״ג` : `${Math.round(g).toLocaleString('he-IL')} ג׳`;
function fmtH(h) {
  const m = Math.round(h * 60);
  const hh = Math.floor(m / 60), mm = m % 60;
  return hh ? `${hh}:${String(mm).padStart(2, '0')} שע׳` : `${mm} דק׳`;
}
function orderNeeds(o) {
  let g = 0, h = 0, missing = 0;
  o.order_items.forEach((i) => {
    const w = workshop[i.sku];
    if (!w || w.grams == null) { missing++; return; }
    g += Number(w.grams) * i.qty; h += Number(w.print_hours || 0) * i.qty;
  });
  return { g, h, missing };
}

/* ================= ORDERS ================= */
let orders = [];
let filter = 'open';

async function loadOrders() {
  const { data, error } = await sb.from('orders')
    .select('*, order_items(id, sku, name, color_id, color_name, color_hex, qty, unit_price)')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) {
    if (error.code === 'PGRST301' || /JWT/i.test(error.message)) { showLogin(); return; }
    $('#orders').innerHTML = `<p class="empty-note">לא הצלחתי לטעון הזמנות: ${esc(error.message)}</p>`; return;
  }
  orders = data;
  renderOrders();
}

function counts() {
  const c = { open: 0, all: orders.length };
  ORDER_STATUS.forEach((s) => (c[s.id] = 0));
  orders.forEach((o) => { c[o.status]++; if (OPEN.includes(o.status)) c.open++; });
  return c;
}

function renderFilters() {
  const c = counts();
  const opts = [{ id: 'open', label: 'פתוחות' }, ...ORDER_STATUS.map((s) => ({ id: s.id, label: s.label })), { id: 'all', label: 'הכל' }];
  $('#filters').innerHTML = opts.map((o) =>
    `<button class="chip ${filter === o.id ? 'active' : ''}" data-filter="${o.id}" aria-pressed="${filter === o.id}">${o.label}<b>${c[o.id]}</b></button>`).join('');
  $('#openCount').textContent = c.open;
}
$('#filters').addEventListener('click', (e) => {
  const b = e.target.closest('[data-filter]'); if (!b) return;
  filter = b.dataset.filter; renderOrders();
});

function sorted(list) {
  // open orders: soonest due first; closed: newest first
  return [...list].sort((a, b) => {
    const ao = OPEN.includes(a.status), bo = OPEN.includes(b.status);
    if (ao !== bo) return ao ? -1 : 1;
    if (ao) return (a.due_date || '9999').localeCompare(b.due_date || '9999') || a.order_no - b.order_no;
    return new Date(b.created_at) - new Date(a.created_at);
  });
}

function orderCard(o) {
  const st = statusOf(o.status);
  const waPhone = o.phone.replace(/\D/g, '').replace(/^0/, '972');
  const timeline = [
    ['התקבלה', o.created_at], ['בהדפסה', o.printing_at], ['מוכנה', o.ready_at], ['נמסרה', o.delivered_at],
  ].filter(([, t]) => t).map(([l, t]) => `<li><b>${l}</b> ${fmtDateTime(t)}</li>`).join('');
  return `
  <article class="order s-${o.status}" data-id="${o.id}">
    <header class="o-head">
      <div>
        <h3>#${o.order_no} · ${esc(o.customer_name)}</h3>
        <p class="o-sub">${ago(o.created_at)} · ${fmtDateTime(o.created_at)}</p>
      </div>
      <span class="badge b-${o.status}">${st.emoji} ${st.label}</span>
    </header>

    <div class="o-contact">
      <span>🏠 ${esc(o.address)}</span>
      <a href="tel:${esc(o.phone)}">📞 ${esc(o.phone)}</a>
      <a href="https://wa.me/${waPhone}" target="_blank" rel="noopener">💬 וואטסאפ</a>
    </div>

    <ul class="o-items">
      ${o.order_items.map((i) => {
        const w = workshop[i.sku];
        const spec = w ? `
          <span class="i-spec">
            ${w.grams != null ? `<span title="חומר">⚖️ ${fmtG(w.grams * i.qty)}${i.qty > 1 ? ` <small>(${fmtG(w.grams)} ליח׳)</small>` : ''}</span>` : ''}
            ${w.print_hours != null ? `<span title="זמן הדפסה">⏱️ ${fmtH(w.print_hours * i.qty)}${i.qty > 1 ? ` <small>(${fmtH(w.print_hours)} ליח׳)</small>` : ''}</span>` : ''}
            ${w.plates > 1 ? `<span title="פלטות">🧩 ${w.plates} פלטות</span>` : ''}
            ${w.makerworld_url ? `<a href="${esc(w.makerworld_url)}" target="_blank" rel="noopener noreferrer">פתיחה ב-MakerWorld ↗</a>` : ''}
          </span>` : '';
        return `
        <li>
          <i class="dot" style="--c:${esc(i.color_hex || 'transparent')}" title="${esc(i.color_name || 'ללא צבע')}"></i>
          <span class="i-name">${esc(i.name)} <small>${esc(i.sku)}</small></span>
          <span class="i-color">${esc(i.color_name || '—')}</span>
          <span class="i-qty">×${i.qty}</span>
          ${spec}
        </li>`;
      }).join('')}
      ${(() => {
        const n = orderNeeds(o);
        return n.g ? `<li class="i-total"><span>סה״כ להדפסה</span><b>⚖️ ${fmtG(n.g)}</b><b>⏱️ ${fmtH(n.h)}</b>${n.missing ? `<small>(${n.missing} פריטים בלי נתונים)</small>` : ''}</li>` : '';
      })()}
    </ul>
    ${o.notes ? `<p class="o-notes">📝 ${esc(o.notes)}</p>` : ''}

    <div class="o-row">
      <strong class="o-total">${ils(o.total)}</strong>
      <label class="switch">
        <input type="checkbox" data-field="paid" ${o.paid ? 'checked' : ''} />
        <span>${o.paid ? 'שולם בפייבוקס ✔' : 'עוד לא שולם'}</span>
      </label>
    </div>

    <div class="seg" role="radiogroup" aria-label="סטטוס הזמנה #${o.order_no}">
      ${ORDER_STATUS.filter((s) => s.id !== 'cancelled').map((s) =>
        `<button role="radio" aria-checked="${o.status === s.id}" data-status="${s.id}">${s.emoji}<span>${s.label}</span></button>`).join('')}
    </div>

    <div class="o-row o-due">
      <label>מועד מסירה <input type="date" data-field="due_date" value="${o.due_date || ''}" /></label>
      ${dueLabel(o)}
    </div>

    <details class="o-more">
      <summary>זמנים, הערות וביטול</summary>
      ${timeline ? `<ul class="timeline">${timeline}</ul>` : ''}
      <label class="o-note">הערה פנימית<textarea data-field="admin_note" rows="2" maxlength="500" placeholder="למשל: להדפיס אחרי הקערה של משפחת לוי">${esc(o.admin_note)}</textarea></label>
      ${o.status === 'cancelled'
        ? '<button class="btn btn-ghost btn-sm" data-status="new">שחזור הזמנה</button>'
        : '<button class="btn btn-ghost btn-sm danger" data-status="cancelled">ביטול הזמנה</button>'}
    </details>
  </article>`;
}

function renderOrders() {
  renderFilters();
  const list = sorted(orders.filter((o) => filter === 'all' || (filter === 'open' ? OPEN.includes(o.status) : o.status === filter)));
  $('#orders').innerHTML = list.length
    ? list.map(orderCard).join('')
    : `<div class="empty-note"><img src="/assets/characters/noam-wave.webp" alt="" /><p>${filter === 'open' ? 'אין הזמנות פתוחות. זמן להדפיס משהו חדש!' : 'אין הזמנות כאן.'}</p></div>`;
}

async function updateOrder(id, patch, msg = 'נשמר ✔') {
  const o = orders.find((x) => x.id === id); if (!o) return;
  const before = { ...o };
  Object.assign(o, patch); renderOrders();
  const { data, error } = await sb.from('orders').update(patch).eq('id', id).select('*, order_items(id, sku, name, color_id, color_name, color_hex, qty, unit_price)').single();
  if (error) { Object.assign(o, before); renderOrders(); toast('לא נשמר – בדקו חיבור'); return; }
  Object.assign(o, data); renderOrders(); toast(msg);
}

$('#orders').addEventListener('click', (e) => {
  const b = e.target.closest('[data-status]'); if (!b) return;
  const id = Number(b.closest('.order').dataset.id);
  const s = b.dataset.status;
  if (s === 'cancelled' && !confirm('לבטל את ההזמנה?')) return;
  const patch = { status: s };
  // moving back to an earlier stage clears the later timestamps
  if (s === 'new') Object.assign(patch, { printing_at: null, ready_at: null, delivered_at: null });
  if (s === 'printing') Object.assign(patch, { ready_at: null, delivered_at: null });
  if (s === 'ready') Object.assign(patch, { delivered_at: null });
  updateOrder(id, patch, `${statusOf(s).emoji} ${statusOf(s).label}`);
});
$('#orders').addEventListener('change', (e) => {
  const el = e.target.closest('[data-field]'); if (!el) return;
  const id = Number(el.closest('.order').dataset.id);
  const f = el.dataset.field;
  const v = el.type === 'checkbox' ? el.checked : (el.value || null);
  updateOrder(id, { [f]: v }, f === 'paid' ? (v ? 'סומן כשולם 💰' : 'סומן כלא שולם') : 'נשמר ✔');
});

/* ================= COLORS ================= */
let colors = [];
async function loadColors() {
  try { colors = await fetchColors({ includeOutOfStock: true }); } catch (e) { toast('לא הצלחתי לטעון צבעים'); return; }
  renderColors();
}
function renderColors() {
  if (!$('#panel-inventory').hidden) renderInventory();
  $('#colorList').innerHTML = colors.map((c) => `
    <li class="color-row ${c.in_stock ? '' : 'out'}" data-id="${c.id}">
      <label class="color-pick" style="--c:${esc(c.hex)}"><input type="color" data-cfield="hex" value="${esc(c.hex)}" aria-label="גוון של ${esc(c.name)}" /></label>
      <input class="color-name" data-cfield="name" value="${esc(c.name)}" maxlength="40" aria-label="שם הצבע" />
      <label class="switch small">
        <input type="checkbox" data-cfield="in_stock" ${c.in_stock ? 'checked' : ''} />
        <span>${c.in_stock ? 'יש במלאי' : 'נגמר'}</span>
      </label>
      <button class="icon-btn" data-cdel aria-label="מחיקת ${esc(c.name)}">🗑</button>
    </li>`).join('');
}
$('#colorList').addEventListener('change', async (e) => {
  const el = e.target.closest('[data-cfield]'); if (!el) return;
  const id = Number(el.closest('.color-row').dataset.id);
  const f = el.dataset.cfield;
  const v = el.type === 'checkbox' ? el.checked : el.value.trim();
  if (f === 'name' && !v) { renderColors(); return; }
  const { error } = await sb.from('colors').update({ [f]: v }).eq('id', id);
  if (error) { toast('לא נשמר – ' + error.message); return; }
  Object.assign(colors.find((c) => c.id === id), { [f]: v });
  renderColors(); toast(f === 'in_stock' ? (v ? 'חזר למלאי ✔' : 'סומן כנגמר') : 'נשמר ✔');
});
$('#colorList').addEventListener('input', (e) => {
  if (e.target.dataset.cfield === 'hex') e.target.closest('.color-pick').style.setProperty('--c', e.target.value);
});
$('#colorList').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-cdel]'); if (!b) return;
  const id = Number(b.closest('.color-row').dataset.id);
  const c = colors.find((x) => x.id === id);
  if (!confirm(`למחוק את "${c.name}"? (הזמנות קודמות ישמרו את שם הצבע)`)) return;
  const { error } = await sb.from('colors').delete().eq('id', id);
  if (error) { toast('לא נמחק – ' + error.message); return; }
  colors = colors.filter((x) => x.id !== id); renderColors(); toast('נמחק');
});
$('#colorAdd').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const sort = (colors.at(-1)?.sort_order || 0) + 10;
  const { data, error } = await sb.from('colors').insert({ name: f.name.value.trim(), hex: f.hex.value, sort_order: sort }).select().single();
  if (error) { toast('לא נוסף – ' + error.message); return; }
  colors.push(data); renderColors(); f.name.value = ''; toast(`${data.name} נוסף ✔`);
});

// filament planning: how much of each color the open orders need
function renderUsage() {
  const need = {};
  orders.filter((o) => OPEN.includes(o.status) && o.status !== 'ready').forEach((o) => o.order_items.forEach((i) => {
    const k = i.color_name || 'ללא צבע';
    need[k] = need[k] || { hex: i.color_hex, qty: 0, g: 0 };
    need[k].qty += i.qty;
    need[k].g += Number(workshop[i.sku]?.grams || 0) * i.qty;
  }));
  const rows = Object.entries(need).sort((a, b) => b[1].qty - a[1].qty);
  $('#usage').innerHTML = `<h3>מה צריך להדפיס (הזמנות חדשות ובהדפסה)</h3>` + (rows.length
    ? `<ul>${rows.map(([n, v]) => `<li><i class="dot" style="--c:${esc(v.hex || 'transparent')}"></i>${esc(n)}<b>${v.qty} יח׳${v.g ? ` · ${fmtG(v.g)}` : ''}</b></li>`).join('')}</ul>`
    : '<p class="muted">אין כרגע מה להדפיס.</p>');
}

/* ================= INVENTORY ================= */
const MAX_COLORS = 3;
let settings = {};           // sku -> { sku, hidden, color_ids }
const inv = { q: '', cat: 'all', show: 'all' };
const setOf = (sku) => settings[sku] || { sku, hidden: false, color_ids: [] };
const colorObj = (id) => colors.find((c) => String(c.id) === String(id));

async function loadSettings() {
  try { settings = Object.fromEntries((await fetchProductSettings()).map((r) => [r.sku, r])); }
  catch (e) { toast('לא הצלחתי לטעון הגדרות מוצרים'); }
}

function invFiltered() {
  const q = inv.q.trim();
  return products.filter((p) => {
    const st = setOf(p.sku);
    if (inv.cat !== 'all' && p.category !== inv.cat) return false;
    if (inv.show === 'shown' && st.hidden) return false;
    if (inv.show === 'hidden' && !st.hidden) return false;
    if (inv.show === 'custom' && !st.color_ids.length) return false;
    if (inv.show === 'nocolor' && !(st.color_ids.length && !st.color_ids.some((id) => colorObj(id)?.in_stock))) return false;
    return !q || p.name.includes(q) || p.sku.toLowerCase().includes(q.toLowerCase());
  });
}

function renderInvFilters() {
  const all = products.map((p) => setOf(p.sku));
  const n = {
    all: products.length,
    shown: all.filter((s) => !s.hidden).length,
    hidden: all.filter((s) => s.hidden).length,
    custom: all.filter((s) => s.color_ids.length).length,
    nocolor: all.filter((s) => s.color_ids.length && !s.color_ids.some((id) => colorObj(id)?.in_stock)).length,
  };
  const opts = [['all', 'הכל'], ['shown', 'מוצגים'], ['hidden', 'מוסתרים'], ['custom', 'עם צבעים קבועים'], ['nocolor', 'אין צבע במלאי']];
  $('#invFilters').innerHTML = opts.map(([id, l]) =>
    `<button class="chip ${inv.show === id ? 'active' : ''} ${id === 'nocolor' && n.nocolor ? 'warn' : ''}" data-show="${id}" aria-pressed="${inv.show === id}">${l}<b>${n[id]}</b></button>`).join('');
}

function invRow(p) {
  const st = setOf(p.sku);
  const chosen = st.color_ids.map(colorObj).filter(Boolean);
  const noStock = chosen.length && !chosen.some((c) => c.in_stock);
  const chips = chosen.length
    ? chosen.map((c) => `<span class="cchip ${c.in_stock ? '' : 'out'}" title="${c.in_stock ? '' : 'נגמר במלאי'}"><i class="dot" style="--c:${esc(c.hex)}"></i>${esc(c.name)}</span>`).join('')
    : '<span class="cchip all">כל הצבעים</span>';
  return `
  <li class="inv-row ${st.hidden ? 'is-hidden' : ''}" data-sku="${esc(p.sku)}">
    <img class="inv-thumb" src="${esc(p.image || '')}" alt="" loading="lazy" />
    <div class="inv-info">
      <strong>${esc(p.name)}</strong>
      <small>${esc(p.sku)} · ${esc(p.subcategory)} · ${ils(p.price)}</small>
      ${workshop[p.sku] ? `<small class="inv-spec">⚖️ ${fmtG(workshop[p.sku].grams || 0)} · ⏱️ ${fmtH(workshop[p.sku].print_hours || 0)}${workshop[p.sku].makerworld_url ? ` · <a href="${esc(workshop[p.sku].makerworld_url)}" target="_blank" rel="noopener noreferrer">MakerWorld ↗</a>` : ''}</small>` : ''}
      <button class="inv-colors" data-edit-colors aria-label="עריכת צבעים עבור ${esc(p.name)}">${chips}<span class="edit">עריכה</span></button>
      ${noStock ? '<span class="due late">אף צבע לא במלאי – לא ניתן להזמין</span>' : ''}
    </div>
    <label class="switch small inv-vis">
      <input type="checkbox" data-visible ${st.hidden ? '' : 'checked'} />
      <span>${st.hidden ? 'מוסתר' : 'בחנות'}</span>
    </label>
  </li>`;
}

function renderInventory() {
  if (!$('#invCat').options.length) {
    $('#invCat').innerHTML = CATEGORIES.map((c) => `<option value="${c.id}">${c.id === 'all' ? 'כל הקטגוריות' : c.label}</option>`).join('');
  }
  renderInvFilters();
  const list = invFiltered();
  $('#invList').innerHTML = list.length ? list.map(invRow).join('') : '<p class="empty-note">אין מוצרים שמתאימים לסינון.</p>';
}

async function saveSetting(sku, patch, msg) {
  const prev = setOf(sku);
  const next = { ...prev, ...patch, sku };
  settings[sku] = next; renderInventory();
  const { error } = await sb.from('product_settings').upsert({ sku, hidden: next.hidden, color_ids: next.color_ids }, { onConflict: 'sku' });
  if (error) { settings[sku] = prev; renderInventory(); toast('לא נשמר – ' + error.message); return false; }
  toast(msg); return true;
}

$('#invSearch').addEventListener('input', (e) => { inv.q = e.target.value; renderInventory(); });
$('#invCat').addEventListener('change', (e) => { inv.cat = e.target.value; renderInventory(); });
$('#invFilters').addEventListener('click', (e) => { const b = e.target.closest('[data-show]'); if (b) { inv.show = b.dataset.show; renderInventory(); } });
$('#invList').addEventListener('change', (e) => {
  const el = e.target.closest('[data-visible]'); if (!el) return;
  const sku = el.closest('.inv-row').dataset.sku;
  saveSetting(sku, { hidden: !el.checked }, el.checked ? 'מוצג בחנות ✔' : 'הוסתר מהחנות');
});
$('#invList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-edit-colors]'); if (b) openColorChooser(b.closest('.inv-row').dataset.sku);
});

/* product color chooser (up to 3) */
const cp = $('#cp'), cpBackdrop = $('#cpBackdrop');
let cpState = { sku: null, ids: [] };
function renderChooser() {
  const ids = cpState.ids.map(String);
  $('#cpSwatches').innerHTML = colors.map((c) => {
    const on = ids.includes(String(c.id));
    const full = !on && ids.length >= MAX_COLORS;
    return `<button class="swatch ${c.in_stock ? '' : 'is-out'}" aria-pressed="${on}" aria-checked="${on}" data-cpc="${c.id}" ${full ? 'disabled' : ''} style="--c:${esc(c.hex)}">
      <i></i><span>${esc(c.name)}</span>${c.in_stock ? '' : '<small>נגמר</small>'}${on ? `<em>${ids.indexOf(String(c.id)) + 1}</em>` : ''}
    </button>`;
  }).join('');
  $('#cpNote').textContent = ids.length
    ? `נבחרו ${ids.length} מתוך ${MAX_COLORS}. הלקוחות יראו רק את הצבעים האלה (כשהם במלאי).`
    : 'לא נבחרו צבעים – הלקוחות יראו את כל הצבעים שיש במלאי.';
}
function openColorChooser(sku) {
  const p = products.find((x) => x.sku === sku);
  cpState = { sku, ids: [...setOf(sku).color_ids] };
  $('#cpName').textContent = `${p.name} · ${p.sku}`;
  $('#cpThumb').src = p.image || '';
  renderChooser();
  cpBackdrop.hidden = false; cp.hidden = false;
  requestAnimationFrame(() => cp.classList.add('open'));
  document.body.classList.add('lock');
}
function closeChooser() {
  cp.classList.remove('open'); document.body.classList.remove('lock');
  setTimeout(() => { cp.hidden = true; cpBackdrop.hidden = true; }, 220);
}
$('#cpSwatches').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cpc]'); if (!b || b.disabled) return;
  const id = Number(b.dataset.cpc);
  const i = cpState.ids.map(Number).indexOf(id);
  if (i >= 0) cpState.ids.splice(i, 1); else if (cpState.ids.length < MAX_COLORS) cpState.ids.push(id);
  renderChooser();
});
$('#cpAll').addEventListener('click', () => { cpState.ids = []; renderChooser(); });
$('#cpSave').addEventListener('click', async () => {
  const ok = await saveSetting(cpState.sku, { color_ids: cpState.ids.map(Number) }, cpState.ids.length ? 'הצבעים נשמרו ✔' : 'כל הצבעים זמינים למוצר ✔');
  if (ok) closeChooser();
});
$('#cpClose').addEventListener('click', closeChooser);
cpBackdrop.addEventListener('click', closeChooser);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !cp.hidden) closeChooser(); });

/* ================= BOOT ================= */
let channel;
async function enterApp() {
  $('#login').hidden = true; $('#app').hidden = false;
  await Promise.all([loadWorkshop(), loadColors(), loadSettings()]);
  await loadOrders();
  // live: new orders show up without refreshing
  channel?.unsubscribe();
  channel = sb.channel('orders-live')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, async () => {
      await loadOrders(); toast('🔔 הזמנה חדשה!');
    })
    .subscribe();
}
// refresh when coming back to the tab (phone in pocket for a while)
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('#app').hidden) loadOrders(); });
start();
