// ── Storage helpers ─────────────────────────────────────────────────────────
const STORAGE_KEY = 'chicken_orders';

let bc;
try { bc = new BroadcastChannel('chicken_orders'); } catch(e) { bc = null; }

function getOrders() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch(e) { return []; }
}

function saveOrders(orders) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  bc && bc.postMessage({ type: 'orders_updated' });
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ── Time helpers ─────────────────────────────────────────────────────────────
/** Returns minutes until pickupTime ("HH:MM"). Negative = overdue. */
function minutesUntil(timeStr) {
  const now = new Date();
  const [h, m] = timeStr.split(':').map(Number);
  const t = new Date();
  t.setHours(h, m, 0, 0);
  return (t - now) / 60000;
}

function formatElapsed(createdAt) {
  const mins = Math.floor((Date.now() - createdAt) / 60000);
  if (mins < 1) return 'עכשיו';
  if (mins === 1) return 'לפני דקה';
  return `לפני ${mins} דקות`;
}

// ── Visibility logic ─────────────────────────────────────────────────────────
/**
 * Booth orders  → always visible (while pending).
 * Form orders   → visible only when ≤ 10 minutes before pickup time.
 *                 If no pickupTime, visible immediately.
 */
function isVisible(order, pendingReadyId) {
  if (order.status === 'ready') return false;
  if (order.id === pendingReadyId) return false; // hidden during undo window

  if (order.source === 'booth') return true;

  // form order
  if (!order.pickupTime) return true;
  return minutesUntil(order.pickupTime) <= 10;
}

/** Upcoming: form orders that haven't appeared yet */
function isUpcoming(order) {
  return (
    order.source === 'form' &&
    order.status === 'pending' &&
    order.pickupTime &&
    minutesUntil(order.pickupTime) > 10
  );
}

// ── Undo / Toast state ───────────────────────────────────────────────────────
let pendingReadyId = null;       // order being "confirmed ready" during undo window
let countdownInterval = null;
let countdownSecs = 5;

