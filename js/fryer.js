// Fryer screen — Tablet 2.
// Display-only except for the single "מוכן" action (בהכנה → מוכן).
// Principle: no need to touch the screen. Everything updates via WebSocket.

const TODAY = new Date().toISOString().slice(0, 10);

// ─── state ────────────────────────────────────────────────────────────────────

const state = { orders: [] };

let wakeLock = null;

// Set of drink names for fast filtering (drinks are not shown on fryer screen)
const DRINK_NAMES = new Set(MENU.drinks.map(d => d.name));

// ─── derived data ─────────────────────────────────────────────────────────────

// Orders the fryer cares about: waiting or cooking, with at least one food item
function activeOrders() {
  return state.orders.filter(o =>
    (o.status === 'waiting' || o.status === 'cooking') &&
    o.items.some(item => !DRINK_NAMES.has(item.menu_item))
  );
}

// Sum food items across all active orders, preserving menu display order
function aggregateFood() {
  const counts = new Map();
  for (const o of activeOrders()) {
    for (const item of o.items) {
      if (DRINK_NAMES.has(item.menu_item)) continue;
      counts.set(item.menu_item, (counts.get(item.menu_item) || 0) + item.quantity);
    }
  }
  const menuOrder = MENU.food.map(f => f.name);
  return [...counts.entries()].sort((a, b) => {
    const ia = menuOrder.indexOf(a[0]);
    const ib = menuOrder.indexOf(b[0]);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}

function urgentOrders() {
  return activeOrders()
    .filter(o => { const m = minutesUntil(o.pickup_time); return m !== null && m <= 10; })
    .sort((a, b) => minutesUntil(a.pickup_time) - minutesUntil(b.pickup_time));
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function minutesUntil(timeStr) {
  if (!timeStr) return null;
  const now = new Date();
  const [h, m] = timeStr.split(':').map(Number);
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
  return Math.floor((t - now) / 60000);
}

function formatCountdown(mins) {
  if (mins === null) return '';
  if (mins < 0)  return `${Math.abs(mins)} דק׳ איחור`;
  if (mins === 0) return 'עכשיו!';
  return `${mins} דק׳`;
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── action ───────────────────────────────────────────────────────────────────

async function markReady(id, btn) {
  if (btn) btn.disabled = true;
  try {
    await api.patch(`/api/orders/${id}`, { status: 'ready' });
    // Card disappears on the next WebSocket order:updated broadcast
  } catch {
    if (btn) btn.disabled = false;
  }
}

// ─── rendering ────────────────────────────────────────────────────────────────

function renderAll() {
  renderBackground();
  renderAggregate();
  renderCards();
  renderUrgentBar();
}

function renderBackground() {
  document.body.classList.toggle('urgent-bg', urgentOrders().length > 0);
}

function renderAggregate() {
  const items = aggregateFood();
  const el = document.getElementById('aggregate-section');

  if (items.length === 0) {
    el.innerHTML = '<div class="section-title">להכין עכשיו</div><div class="agg-empty">אין מנות להכין ✓</div>';
    return;
  }

  const rows = items.map(([name, count]) => {
    const def = MENU.food.find(f => f.name === name);
    return `
      <div class="agg-row">
        <span class="agg-emoji">${def?.emoji ?? ''}</span>
        <span class="agg-name">${esc(name)}</span>
        <span class="agg-count">×${count}</span>
      </div>`;
  }).join('');

  el.innerHTML = `<div class="section-title">להכין עכשיו</div>${rows}`;
}

function renderCards() {
  const orders = activeOrders();
  const el = document.getElementById('orders-section');

  if (orders.length === 0) {
    el.innerHTML = '<div class="cards-empty">אין הזמנות פעילות ⏳</div>';
    return;
  }

  // Cooking first (fryer is actively working on them), then waiting (queue)
  const sorted = [...orders].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'cooking' ? -1 : 1;
    return a.id - b.id;
  });

  el.innerHTML = sorted.map(buildCard).join('');
}

function buildCard(order) {
  const mins       = minutesUntil(order.pickup_time);
  const isUrgent   = mins !== null && mins <= 10;
  const isCooking  = order.status === 'cooking';

  const foodItems  = order.items.filter(item => !DRINK_NAMES.has(item.menu_item));

  const cardClass  = ['fryer-card',
    isCooking ? 'card-cooking' : '',
    isUrgent  ? 'card-urgent'  : '',
  ].filter(Boolean).join(' ');

  const badgeClass = isCooking ? 'status-badge badge-cooking' : 'status-badge badge-waiting';
  const badgeLabel = isCooking ? 'בהכנה' : 'ממתין';

  const itemsHtml = foodItems.map(item => `
    <div>
      ${item.quantity > 1 ? `<span class="card-item-qty">${item.quantity}×</span> ` : ''}${esc(item.menu_item)}
    </div>`).join('');

  const timerClass = isUrgent ? 'card-timer urgent' : 'card-timer';
  const pickupHtml = order.pickup_time
    ? `<div class="card-pickup">🕐 ${order.pickup_time}<span id="ftimer-${order.id}" class="${timerClass}"> ${formatCountdown(mins)}</span></div>`
    : '';

  // "מוכן" button only for cooking orders — this is the fryer's sole action
  const readyBtn = isCooking
    ? `<button class="ready-btn" onclick="markReady(${order.id}, this)">✓ מוכן</button>`
    : '';

  return `
    <div class="${cardClass}" id="fcard-${order.id}">
      <div class="card-top">
        <span class="card-num">#${order.id}</span>
        <span class="card-name">${esc(order.name)}</span>
        <span class="${badgeClass}">${badgeLabel}</span>
      </div>
      <div class="card-items">${itemsHtml}</div>
      ${pickupHtml}
      ${readyBtn}
    </div>`;
}

function renderUrgentBar() {
  const urgent = urgentOrders();
  const bar    = document.getElementById('urgent-bar');
  const rows   = document.getElementById('urgent-rows');

  if (urgent.length === 0) {
    bar.classList.remove('visible');
    return;
  }

  rows.innerHTML = urgent.map(o => {
    const mins = minutesUntil(o.pickup_time);
    return `<div class="urgent-row">הזמנה #${o.id} — ${esc(o.name)} — <span id="ualert-${o.id}">${formatCountdown(mins)}</span></div>`;
  }).join('');

  bar.classList.add('visible');
}

// ─── timer tick (every 1s) ────────────────────────────────────────────────────

// Tracks previous urgency to detect threshold crossings without full re-renders
const prevUrgent = new Map();

function tickTimers() {
  // Update clock
  const now = new Date();
  const el  = document.getElementById('current-time');
  if (el) el.textContent =
    `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  let needRerender = false;

  for (const o of activeOrders()) {
    if (!o.pickup_time) continue;

    const mins      = minutesUntil(o.pickup_time);
    const isNowUrg  = mins !== null && mins <= 10;

    if (prevUrgent.get(o.id) !== isNowUrg) {
      prevUrgent.set(o.id, isNowUrg);
      needRerender = true;
    }

    // In-place timer updates (avoid thrashing the DOM)
    const timerEl = document.getElementById(`ftimer-${o.id}`);
    if (timerEl) {
      timerEl.textContent = ` ${formatCountdown(mins)}`;
      timerEl.className   = isNowUrg ? 'card-timer urgent' : 'card-timer';
    }
    const alertEl = document.getElementById(`ualert-${o.id}`);
    if (alertEl) alertEl.textContent = formatCountdown(mins);
  }

  if (needRerender) renderAll();
}

// ─── Wake Lock ────────────────────────────────────────────────────────────────

async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) {
    // Wake Lock unavailable (file://, non-HTTPS, low battery) — not critical
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
  // Show clock immediately
  tickTimers();

  // Render from local cache first (instant, no flash)
  try {
    const cached = await localDB.getByDate(TODAY);
    if (cached.length) { state.orders = cached; renderAll(); }
  } catch { /* IndexedDB unavailable */ }

  // Fetch authoritative state from server
  try {
    const orders = await api.get(`/api/orders?date=${TODAY}`);
    state.orders = orders;
    await localDB.putMany(orders);
    renderAll();
  } catch {
    console.warn('Server unavailable — showing local cache');
  }

  // Live updates via WebSocket
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

  ws.on('_connected',    () => setConnected(true));
  ws.on('_disconnected', () => setConnected(false));
  ws.connect();

  // 1s tick: clock + countdown timers
  setInterval(tickTimers, 1000);

  // Wake Lock: keep the screen on
  await acquireWakeLock();
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') await acquireWakeLock();
  });
}

document.addEventListener('DOMContentLoaded', init);
