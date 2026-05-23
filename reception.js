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

// ── Time helpers ─────────────────────────────────────────────────────────────
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

// ── WhatsApp link ────────────────────────────────────────────────────────────
function buildWhatsAppLink(phone, name) {
  // Strip non-digits, remove leading 0, prepend 972
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = '972' + digits.slice(1);
  else if (!digits.startsWith('972')) digits = '972' + digits;

  const msg = `היי ${name}! ההזמנה שלך מוכנה לאיסוף 🍗 מגיעים?`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
}

// ── HTML escaping ────────────────────────────────────────────────────────────
function escH(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Alert banner: 10 min before any form order ───────────────────────────────
function renderAlertBanner(orders) {
  const banner = document.getElementById('alertBanner');

  // Form orders whose pickup is between now and 10 minutes from now (and still pending)
  const soon = orders.filter(o =>
    o.source     === 'form' &&
    o.status     === 'pending' &&
    o.pickupTime &&
    minutesUntil(o.pickupTime) <= 10 &&
    minutesUntil(o.pickupTime) > -15  // stop showing 15 min after overdue
  );

  if (soon.length === 0) {
    banner.style.display = 'none';
    banner.innerHTML     = '';
    return;
  }

  banner.style.display = 'block';
  banner.innerHTML = soon.map(o => `
    <div class="alert-item">
      <span class="alert-icon">🔔</span>
      <span class="alert-text">
        התחילו להכין! הזמנה של <strong>${escH(o.name)}</strong> לאיסוף ב-${escH(o.pickupTime)}
      </span>
    </div>
  `).join('');
}

// ── Main render ──────────────────────────────────────────────────────────────
function render() {
  const orders    = getOrders();
  const pending   = orders.filter(o => o.status === 'pending');
  const ready     = orders.filter(o => o.status === 'ready').slice(-5); // last 5 ready
  const container = document.getElementById('ordersContainer');

  renderAlertBanner(orders);

  if (pending.length === 0 && ready.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="emoji">🍗</div>
        <p>אין הזמנות פעילות</p>
      </div>`;
    return;
  }

  // Sort pending: form orders by pickup time first, then booth by createdAt
  const sortedPending = [...pending].sort((a, b) => {
    if (a.pickupTime && b.pickupTime) return a.pickupTime.localeCompare(b.pickupTime);
    if (a.pickupTime) return -1;
    if (b.pickupTime) return 1;
    return a.createdAt - b.createdAt;
  });

  let html = '';

  if (sortedPending.length > 0) {
    html += `<div class="section-title">הזמנות פעילות</div>`;
    html += sortedPending.map(order => buildCard(order, false)).join('');
  }

  if (ready.length > 0) {
    html += `<div class="section-title" style="margin-top:8px;">הכנת לאחרונה</div>`;
    html += ready.map(order => buildCard(order, true)).join('');
  }

  container.innerHTML = html;
}

function buildCard(order, isReady) {
  const isForm   = order.source === 'form';
  const isSoon   = isForm && order.pickupTime && !isReady &&
                   minutesUntil(order.pickupTime) <= 10 &&
                   minutesUntil(order.pickupTime) > -15;

  const metaHtml = order.pickupTime
    ? `<span class="pickup-time">⏰ איסוף: ${escH(order.pickupTime)}</span>`
    : `<span>${formatElapsed(order.createdAt)}</span>`;

  const phoneHtml = isForm && order.phone
    ? `<span class="phone-text">📞 ${escH(order.phone)}</span>`
    : '';

  let actionsHtml = '';
  if (!isReady) {
    if (isForm && order.phone) {
      // WhatsApp + Ready
      const waLink = buildWhatsAppLink(order.phone, order.name);
      actionsHtml = `
        <div class="actions">
          <a class="whatsapp-btn"
             href="${escH(waLink)}"
             target="_blank"
             rel="noopener"
             data-action="ready-wa"
             data-id="${escH(order.id)}">
            📲 מוכן + שלח
          </a>
        </div>`;
    } else {
      // Regular Ready button (booth orders)
      actionsHtml = `
        <div class="actions">
          <button class="ready-btn"
                  data-action="ready"
                  data-id="${escH(order.id)}">
            ✓ מוכן
          </button>
        </div>`;
    }
  } else {
    actionsHtml = `<span class="ready-label">✓ מוכן</span>`;
  }

  return `
    <div class="order-card source-${order.source}${isSoon ? ' alert-soon' : ''}${isReady ? ' ready-card' : ''}"
         id="rec-${escH(order.id)}">
      <div class="card-header">
        <div class="order-name">${escH(order.name)}</div>
        <span class="badge badge-${order.source}">${isForm ? '📱 טופס' : '🏪 דוכן'}</span>
      </div>
      <div class="order-items">${escH(order.items)}</div>
      <div class="card-footer">
        <div class="order-meta">
          ${metaHtml}
          ${phoneHtml}
        </div>
        ${actionsHtml}
      </div>
    </div>`;
}

// ── Mark order as ready ───────────────────────────────────────────────────────
function markReady(orderId) {
  const orders = getOrders();
  const idx    = orders.findIndex(o => o.id === orderId);
  if (idx !== -1) {
    orders[idx].status  = 'ready';
    orders[idx].readyAt = Date.now();
    saveOrders(orders);
  }
  render();
}

// ── Event delegation ─────────────────────────────────────────────────────────
document.getElementById('ordersContainer').addEventListener('click', e => {
  // Plain "מוכן" button (booth orders)
  const readyBtn = e.target.closest('[data-action="ready"]');
  if (readyBtn) {
    markReady(readyBtn.dataset.id);
    return;
  }

  // WhatsApp link — also mark as ready when clicked
  const waBtn = e.target.closest('[data-action="ready-wa"]');
  if (waBtn) {
    // Let the link open naturally; mark ready too
    setTimeout(() => markReady(waBtn.dataset.id), 300);
  }
});

// ── Cross-tab sync ───────────────────────────────────────────────────────────
if (bc) bc.onmessage = () => render();
window.addEventListener('storage', e => { if (e.key === STORAGE_KEY) render(); });

// ── Clock + periodic alert check ─────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent =
    String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
}

// Re-render every 30 seconds so alert banners appear on time
setInterval(() => { updateClock(); render(); }, 30000);

// ── Init ─────────────────────────────────────────────────────────────────────
updateClock();
render();