// ── Render ───────────────────────────────────────────────────────────────────
function escH(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderOrders() {
  const orders   = getOrders();
  const visible  = orders.filter(o => isVisible(o, pendingReadyId));
  const upcoming = orders.filter(isUpcoming);
  const grid     = document.getElementById('ordersGrid');

  // ── Upcoming bar ──────────────────────────────────────────────────────────
  const sec = document.getElementById('upcomingSection');
  const bar = document.getElementById('upcomingBar');
  if (upcoming.length > 0) {
    sec.style.display = 'block';
    bar.innerHTML = '📅 ממתינות להופיע: ' + upcoming.map(o => {
      const mins = Math.ceil(minutesUntil(o.pickupTime) - 10);
      return `<strong>${escH(o.name)}</strong> (איסוף ${o.pickupTime}, עוד ~${mins} דק')`;
    }).join(' &nbsp;|&nbsp; ');
  } else {
    sec.style.display = 'none';
  }

  // ── Order cards ───────────────────────────────────────────────────────────
  if (visible.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="emoji">🍗</div>
        <p>אין הזמנות כרגע</p>
      </div>`;
    return;
  }

  grid.innerHTML = visible.map(order => {
    const isForm = order.source === 'form';
    const metaText = order.pickupTime
      ? `<span class="pickup-highlight">⏰ איסוף: ${order.pickupTime}</span>`
      : `<span>${formatElapsed(order.createdAt)}</span>`;

    return `
      <div class="order-card source-${order.source}" id="card-${escH(order.id)}">
        <div class="card-header">
          <div class="order-name">${escH(order.name)}</div>
          <span class="badge badge-${order.source}">${isForm ? '📱 טופס' : '🏪 דוכן'}</span>
        </div>
        <div class="order-items">${escH(order.items)}</div>
        <div class="card-footer">
          <div class="order-meta">${metaText}</div>
          <button class="ready-btn"
            data-action="ready"
            data-id="${escH(order.id)}"
            data-name="${escH(order.name)}">
            ✓ מוכן
          </button>
        </div>
      </div>`;
  }).join('');
}

// ── Ready / Undo ─────────────────────────────────────────────────────────────
function markReady(orderId, orderName) {
  // Confirm any previous pending-ready order immediately
  if (pendingReadyId && pendingReadyId !== orderId) {
    confirmReady(pendingReadyId, false);
  }

  pendingReadyId = orderId;
  clearInterval(countdownInterval);
  countdownSecs = 5;

  renderOrders(); // hides the card immediately

  showToast(orderName);
}

function showToast(name) {
  const area = document.getElementById('toastArea');
  area.innerHTML = `
    <div class="toast" id="activeToast">
      <span class="toast-msg">✓ &nbsp;<strong>${escH(name)}</strong> — מוכן!</span>
      <button class="undo-btn" onclick="undoReady()">ביטול (<span id="toastCountdown">5</span>)</button>
    </div>`;

  document.getElementById('toastCountdown').textContent = countdownSecs;

  countdownInterval = setInterval(() => {
    countdownSecs--;
    const el = document.getElementById('toastCountdown');
    if (el) el.textContent = countdownSecs;
    if (countdownSecs <= 0) {
      clearInterval(countdownInterval);
      confirmReady(pendingReadyId, true);
    }
  }, 1000);
}

function undoReady() {
  clearInterval(countdownInterval);
  pendingReadyId = null;
  document.getElementById('toastArea').innerHTML = '';
  renderOrders(); // bring the card back
}

function confirmReady(orderId, hideToast) {
  clearInterval(countdownInterval);
  if (hideToast) document.getElementById('toastArea').innerHTML = '';

  const orders = getOrders();
  const idx = orders.findIndex(o => o.id === orderId);
  if (idx !== -1) {
    orders[idx].status  = 'ready';
    orders[idx].readyAt = Date.now();
    saveOrders(orders);
  }

  if (pendingReadyId === orderId) pendingReadyId = null;
  renderOrders();
}

// ── Event delegation on grid ─────────────────────────────────────────────────
document.getElementById('ordersGrid').addEventListener('click', e => {
  const btn = e.target.closest('[data-action="ready"]');
  if (btn) markReady(btn.dataset.id, btn.dataset.name);
});

// ── Booth modal ──────────────────────────────────────────────────────────────
function openBoothModal() {
  document.getElementById('boothModal').classList.add('open');
  document.getElementById('bName').focus();
}

function closeBoothModal() {
  document.getElementById('boothModal').classList.remove('open');
  document.getElementById('bName').value  = '';
  document.getElementById('bItems').value = '';
}

function addBoothOrder() {
  const name  = document.getElementById('bName').value.trim();
  const items = document.getElementById('bItems').value.trim();
  if (!name || !items) { alert('נא למלא שם ופרטי הזמנה'); return; }

  const order = {
    id:         generateId(),
    name,
    phone:      null,
    items,
    pickupTime: null,
    source:     'booth',
    status:     'pending',
    createdAt:  Date.now(),
    readyAt:    null,
  };

  const orders = getOrders();
  orders.push(order);
  saveOrders(orders);
  closeBoothModal();
  renderOrders();
}

// Allow closing modal with Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeBoothModal();
});

// ── Cross-tab sync ───────────────────────────────────────────────────────────
if (bc) bc.onmessage = () => renderOrders();
window.addEventListener('storage', e => { if (e.key === STORAGE_KEY) renderOrders(); });

// ── Clock ────────────────────────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent =
    String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
}

// ── Periodic re-render (form orders appear at right time) ────────────────────
setInterval(() => { updateClock(); renderOrders(); }, 30000);

// ── Init ─────────────────────────────────────────────────────────────────────
updateClock();
renderOrders();
