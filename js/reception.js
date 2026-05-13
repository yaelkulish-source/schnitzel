// Reception screen — Tablet 1.

const TODAY = new Date().toISOString().slice(0, 10);

// ─── state ────────────────────────────────────────────────────────────────────

const state = {
  orders:       [],
  tab:          'active',
  historyDates: [],
  historyDate:  null,
  boothOpen:    false,
};

let pendingCollectId = null;

const cartQty    = new Map();
const prevUrgent = new Map();

// ─── pure helpers ─────────────────────────────────────────────────────────────

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

function formatCountdown(mins) {
  if (mins === null) return '';
  if (mins < 0)  return `${Math.abs(mins)} דק׳ איחור`;
  if (mins === 0) return 'עכשיו!';
  return `${mins} דק׳`;
}

function toWaPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('972')) return d;
  if (d.startsWith('0'))   return '972' + d.slice(1);
  return d;
}

function formatDateHe(dateStr) {
  return new Intl.DateTimeFormat('he-IL', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }).format(new Date(dateStr + 'T12:00:00'));
}

const STATUS_LABEL = { waiting: 'ממתין', cooking: 'בהכנה', ready: 'מוכן', done: 'נאסף' };
const PAY_LABEL    = { cash: 'מזומן', bit: 'ביט', paybox: 'פייבוקס', pending: 'לא שולם' };

function isPayActive(order, method) {
  return method === 'pending' ? !order.paid : (order.paid && order.payment_method === method);
}

// ─── cart ─────────────────────────────────────────────────────────────────────

function cartAdd(itemId) {
  cartQty.set(itemId, (cartQty.get(itemId) || 0) + 1);
  document.querySelector(`[data-item-id="${itemId}"]`)?.classList.add('selected');
  renderCart();
  refreshSubmitBtn();
}

function cartChange(itemId, delta) {
  const q = (cartQty.get(itemId) || 0) + delta;
  if (q <= 0) {
    cartQty.delete(itemId);
    document.querySelector(`[data-item-id="${itemId}"]`)?.classList.remove('selected');
  } else {
    cartQty.set(itemId, q);
  }
  renderCart();
  refreshSubmitBtn();
}

