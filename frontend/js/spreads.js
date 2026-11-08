// Spreads station screen — Tablet 3.
// Shows only the שניצל בחלה part of each active order, one line per חלה.
// "מוכן" is local to this tablet (localStorage) — nothing is written to the server.

const TODAY = new Date().toISOString().slice(0, 10);
const CHALLAH_NAME = 'שניצל בחלה';
const CONDIMENTS   = new Set(MENU.spreadsCondiments);
const READY_KEY    = 'spreadsReady';
// PREP_LEAD_MINUTES lives in menu.js. Fallback only for a tablet that still has an
// older cached menu.js next to this file (GitHub Pages caches files ~10 min).
const LEAD_MINUTES = typeof PREP_LEAD_MINUTES === 'number' ? PREP_LEAD_MINUTES : 15;

// ─── state ────────────────────────────────────────────────────────────────────

const state = { orders: [] };

let wakeLock = null;

// ─── local "ready" marks (this tablet only) ──────────────────────────────────

// Keyed by id + created_at: demo order ids restart at 9000, so the id alone
// could match an older demo order's mark.
function readyKey(order) {
  return `${order.id}|${order.created_at}`;
}

function loadReady() {
  try {
    return JSON.parse(localStorage.getItem(READY_KEY)) || {};
  } catch {
    return {};
  }
}

function saveReady(marks) {
  try {
    localStorage.setItem(READY_KEY, JSON.stringify(marks));
  } catch { /* storage unavailable — marks last until reload */ }
}

let readyMarks = loadReady();

function isReady(order) {
  return !!readyMarks[readyKey(order)];
}

function markReady(id) {
  const order = state.orders.find(o => o.id === id);
  if (!order) return;
  readyMarks[readyKey(order)] = Date.now();
  saveReady(readyMarks);
  renderAll();
}

function undoReady(id) {
  const order = state.orders.find(o => o.id === id);
  if (!order) return;
  delete readyMarks[readyKey(order)];
  saveReady(readyMarks);
  renderAll();
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function minutesUntil(timeStr) {
  if (!timeStr) return null;
  const now = new Date();
  const [h, m] = timeStr.split(':').map(Number);
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
  return Math.floor((t - now) / 60000);
}

function isUpcoming(order) {
  if (order.source !== 'whatsapp_form') return false;
  const mins = minutesUntil(order.pickup_time);
  return mins !== null && mins > LEAD_MINUTES;
}

// Scheduled form order inside the prep window -> strong highlight.
function isPrepNow(order) {
  return order.source === 'whatsapp_form' && !!order.pickup_time && !isUpcoming(order);
}

function minutesSince(iso) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

function formatAge(mins) {
  return mins === 0 ? 'עכשיו' : `לפני ${mins} דק׳`;
}

// One entry per חלה unit across the order: { main: string[], cond: string[] }.
// Handles per-unit spreads (string[][]), the old flat format (string[]) and
// reception orders (spreads: []).
function challahUnits(order) {
  const units = [];
  for (const item of order.items) {
    if (item.menu_item !== CHALLAH_NAME) continue;
    const spreads = item.spreads ?? [];
    const perUnit = Array.isArray(spreads[0]);
    for (let i = 0; i < item.quantity; i++) {
      const chosen = perUnit ? (spreads[i] ?? []) : (i === 0 ? spreads : []);
      units.push({
        main: chosen.filter(s => !CONDIMENTS.has(s)),
        cond: chosen.filter(s =>  CONDIMENTS.has(s)),
      });
    }
  }
  return units;
}

// Active (not collected / cancelled) orders that contain at least one חלה, oldest first.
function challahOrders() {
  return state.orders
    .filter(o => o.status !== 'done' && o.status !== 'cancelled' && challahUnits(o).length > 0)
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '') || a.id - b.id);
}

// ─── rendering ────────────────────────────────────────────────────────────────

function renderAll() {
  const orders   = challahOrders();
  const pending  = orders.filter(o => !isReady(o));
  const active   = pending.filter(o => !isUpcoming(o));
  const upcoming = pending.filter(o =>  isUpcoming(o))
    .sort((a, b) => (a.pickup_time || '').localeCompare(b.pickup_time || ''));
  const done     = orders.filter(o => isReady(o));

  document.getElementById('active-cards').innerHTML = active.length
    ? active.map(o => buildCard(o, false)).join('')
    : '<div class="empty">אין חלות להכין ✓</div>';

  document.getElementById('upcoming-section').style.display = upcoming.length ? '' : 'none';
  document.getElementById('upcoming-cards').innerHTML = upcoming.map(o => buildCard(o, true)).join('');

  document.getElementById('done-section').style.display = done.length ? '' : 'none';
  document.getElementById('done-cards').innerHTML = done.map(buildDoneRow).join('');
}

