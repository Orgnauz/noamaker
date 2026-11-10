import './style.css';
import './admin.css';
import { sb, fetchColors, ORDER_STATUS } from './supabase.js';

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
});

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
      ${o.order_items.map((i) => `
        <li>
          <i class="dot" style="--c:${esc(i.color_hex || 'transparent')}" title="${esc(i.color_name || 'ללא צבע')}"></i>
          <span class="i-name">${esc(i.name)} <small>${esc(i.sku)}</small></span>
          <span class="i-color">${esc(i.color_name || '—')}</span>
          <span class="i-qty">×${i.qty}</span>
        </li>`).join('')}
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
    need[k] = need[k] || { hex: i.color_hex, qty: 0 };
    need[k].qty += i.qty;
  }));
  const rows = Object.entries(need).sort((a, b) => b[1].qty - a[1].qty);
  $('#usage').innerHTML = `<h3>מה צריך להדפיס (הזמנות חדשות ובהדפסה)</h3>` + (rows.length
    ? `<ul>${rows.map(([n, v]) => `<li><i class="dot" style="--c:${esc(v.hex || 'transparent')}"></i>${esc(n)}<b>${v.qty} יח׳</b></li>`).join('')}</ul>`
    : '<p class="muted">אין כרגע מה להדפיס.</p>');
}

/* ================= BOOT ================= */
let channel;
async function enterApp() {
  $('#login').hidden = true; $('#app').hidden = false;
  await Promise.all([loadOrders(), loadColors()]);
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