function cartReset() {
  cartQty.clear();
  document.querySelectorAll('.menu-item-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('order-name').value = '';
  document.getElementById('order-note').value = '';
  renderCart();
  refreshSubmitBtn();
}

function cartTotal() {
  let total = 0;
  for (const [id, qty] of cartQty) {
    const item = MENU.byId[id];
    if (item) total += item.price * qty;
  }
  return total;
}

function cartToItems() {
  const items = [];
  for (const [id, qty] of cartQty) {
    const item = MENU.byId[id];
    if (item) items.push({ menu_item: item.name, price: item.price, quantity: qty, spreads: [] });
  }
  return items;
}

function renderCart() {
  const cartEl  = document.getElementById('cart');
  const totalEl = document.getElementById('cart-total');
  if (cartQty.size === 0) {
    cartEl.innerHTML = '<div id="cart-empty">לא נבחרו פריטים</div>';
    totalEl.textContent = '';
    return;
  }
  let html = '';
  for (const [id, qty] of cartQty) {
    const item = MENU.byId[id];
    if (!item) continue;
    html += `
      <div class="cart-row">
        <span class="cart-name">${esc(item.name)}</span>
        <div class="qty-control">
          <button class="qty-btn" onclick="cartChange('${id}',-1)">−</button>
          <span class="qty-value">${qty}</span>
          <button class="qty-btn" onclick="cartChange('${id}',1)">+</button>
        </div>
        <span class="cart-price">${item.price * qty}₪</span>
      </div>`;
  }
  cartEl.innerHTML = html;
  totalEl.innerHTML = `<strong>סה"כ: ${cartTotal()}₪</strong>`;
}

function refreshSubmitBtn() {
  const name = document.getElementById('order-name').value.trim();
  document.getElementById('submit-order-btn').disabled = !name || cartQty.size === 0;
}

// ─── menu grid ────────────────────────────────────────────────────────────────

function renderMenuGrid() {
  renderItemGroup('food-grid',   MENU.food);
  renderItemGroup('drinks-grid', MENU.drinks);
}

function renderItemGroup(containerId, items) {
  document.getElementById(containerId).innerHTML = items.map(item => `
    <button class="menu-item-btn" data-item-id="${item.id}" onclick="onMenuItemClick('${item.id}')">
      <span class="item-emoji">${item.emoji}</span>
      <span class="item-name">${esc(item.name)}</span>
      ${item.desc ? `<span class="item-desc">${esc(item.desc)}</span>` : ''}
      <span class="item-price">${item.price}₪</span>
    </button>`).join('');
}

function onMenuItemClick(itemId) {
  cartAdd(itemId);
}

// ─── submit new order ─────────────────────────────────────────────────────────

async function submitOrder() {
  const name  = document.getElementById('order-name').value.trim();
  const note  = document.getElementById('order-note').value.trim();
  const items = cartToItems();
  const total = cartTotal();
  if (!name || !items.length) return;

  const btn = document.getElementById('submit-order-btn');
  btn.disabled = true;
  btn.textContent = 'שולח…';

  try {
    await api.post('/api/orders', { name, note, items, total, source: 'walk_in' });
    cartReset();
    // Card appears via the WebSocket order:created broadcast.
  } catch (e) {
    alert('שגיאה בשמירת הזמנה: ' + e.message);
    refreshSubmitBtn();
  } finally {
    btn.textContent = '➕ הוסף הזמנה';
  }
}

// ─── order actions ────────────────────────────────────────────────────────────

async function changeStatus(id, status) {
  if (status === 'done') {
    showPaymentPopup(id);
    return;
  }
  try {
    await api.patch(`/api/orders/${id}`, { status });
  } catch { alert('שגיאה בעדכון סטטוס'); }
}

async function changePayment(id, method) {
  try {
    await api.patch(`/api/orders/${id}`, {
      payment_method: method,
      paid: method !== 'pending',
    });
  } catch { alert('שגיאה בעדכון תשלום'); }
}

function sendWhatsAppUpdate(id) {
  const order = state.orders.find(o => o.id === id);
  if (!order) return;
  const phone = toWaPhone(order.phone);
  if (!phone) { alert('לא נמצא מספר טלפון'); return; }
  const text = encodeURIComponent(`היי ${order.name}, הזמנה מספר ${order.id} מוכנה לאיסוף! 🥩`);
  window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
}

function sendReminder(id) {
  const order = state.orders.find(o => o.id === id);
  if (!order) return;
  const phone = toWaPhone(order.phone);
  if (!phone) { alert('לא נמצא מספר טלפון'); return; }
  const text = encodeURIComponent(`היי ${order.name}, תזכורת: הזמנה מספר ${order.id} תהיה מוכנה לאיסוף בשעה ${order.pickup_time} 🥩`);
  window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
}

async function cancelOrder(id, name) {
  if (!confirm(`לבטל את הזמנה #${id} של ${name}?`)) return;
  try {
    await api.patch(`/api/orders/${id}`, { status: 'cancelled' });
  } catch { alert('שגיאה בביטול הזמנה'); }
}

async function deleteOrder(id, name) {
  if (!confirm(`למחוק את הזמנה #${id} של ${name}?\nפעולה זו אינה הפיכה.`)) return;
  try {
    await api.delete(`/api/orders/${id}`);
  } catch { alert('שגיאה במחיקת הזמנה'); }
}

async function clearCompleted() {
  const done = state.orders.filter(o => o.status === 'done');
  if (!done.length) { alert('אין הזמנות שהושלמו למחיקה'); return; }
  if (!confirm(`למחוק את כל ${done.length} ההזמנות שהושלמו היום?`)) return;
  if (!confirm('אישור סופי: המחיקה אינה הפיכה. להמשיך?')) return;
  try {
    await api.delete(`/api/orders/completed?date=${TODAY}`);
  } catch { alert('שגיאה בניקוי הזמנות'); }
}

// ─── payment popup ────────────────────────────────────────────────────────────

function showPaymentPopup(id) {
  pendingCollectId = id;
  document.getElementById('payment-modal').classList.remove('hidden');
}

function closePaymentModal() {
  pendingCollectId = null;
  document.getElementById('payment-modal').classList.add('hidden');
}

async function collectWithPayment(method) {
  const id = pendingCollectId;
  closePaymentModal();
  if (id === null) return;
  try {
    if (method === 'later') {
      await api.patch(`/api/orders/${id}`, { status: 'done', paid: false, payment_method: 'pending' });
    } else {
      await api.patch(`/api/orders/${id}`, { status: 'done', paid: true, payment_method: method });
    }
  } catch { alert('שגיאה בעדכון הזמנה'); }
}

// ─── booth toggle ─────────────────────────────────────────────────────────────

async function toggleBooth() {
  try {
    await api.patch('/api/booth', { open: !state.boothOpen });
    // state.boothOpen updated via WS booth:updated broadcast
  } catch { alert('שגיאה בעדכון מצב הדוכן'); }
}

function renderBoothToggle() {
  const btn = document.getElementById('booth-toggle-btn');
  if (!btn) return;
  if (state.boothOpen) {
    btn.textContent = '🟢 דוכן פתוח';
    btn.className = 'btn booth-toggle booth-open';
  } else {
    btn.textContent = '🔴 דוכן סגור';
    btn.className = 'btn booth-toggle booth-closed';
  }
}

// ─── sorting ──────────────────────────────────────────────────────────────────

function sortedActive() {
  return state.orders
    .filter(o => o.status !== 'done' && o.status !== 'cancelled')
    .sort((a, b) => {
      const mA = minutesUntil(a.pickup_time);
      const mB = minutesUntil(b.pickup_time);
      const urgA = mA !== null && mA <= 10;
      const urgB = mB !== null && mB <= 10;
      const advA = mA !== null && !urgA;
      const advB = mB !== null && !urgB;

      if (urgA && !urgB) return -1;
      if (!urgA && urgB) return 1;
      if (urgA && urgB)  return mA - mB;

      if (advA && !advB) return -1;
      if (!advA && advB) return 1;
      if (advA && advB)  return (a.pickup_time || '').localeCompare(b.pickup_time || '');

      return a.id - b.id;
    });
}

// ─── rendering ────────────────────────────────────────────────────────────────

function renderAll() {
  renderStats();
  if (state.tab === 'active')    renderOrderGrid('orders-list',    sortedActive(), 'active');
  if (state.tab === 'completed') renderOrderGrid('completed-list', state.orders.filter(o => o.status === 'done'), 'completed');
  updateCompletedBadge();
}

function renderStats() {
  const orders  = state.orders;
  const active  = orders.filter(o => o.status !== 'done' && o.status !== 'cancelled');
  const cooking = orders.filter(o => o.status === 'cooking').length;
  const ready   = orders.filter(o => o.status === 'ready').length;

  let revTotal = 0, revCash = 0, revBit = 0, revPaybox = 0, revPending = 0;
  for (const o of orders) {
    if (o.status === 'cancelled') continue;
    if (o.paid) {
      revTotal += o.total;
      if (o.payment_method === 'cash')   revCash   += o.total;
      if (o.payment_method === 'bit')    revBit    += o.total;
      if (o.payment_method === 'paybox') revPaybox += o.total;
    } else {
      revPending += o.total;
    }
  }

  document.getElementById('header-stats').innerHTML = `
    <div class="stat-item"><div class="stat-value">${active.length}</div><div class="stat-label">פעילות</div></div>
    <div class="stat-item"><div class="stat-value">${cooking}</div><div class="stat-label">בהכנה</div></div>
    <div class="stat-item"><div class="stat-value">${ready}</div><div class="stat-label">מוכן</div></div>
    <div class="stat-item"><div class="stat-value">${revTotal}₪</div><div class="stat-label">הכנסה</div></div>`;

  document.getElementById('header-revenue').innerHTML = `
    <span class="rev-item">מזומן: ${revCash}₪</span>
    <span class="rev-item">ביט: ${revBit}₪</span>
    <span class="rev-item">פייבוקס: ${revPaybox}₪</span>
    <span class="rev-item rev-pending">ממתין: ${revPending}₪</span>`;
}

// mode: 'active' | 'completed' | 'history'
function renderOrderGrid(containerId, orders, mode) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!orders.length) {
    el.innerHTML = '<div class="empty-state">אין הזמנות</div>';
    return;
  }
  el.innerHTML = orders.map(o => buildCard(o, mode)).join('');
}