function buildCard(order, upcoming) {
  const units = challahUnits(order);
  const age   = minutesSince(order.created_at);

  const unitsHtml = units.map((u, i) => `
    <div class="sp-unit">
      <span class="sp-unit-num">#${i + 1}</span>
      <div class="sp-unit-body">
        ${u.main.length
          ? `<div class="sp-spreads">${esc(u.main.join(' · '))}</div>`
          : '<div class="sp-ask">הלקוח יגיד בעמדה</div>'}
        ${u.cond.length ? `<span class="sp-cond">${esc(u.cond.join(' · '))}</span>` : ''}
      </div>
    </div>`).join('');

  const prepNow = !upcoming && isPrepNow(order);

  return `
    <div class="sp-card${upcoming ? ' upcoming' : ''}${prepNow ? ' prep' : ''}" id="sp-${order.id}">
      ${prepNow ? `<div class="sp-prep-now">⏰ להכין עכשיו – איסוף ${esc(order.pickup_time)}</div>` : ''}
      <div class="sp-top">
        <span class="sp-num">#${order.id}</span>
        <span class="sp-name">${esc(order.name)}</span>
        <span class="sp-age${age >= 15 ? ' old' : ''}">${formatAge(age)}</span>
        ${order.pickup_time ? `<span class="sp-pickup">🕐 איסוף ${esc(order.pickup_time)}</span>` : ''}
      </div>
      ${unitsHtml}
      ${order.note ? `<div class="sp-note">💬 ${esc(order.note)}</div>` : ''}
      <button class="sp-ready-btn" onclick="markReady(${order.id})">✓ מוכן</button>
    </div>`;
}

function buildDoneRow(order) {
  const n = challahUnits(order).length;
  return `
    <div class="sp-done">
      <span>#${order.id} ${esc(order.name)} — ${n} ${n === 1 ? 'חלה' : 'חלות'}</span>
      <button class="sp-undo-btn" onclick="undoReady(${order.id})">בטל</button>
    </div>`;
}

// ─── clock + periodic refresh ─────────────────────────────────────────────────

let lastMinute = null;

function tick() {
  const now = new Date();
  const el  = document.getElementById('current-time');
  if (el) el.textContent =
    `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  // Once a minute: refresh "time since ordered" and upcoming → active moves.
  if (now.getMinutes() !== lastMinute) {
    lastMinute = now.getMinutes();
    renderAll();
  }
}

// ─── Wake Lock (same as fryer) ────────────────────────────────────────────────

async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) {
    console.warn('Wake Lock:', e.message);
  }
}

// ─── connection indicator ─────────────────────────────────────────────────────

function setConnected(yes) {
  document.getElementById('conn-dot').className  = yes ? 'connected' : '';
  document.getElementById('conn-text').textContent = yes ? 'מחובר' : 'מנותק';
}

// ─── init ─────────────────────────────────────────────────────────────────────

async function init() {
  tick();

  const upTitle = document.getElementById('upcoming-title');
  if (upTitle) upTitle.textContent = `📅 הזמנות מראש — עוברות למעלה ${LEAD_MINUTES} דק׳ לפני האיסוף`;

  // Same loading path as the fryer: local cache first, then the server.
  try {
    const cached = await localDB.getByDate(TODAY);
    if (cached.length) { state.orders = cached; renderAll(); }
  } catch { /* IndexedDB unavailable */ }

  try {
    const orders = await api.get(`/api/orders?date=${TODAY}`);
    state.orders = orders;
    await localDB.putMany(orders);
    renderAll();
  } catch {
    console.warn('Server unavailable — showing local cache');
  }

  ws.on('order:created', order => {
    if (order.date !== TODAY) return;
    state.orders.push(order);
    localDB.put(order);
    renderAll();
  });

  ws.on('order:updated', order => {
    if (order.date !== TODAY) return;
    const i = state.orders.findIndex(o => o.id === order.id);
    if (i >= 0) state.orders[i] = order; else state.orders.push(order);
    localDB.put(order);
    renderAll();
  });

  ws.on('order:deleted', ({ id }) => {
    state.orders = state.orders.filter(o => o.id !== id);
    renderAll();
  });

  ws.on('orders:cleared', ({ date }) => {
    if (date !== TODAY) return;
    state.orders = state.orders.filter(o => o.status !== 'done');
    renderAll();
  });

  ws.on('demo:ended', ({ ids }) => {
    if (ids?.length) {
      state.orders = state.orders.filter(o => !ids.includes(o.id));
      renderAll();
    }
  });

  ws.on('_connected',    () => setConnected(true));
  ws.on('_disconnected', () => setConnected(false));
  ws.connect();

  setInterval(tick, 1000);

  await acquireWakeLock();
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') await acquireWakeLock();
  });
}

document.addEventListener('DOMContentLoaded', init);