function buildCard(order, mode) {
  const mins        = minutesUntil(order.pickup_time);
  const isCancelled = order.status === 'cancelled';
  const isUrgent    = mins !== null && mins <= 10 && order.status !== 'done' && !isCancelled;
  const isReady     = order.status === 'ready';
  const isWa        = order.source === 'whatsapp_form';
  const isUnpaid    = order.status === 'done' && !order.paid;

  const cardClass = ['order-card',
    isUrgent    ? 'card-urgent'    : '',
    isReady     ? 'card-ready'     : '',
    isCancelled ? 'card-cancelled' : '',
  ].filter(Boolean).join(' ');

  const itemsHtml = order.items.map(item => `
    <div class="card-item">
      ${item.quantity}× ${esc(item.menu_item)} — ${item.price * item.quantity}₪
      ${item.spreads?.length ? `<div class="card-item-spreads">${esc(item.spreads.join(' · '))}</div>` : ''}
    </div>`).join('');

  const timerClass = isUrgent ? 'meta-timer urgent' : 'meta-timer';
  const metaParts  = [
    `<span class="meta-total">${order.total}₪</span>`,
    order.pickup_time ? `<span class="meta-pickup">🕐 ${order.pickup_time}</span>` : '',
    order.pickup_time ? `<span id="timer-${order.id}" class="${timerClass}">${formatCountdown(mins)}</span>` : '',
    order.note ? `<span class="meta-note">💬 ${esc(order.note)}</span>` : '',
  ].filter(Boolean).join('');

  let statusHtml = '';
  if (mode === 'active') {
    statusHtml = `
      <div class="status-buttons">
        ${['waiting','cooking','ready','done'].map(s => `
          <button class="status-btn${order.status === s ? ' s-active' : ''}"
            data-status="${s}"
            onclick="changeStatus(${order.id},'${s}')"
            ${order.status === s ? 'disabled' : ''}>
            ${STATUS_LABEL[s]}
          </button>`).join('')}
      </div>`;
  }

  let payHtml = '';
  if (mode === 'active') {
    payHtml = `
      <div class="payment-row">
        ${['cash','bit','paybox','pending'].map(m => `
          <button class="pay-btn${isPayActive(order, m) ? ' p-active' : ''}"
            data-pay="${m}"
            onclick="changePayment(${order.id},'${m}')">${PAY_LABEL[m]}</button>`).join('')}
        ${isWa && isReady ? `<button class="whatsapp-btn" onclick="sendWhatsAppUpdate(${order.id})">📱 עדכן לקוח</button>` : ''}
        ${order.pickup_time ? `
          <button id="reminder-${order.id}" class="reminder-btn"
            style="display:${mins !== null && mins > 0 && mins <= 10 ? '' : 'none'}"
            onclick="sendReminder(${order.id})">🔔 תזכורת</button>` : ''}
      </div>`;
  } else if (mode === 'completed') {
    if (isUnpaid) {
      payHtml = `
        <div class="payment-row">
          ${['cash','bit','paybox'].map(m => `
            <button class="pay-btn" data-pay="${m}"
              onclick="changePayment(${order.id},'${m}')">${PAY_LABEL[m]}</button>`).join('')}
        </div>`;
    } else {
      payHtml = `
        <div class="payment-row">
          <span class="pay-display is-paid">${PAY_LABEL[order.payment_method] || ''} ✓</span>
        </div>`;
    }
  } else {
    // history — read-only
    payHtml = `
      <div class="payment-row">
        <span class="pay-display ${order.paid ? 'is-paid' : 'is-pending'}">
          ${PAY_LABEL[order.payment_method] || 'לא שולם'}${order.paid ? ' ✓' : ''}
        </span>
      </div>`;
  }

  const cancelBtn = (mode === 'active' && !isCancelled)
    ? `<button class="cancel-order-btn" onclick="cancelOrder(${order.id},'${esc(order.name)}')">ביטול הזמנה</button>`
    : '';

  const deleteBtn = (mode === 'completed')
    ? `<button class="delete-order-btn" onclick="deleteOrder(${order.id},'${esc(order.name)}')">🗑 מחק</button>`
    : '';

  return `
    <div class="${cardClass}" id="card-${order.id}">
      <div class="card-header">
        <span class="order-num">#${order.id}</span>
        <span class="order-name">${esc(order.name)}</span>
        <span class="order-source${isWa ? ' wa' : ''}">${isWa ? 'ווצאפ' : 'דוכן'}</span>
        ${isUrgent    ? '<span class="urgent-badge">⚠️ דחוף!</span>'  : ''}
        ${isCancelled ? '<span class="cancelled-badge">בוטל</span>'   : ''}
        ${isUnpaid    ? '<span class="unpaid-badge">ממתין לתשלום</span>' : ''}
      </div>
      <div class="card-items">${itemsHtml}</div>
      <div class="card-meta">${metaParts}</div>
      ${statusHtml}
      ${payHtml}
      ${cancelBtn}
      ${deleteBtn}
    </div>`;
}

function updateCompletedBadge() {
  const n = state.orders.filter(o => o.status === 'done').length;
  const el = document.getElementById('completed-count');
  if (el) el.textContent = n > 0 ? `(${n})` : '';
}

// ─── timer tick (every 1s) ────────────────────────────────────────────────────

function tickTimers() {
  let needRerender = false;

  for (const order of state.orders) {
    if (!order.pickup_time || order.status === 'done' || order.status === 'cancelled') continue;

    const mins     = minutesUntil(order.pickup_time);
    const isNowUrg = mins !== null && mins <= 10;
    const wasUrg   = prevUrgent.get(order.id);

    if (wasUrg !== isNowUrg) {
      prevUrgent.set(order.id, isNowUrg);
      needRerender = true;
    }

    const timerEl = document.getElementById(`timer-${order.id}`);
    if (timerEl) {
      timerEl.textContent = formatCountdown(mins);
      timerEl.className   = isNowUrg ? 'meta-timer urgent' : 'meta-timer';
    }

    const remBtn = document.getElementById(`reminder-${order.id}`);
    if (remBtn) remBtn.style.display = (mins !== null && mins > 0 && mins <= 10) ? '' : 'none';
  }

  if (needRerender && state.tab === 'active') {
    renderOrderGrid('orders-list', sortedActive(), 'active');
  }
}

// ─── tabs ─────────────────────────────────────────────────────────────────────

function switchTab(tab) {
  state.tab = tab;

  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab));

  document.getElementById('active-tab-content').classList.toggle('hidden',    tab !== 'active');
  document.getElementById('completed-tab-content').classList.toggle('hidden', tab !== 'completed');
  document.getElementById('history-tab-content').classList.toggle('hidden',   tab !== 'history');

  document.getElementById('form-panel').style.display = tab === 'active' ? '' : 'none';
  document.getElementById('main-layout').classList.toggle('form-hidden', tab !== 'active');

  if (tab === 'completed') renderOrderGrid('completed-list', state.orders.filter(o => o.status === 'done'), 'completed');
  if (tab === 'history')   loadHistoryDates();
}

// ─── history ──────────────────────────────────────────────────────────────────

async function loadHistoryDates() {
  try {
    const all = await api.get('/api/orders/dates');
    state.historyDates = all.filter(d => d !== TODAY);
    renderHistoryDateList();
  } catch {
    document.getElementById('history-dates').innerHTML = '<div class="empty-state">שגיאה בטעינת היסטוריה</div>';
  }
}

function renderHistoryDateList() {
  const el = document.getElementById('history-dates');
  if (!state.historyDates.length) {
    el.innerHTML = '<div class="empty-state">אין ימים קודמים</div>';
    return;
  }
  el.innerHTML = `<div class="history-date-list">${
    state.historyDates.map(d => `
      <button class="history-date-btn${state.historyDate === d ? ' active' : ''}"
        onclick="loadHistoryDay('${d}')">${formatDateHe(d)}</button>`).join('')
  }</div>`;
}

async function loadHistoryDay(date) {
  state.historyDate = date;
  renderHistoryDateList();

  const contentEl = document.getElementById('history-content');
  contentEl.innerHTML = '<div class="empty-state">טוען…</div>';

  try {
    const [orders, summary] = await Promise.all([
      api.get(`/api/orders?date=${date}`),
      api.get(`/api/orders/summary?date=${date}`),
    ]);

    const itemRows = Object.entries(summary.item_counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, n]) => `<div class="summary-row"><span>${esc(name)}</span><span>×${n}</span></div>`)
      .join('');

    contentEl.innerHTML = `
      <div class="history-summary">
        <h3>${formatDateHe(date)}</h3>
        <div class="summary-row"><span>סה"כ הזמנות</span><strong>${summary.total_orders}</strong></div>
        <div class="summary-row"><span>הכנסה כוללת</span><strong>${summary.revenue.total}₪</strong></div>
        <div class="summary-row"><span>מזומן</span><span>${summary.revenue.cash}₪</span></div>
        <div class="summary-row"><span>ביט</span><span>${summary.revenue.bit}₪</span></div>
        <div class="summary-row"><span>פייבוקס</span><span>${summary.revenue.paybox}₪</span></div>
        <div class="summary-row"><span>ממתין לתשלום</span><span>${summary.revenue.pending}₪</span></div>
        ${itemRows ? `<div style="margin-top:10px">${itemRows}</div>` : ''}
      </div>
      <div class="orders-grid" id="history-orders"></div>`;

    renderOrderGrid('history-orders', orders, 'history');
  } catch {
    contentEl.innerHTML = '<div class="empty-state">שגיאה בטעינת יום</div>';
  }
}

// ─── daily summary modal ──────────────────────────────────────────────────────

async function showDailySummary() {
  try {
    const s = await api.get(`/api/orders/summary?date=${TODAY}`);

    const itemRows = Object.entries(s.item_counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, n]) => `<div class="summary-row"><span>${esc(name)}</span><span>×${n}</span></div>`)
      .join('');

    const totalDishes = Object.values(s.item_counts).reduce((a, b) => a + b, 0);

    document.getElementById('summary-content').innerHTML = `
      <div class="summary-section">
        <h3>הזמנות</h3>
        <div class="summary-row"><span>סה"כ הזמנות</span><span>${s.total_orders}</span></div>
        <div class="summary-row"><span>סה"כ מנות</span><span>${totalDishes}</span></div>
        <div class="summary-row"><span>הושלמו</span><span>${s.done}</span></div>
        <div class="summary-row"><span>ממתינות / בהכנה / מוכן</span>
          <span>${s.waiting} / ${s.cooking} / ${s.ready}</span></div>
      </div>
      <div class="summary-section">
        <h3>הכנסות</h3>
        <div class="summary-row"><span>מזומן</span><span>${s.revenue.cash}₪</span></div>
        <div class="summary-row"><span>ביט</span><span>${s.revenue.bit}₪</span></div>
        <div class="summary-row"><span>פייבוקס</span><span>${s.revenue.paybox}₪</span></div>
        <div class="summary-row total-row"><span>סה"כ</span><span>${s.revenue.total}₪</span></div>
        <div class="summary-row"><span>ממתין לתשלום</span><span>${s.revenue.pending}₪</span></div>
      </div>
      ${itemRows ? `<div class="summary-section"><h3>כמות לפי פריט</h3>${itemRows}</div>` : ''}`;

    document.getElementById('summary-modal').classList.remove('hidden');
  } catch {
    alert('שגיאה בטעינת סיכום');
  }
}

// ─── manual backup ────────────────────────────────────────────────────────────

function downloadBackup() {
  const blob = new Blob(['﻿' + JSON.stringify(state.orders, null, 2)],
    { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a   = Object.assign(document.createElement('a'), { href: url, download: `schnitzel-${TODAY}.json` });
  a.click();
  URL.revokeObjectURL(url);
}

// ─── connection indicator ─────────────────────────────────────────────────────

function setConnected(yes) {
  document.getElementById('connection-dot').className    = yes ? 'connected' : '';
  document.getElementById('connection-text').textContent = yes ? 'מחובר' : 'מנותק';
}

// ─── init ─────────────────────────────────────────────────────────────────────

async function init() {
  document.getElementById('header-date').textContent = formatDateHe(TODAY);
  renderMenuGrid();
  renderStats();

  document.getElementById('order-name').addEventListener('input', refreshSubmitBtn);
  document.getElementById('submit-order-btn').addEventListener('click', submitOrder);
  document.getElementById('summary-btn').addEventListener('click', showDailySummary);
  document.getElementById('backup-btn').addEventListener('click', downloadBackup);
  document.getElementById('booth-toggle-btn').addEventListener('click', toggleBooth);
  document.getElementById('clear-completed-btn').addEventListener('click', clearCompleted);
  document.getElementById('modal-close').addEventListener('click', () =>
    document.getElementById('summary-modal').classList.add('hidden'));
  document.getElementById('summary-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
  });
  document.getElementById('payment-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closePaymentModal();
  });

  document.querySelectorAll('.tab-btn').forEach(btn =>
    btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

  // Load booth state
  try {
    const booth = await api.get('/api/booth');
    state.boothOpen = booth.open;
    renderBoothToggle();
  } catch { renderBoothToggle(); }

  // Load from local IndexedDB cache first (instant render)
  try {
    const cached = await localDB.getByDate(TODAY);
    if (cached.length) { state.orders = cached; renderAll(); }
  } catch { /* IndexedDB unavailable */ }

  // Fetch authoritative data from server
  try {
    const orders = await api.get(`/api/orders?date=${TODAY}`);
    state.orders = orders;
    await localDB.putMany(orders);
    renderAll();
  } catch {
    console.warn('Server unavailable — showing local cache');
  }

  // WebSocket: live updates
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
    if (date === TODAY) {
      state.orders = state.orders.filter(o => o.status !== 'done');
      renderAll();
    }
  });

  ws.on('booth:updated', ({ open }) => {
    state.boothOpen = open;
    renderBoothToggle();
  });

  ws.on('_connected',    () => setConnected(true));
  ws.on('_disconnected', () => setConnected(false));
  ws.connect();

  setInterval(tickTimers, 1000);
}

document.addEventListener('DOMContentLoaded', init);
