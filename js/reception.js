// Reception screen — Tablet 1.

const TODAY = new Date().toISOString().slice(0, 10);

// ─── state ────────────────────────────────────────────────────────────────────

const state = {
  orders:       [],
  tab:          'active',
  historyDates: [],
  historyDate:  null,
  historyOrders: [], // orders of the history day being viewed (for payment verification)
  boothOpen:    false,
  demoMode:     false,
  eventMode:    false,
  eventName:    null,
};

let pendingCollectId = null;

const cartQty      = new Map();
const prevUrgent   = new Map();
const prevUpcoming = new Map();
const scheduledAlerts = new Set(); // order IDs with active alerts

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

function isUpcoming(order) {
  if (order.source !== 'whatsapp_form') return false;
  const mins = minutesUntil(order.pickup_time);
  return mins !== null && mins > 10;
}

const STATUS_LABEL = { cooking: 'בהכנה', ready: 'מוכן', done: 'נאסף' };
const PAY_LABEL    = { cash: 'מזומן', bit: 'ביט', paybox: 'פייבוקס', pending: 'לא שולם' };

function isPayActive(order, method) {
  return method === 'pending' ? !order.paid : (order.paid && order.payment_method === method);
}

function formatSpreads(spreads, quantity) {
  if (!spreads?.length) return '';
  if (Array.isArray(spreads[0])) {
    // New format: string[][] — one array per unit
    const lines = spreads.map((unit, i) => {
      const prefix = quantity > 1 ? `#${i + 1}: ` : '';
      return unit.length ? prefix + esc(unit.join(' · ')) : '';
    }).filter(Boolean);
    return lines.length ? `<div class="card-item-spreads">${lines.join('<br>')}</div>` : '';
  }
  // Old format: string[] (backward compat)
  return `<div class="card-item-spreads">${esc(spreads.join(' · '))}</div>`;
}

// Reception uses the event menu while event mode is on; otherwise the regular menu.
function activeMenu() {
  return state.eventMode ? EVENT_MENU : MENU;
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
    const item = activeMenu().byId[id];
    if (item) total += item.price * qty;
  }
  return total;
}

function cartToItems() {
  const items = [];
  for (const [id, qty] of cartQty) {
    const item = activeMenu().byId[id];
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
    const item = activeMenu().byId[id];
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
  const menu = activeMenu();
  renderItemGroup('food-grid',   menu.food);
  renderItemGroup('drinks-grid', menu.drinks);
  const noDrinks = menu.drinks.length === 0;
  document.getElementById('drinks-label').style.display = noDrinks ? 'none' : '';
  document.getElementById('drinks-grid').style.display  = noDrinks ? 'none' : '';
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
    await api.post('/api/orders', { name, note, items, total, source: 'walk_in', demo: state.demoMode || undefined });
    cartReset();
    // Card appears via the WebSocket order:created broadcast.
  } catch (e) {
    showActionError('שגיאה בשמירת הזמנה', e);
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
  } catch (e) { showActionError('שגיאה בעדכון סטטוס', e); }
}

async function changePayment(id, method) {
  try {
    await api.patch(`/api/orders/${id}`, {
      payment_method: method,
      paid: method !== 'pending',
    });
  } catch (e) { showActionError('שגיאה בעדכון תשלום', e); }
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
  } catch (e) { showActionError('שגיאה בביטול הזמנה', e); }
}

async function deleteOrder(id, name) {
  if (!confirm(`למחוק את הזמנה #${id} של ${name}?\nפעולה זו אינה הפיכה.`)) return;

  const btn = document.querySelector(`#card-${id} .delete-order-btn`);
  if (btn) { btn.disabled = true; btn.textContent = 'מוחק…'; }

  try {
    await api.delete(`/api/orders/${id}`);
    // Card is removed via the WebSocket order:deleted broadcast.
  } catch (e) {
    showActionError('שגיאה במחיקת הזמנה', e);
    if (btn) { btn.disabled = false; btn.textContent = '🗑 מחק'; }
  }
}

async function clearCompleted() {
  const done = state.orders.filter(o => o.status === 'done');
  if (!done.length) { alert('אין הזמנות שהושלמו למחיקה'); return; }
  if (!confirm(`למחוק את כל ${done.length} ההזמנות שהושלמו היום?`)) return;
  if (!confirm('אישור סופי: המחיקה אינה הפיכה. להמשיך?')) return;
  try {
    await api.delete(`/api/orders/completed?date=${TODAY}`);
  } catch (e) { showActionError('שגיאה בניקוי הזמנות', e); }
}

// ─── edit order modal ─────────────────────────────────────────────────────────

const edit = { orderId: null, items: [] };

function openEditModal(id) {
  const order = state.orders.find(o => o.id === id);
  if (!order) return;
  edit.orderId = id;
  // Deep copy so changes stay local until saved (keeps spreads on existing items)
  edit.items = JSON.parse(JSON.stringify(order.items));
  document.getElementById('edit-title').textContent = `עריכת הזמנה #${order.id} — ${order.name}`;
  document.getElementById('edit-menu-grid').innerHTML = activeMenu().allItems.map(item => `
    <button class="menu-item-btn" onclick="editAddItem('${item.id}')">
      <span class="item-emoji">${item.emoji}</span>
      <span class="item-name">${esc(item.name)}</span>
      <span class="item-price">${item.price}₪</span>
    </button>`).join('');
  renderEditModal();
  document.getElementById('edit-modal').classList.remove('hidden');
}

function closeEditModal() {
  edit.orderId = null;
  edit.items = [];
  document.getElementById('edit-modal').classList.add('hidden');
}

function editTotal() {
  return edit.items.reduce((sum, it) => sum + it.price * it.quantity, 0);
}

function renderEditModal() {
  const cartEl = document.getElementById('edit-cart');
  cartEl.innerHTML = edit.items.length
    ? edit.items.map((item, i) => `
      <div class="cart-row">
        <span class="cart-name">${esc(item.menu_item)}</span>
        <div class="qty-control">
          <button class="qty-btn" onclick="editChangeQty(${i},-1)">−</button>
          <span class="qty-value">${item.quantity}</span>
          <button class="qty-btn" onclick="editChangeQty(${i},1)">+</button>
        </div>
        <span class="cart-price">${item.price * item.quantity}₪</span>
      </div>`).join('')
    : '<div id="cart-empty">אין פריטים — להסרת ההזמנה השתמשו בביטול</div>';
  document.getElementById('edit-total').innerHTML =
    edit.items.length ? `<strong>סה"כ: ${editTotal()}₪</strong>` : '';
  document.getElementById('edit-save-btn').disabled = edit.items.length === 0;
}

function editChangeQty(index, delta) {
  const item = edit.items[index];
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) {
    edit.items.splice(index, 1);
  } else if (Array.isArray(item.spreads?.[0]) && item.spreads.length > item.quantity) {
    // Per-unit spreads: drop the entries for removed units
    item.spreads = item.spreads.slice(0, item.quantity);
  }
  renderEditModal();
}

function editAddItem(menuId) {
  const menuItem = activeMenu().byId[menuId];
  if (!menuItem) return;
  const i = edit.items.findIndex(it => it.menu_item === menuItem.name && it.price === menuItem.price);
  if (i >= 0) {
    editChangeQty(i, 1);
  } else {
    edit.items.push({ menu_item: menuItem.name, price: menuItem.price, quantity: 1, spreads: [] });
    renderEditModal();
  }
}

async function saveEdit() {
  const id = edit.orderId;
  if (id === null || !edit.items.length) return;

  const btn = document.getElementById('edit-save-btn');
  btn.disabled = true;
  btn.textContent = 'שומר…';

  try {
    await api.patch(`/api/orders/${id}`, { items: edit.items, total: editTotal() });
    closeEditModal();
    // Card updates on all screens via the WebSocket order:updated broadcast.
  } catch (e) {
    showActionError('שגיאה בשמירת השינויים', e);
    btn.disabled = false;
  } finally {
    btn.textContent = '💾 שמור';
  }
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
  } catch (e) { showActionError('שגיאה בעדכון הזמנה', e); }
}

// ─── booth toggle ─────────────────────────────────────────────────────────────

async function toggleBooth() {
  if (state.demoMode) {
    state.demoMode  = false;
    state.boothOpen = false;
    renderBoothToggle();
    renderDemoBanner();
    api.post('/api/demo/close', {}).catch(() => {});
  } else if (state.boothOpen) {
    try {
      await api.patch('/api/booth', { open: false });
    } catch (e) { showActionError('שגיאה בעדכון מצב הדוכן', e); }
  } else {
    showBoothOpenModal();
  }
}

function showBoothOpenModal() {
  document.getElementById('booth-open-modal').classList.remove('hidden');
}

function closeBoothOpenModal() {
  document.getElementById('booth-open-modal').classList.add('hidden');
}

function openBoothDemo() {
  closeBoothOpenModal();
  state.demoMode  = true;
  state.boothOpen = true;
  renderBoothToggle();
  renderDemoBanner();
  api.post('/api/demo/open', {}).catch(() => {});
}

function showBoothHoursForm() {
  closeBoothOpenModal();
  document.getElementById('booth-hours-modal').classList.remove('hidden');
}

function closeBoothHoursModal() {
  document.getElementById('booth-hours-modal').classList.add('hidden');
}

async function openBoothReal() {
  const openTime  = document.getElementById('booth-open-time').value  || null;
  const closeTime = document.getElementById('booth-close-time').value || null;
  closeBoothHoursModal();
  try {
    await api.patch('/api/booth', { open: true, open_time: openTime, close_time: closeTime });
  } catch (e) { showActionError('שגיאה בפתיחת הדוכן', e); }
}

function renderDemoBanner() {
  let banner = document.getElementById('demo-banner');
  if (state.demoMode) {
    if (!banner) {
      banner = document.createElement('div');
      banner.id          = 'demo-banner';
      banner.className   = 'demo-banner';
      banner.textContent = '🧪 מצב דמו — הזמנות לא נשמרות במסד הנתונים';
      const toolbar = document.getElementById('toolbar');
      toolbar.insertAdjacentElement('afterend', banner);
    }
    banner.style.display = '';
  } else if (banner) {
    banner.style.display = 'none';
  }
}

function renderBoothToggle() {
  const btn = document.getElementById('booth-toggle-btn');
  if (!btn) return;
  if (state.demoMode) {
    btn.textContent = '🧪 מצב דמו';
    btn.className   = 'btn booth-toggle booth-demo';
  } else if (state.boothOpen) {
    btn.textContent = '🟢 דוכן פתוח';
    btn.className   = 'btn booth-toggle booth-open';
  } else {
    btn.textContent = '🔴 דוכן סגור';
    btn.className   = 'btn booth-toggle booth-closed';
  }
}

// ─── event mode ───────────────────────────────────────────────────────────────

async function toggleEventMode() {
  const turnOn = !state.eventMode;
  const msg = turnOn
    ? 'להפעיל מצב אירוע "טעם הבית"?\nהתפריט יוחלף בתפריט האירוע בכל הטאבלטים.'
    : 'לכבות מצב אירוע?\nהתפריט הרגיל יחזור בכל הטאבלטים.';
  if (!confirm(msg)) return;
  try {
    await api.patch('/api/event', { active: turnOn });
    // All screens (including this one) switch via the event:updated broadcast.
  } catch (e) { showActionError('שגיאה בעדכון מצב אירוע', e); }
}

function applyEventMode({ active, name }) {
  const changed = state.eventMode !== !!active;
  state.eventMode = !!active;
  state.eventName = name || null;
  if (changed) {
    // Cart item ids belong to the previous menu — start fresh.
    cartReset();
    renderMenuGrid();
    if (edit.orderId !== null) closeEditModal();
  }
  renderEventToggle();
  renderEventCounter();
  renderUpcomingSection();
}

function renderEventToggle() {
  const btn = document.getElementById('event-toggle-btn');
  if (!btn) return;
  btn.textContent = state.eventMode ? `🎪 אירוע: ${state.eventName} — פעיל` : '🎪 מצב אירוע: כבוי';
  btn.className   = `btn booth-toggle ${state.eventMode ? 'event-on' : 'event-off'}`;
}

// Portions sold per event item (event-tagged orders, excluding cancelled), vs. stock.
function renderEventCounter() {
  const el = document.getElementById('event-counter');
  if (!el) return;
  if (!state.eventMode) { el.classList.add('hidden'); return; }

  const sold = {};
  for (const o of state.orders) {
    if (!o.event || o.status === 'cancelled') continue;
    for (const item of o.items) sold[item.menu_item] = (sold[item.menu_item] || 0) + item.quantity;
  }

  el.innerHTML = `<span class="event-counter-title">🎪 ${esc(state.eventName)}</span>` +
    EVENT_MENU.allItems.map(item => {
      const n = sold[item.name] || 0;
      if (item.stock == null) {
        return `<span class="event-count"><span>${item.emoji} ${esc(item.name)}</span><strong>${n}</strong><small>נמכרו</small></span>`;
      }
      const left = item.stock - n;
      const low  = left < 10;
      return `<span class="event-count${low ? ' event-low' : ''}">
        <span>${item.emoji} ${esc(item.name)}</span>
        <strong>${n} / ${item.stock}</strong>
        <small>${left > 0 ? `נשארו ${left}` : 'אזל!'}</small>
      </span>`;
    }).join('');
  el.classList.remove('hidden');
}

// ─── sorting ──────────────────────────────────────────────────────────────────

function sortedUpcoming() {
  return state.orders
    .filter(o => isUpcoming(o) && o.status !== 'done' && o.status !== 'cancelled')
    .sort((a, b) => (a.pickup_time || '').localeCompare(b.pickup_time || ''));
}

function sortedActive() {
  return state.orders
    .filter(o => o.status !== 'done' && o.status !== 'cancelled' && !isUpcoming(o))
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
  renderEventCounter();
  if (state.tab === 'active') {
    renderOrderGrid('orders-list', sortedActive(), 'active');
    renderUpcomingSection();
  }
  if (state.tab === 'completed') renderVerify('today');
  updateCompletedBadge();
  refreshOrderDetails();
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
      ${formatSpreads(item.spreads, item.quantity)}
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
        ${['cooking','ready','done'].map(s => `
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
    <div class="${cardClass}" id="card-${order.id}" data-oid="${order.id}" data-oscope="${mode === 'history' ? 'history' : 'today'}">
      <div class="card-header">
        <span class="order-num">#${order.id}</span>
        <span class="order-name">${esc(order.name)}</span>
        <span class="order-source${isWa ? ' wa' : ''}">${isWa ? 'ווצאפ' : 'דוכן'}</span>
        ${isUrgent    ? '<span class="urgent-badge">⚠️ דחוף!</span>'  : ''}
        ${isCancelled ? '<span class="cancelled-badge">בוטל</span>'   : ''}
        ${isUnpaid    ? '<span class="unpaid-badge">ממתין לתשלום</span>' : ''}
        ${mode === 'active' && !isCancelled ? `<button class="edit-order-btn" onclick="openEditModal(${order.id})">✏️ ערוך</button>` : ''}
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

// ─── upcoming orders section ──────────────────────────────────────────────────

function preorderCountLabel(n) {
  return n === 1 ? 'הזמנה מראש אחת' : `${n} הזמנות מראש`;
}

// Shown whenever there are pre-orders (also in event mode), with a count badge
// here and a chip in the toolbar that is visible from every tab.
function renderUpcomingSection() {
  const section = document.getElementById('upcoming-section');
  const list    = document.getElementById('upcoming-list');
  if (!section || !list) return;
  const orders  = sortedUpcoming();
  section.style.display = orders.length ? '' : 'none';
  const count = document.getElementById('upcoming-count');
  if (count) count.textContent = preorderCountLabel(orders.length);
  list.innerHTML = orders.map(buildUpcomingCard).join('');

  const chip = document.getElementById('preorder-chip');
  if (chip) {
    chip.style.display = orders.length ? '' : 'none';
    chip.textContent = `📅 ${preorderCountLabel(orders.length)}`;
  }
}

function goToPreorders() {
  switchTab('active');
  document.getElementById('upcoming-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function buildUpcomingCard(order) {
  const mins     = minutesUntil(order.pickup_time);
  const itemsHtml = order.items.map(item =>
    `<div class="card-item">${item.quantity}× ${esc(item.menu_item)}</div>`
  ).join('');
  return `
    <div class="order-card upcoming-card" id="card-${order.id}" data-oid="${order.id}" data-oscope="today">
      <div class="card-header">
        <span class="order-num">#${order.id}</span>
        <span class="order-name">${esc(order.name)}</span>
        <span class="order-source wa">ווצאפ</span>
        <button class="edit-order-btn" onclick="openEditModal(${order.id})">✏️ ערוך</button>
      </div>
      <div class="upcoming-pickup">🕐 איסוף ${esc(order.pickup_time)}</div>
      <div class="card-items">${itemsHtml}</div>
      <div class="card-meta">
        <span class="meta-total">${order.total}₪</span>
        <span id="timer-${order.id}" class="meta-timer">${formatCountdown(mins)}</span>
        ${order.note ? `<span class="meta-note">💬 ${esc(order.note)}</span>` : ''}
      </div>
    </div>`;
}

// ─── new form order banner + sound ────────────────────────────────────────────
// Every new form order (incl. scheduled pre-orders) shows a banner at the top
// of the screen until it is tapped, with a short chime (repeated every 30s
// while a banner is still open).

const formBanners = new Set(); // order ids with an open banner
let bannerChimeTimer = null;

let audioCtx = null;

// Browsers only allow sound after a tap on the page; reception gets taps all the time.
function unlockAudio() {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) { console.warn('Audio:', e.message); }
}

function playChime() {
  unlockAudio();
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime;
  [880, 1175, 1568].forEach((freq, i) => {
    const t   = t0 + i * 0.16;
    const osc = audioCtx.createOscillator();
    const amp = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    osc.connect(amp).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.45);
  });
}

function showFormOrderBanner(order) {
  if (formBanners.has(order.id)) return;
  formBanners.add(order.id);
  const container = document.getElementById('form-order-banners');
  if (!container) return;

  const pre  = isUpcoming(order) ? ' · הזמנה מראש' : '';
  const day  = order.date && order.date !== TODAY ? ` (${formatDateHe(order.date)})` : '';
  const el   = document.createElement('button');
  el.className = 'form-order-banner';
  el.id        = `fbanner-${order.id}`;
  el.innerHTML = `<span>📥 הזמנה חדשה מהטופס: <strong>${esc(order.name)}</strong>, איסוף <strong>${esc(order.pickup_time || 'בהקדם')}</strong>${day}${pre}</span><span class="fbanner-hint">#${order.id} · הקישו לסגירה</span>`;
  el.addEventListener('click', () => dismissFormBanner(order.id));
  container.appendChild(el);

  playChime();
  if (!bannerChimeTimer) bannerChimeTimer = setInterval(playChime, 30000);
}

function dismissFormBanner(id) {
  formBanners.delete(id);
  document.getElementById(`fbanner-${id}`)?.remove();
  if (!formBanners.size && bannerChimeTimer) {
    clearInterval(bannerChimeTimer);
    bannerChimeTimer = null;
  }
}

// ─── scheduled alerts ─────────────────────────────────────────────────────────

function showScheduledAlert(order) {
  if (scheduledAlerts.has(order.id)) return;
  scheduledAlerts.add(order.id);
  const container = document.getElementById('scheduled-alerts');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'scheduled-alert';
  el.id        = `salert-${order.id}`;
  el.innerHTML = `<span>🔔 <strong>התחילו להכין!</strong> ${esc(order.name)} — איסוף ב-${order.pickup_time}</span><button class="salert-close" onclick="dismissAlert(${order.id})">✕</button>`;
  container.appendChild(el);
  setTimeout(() => dismissAlert(order.id), 30000);
}

function dismissAlert(orderId) {
  scheduledAlerts.delete(orderId);
  document.getElementById(`salert-${orderId}`)?.remove();
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

    // Detect upcoming → active transition (10-min threshold crossing)
    const wasUpcoming = prevUpcoming.get(order.id);
    const nowUpcoming = isUpcoming(order);
    if (wasUpcoming === true && !nowUpcoming) {
      showScheduledAlert(order);
      needRerender = true;
    }
    if (wasUpcoming !== nowUpcoming) prevUpcoming.set(order.id, nowUpcoming);

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
    renderUpcomingSection();
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

  if (tab === 'completed') renderVerify('today');
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
  state.historyOrders = [];

  try {
    const [orders, summary] = await Promise.all([
      api.get(`/api/orders?date=${date}`),
      api.get(`/api/orders/summary?date=${date}`),
    ]);
    if (state.historyDate !== date) return; // another day was picked meanwhile
    state.historyOrders = orders;

    contentEl.innerHTML = `
      <div id="history-summary-box">${buildHistorySummary(date, summary)}</div>
      <div id="history-verify"></div>
      <div class="vf-section-title">כל ההזמנות</div>
      <div class="orders-grid" id="history-orders"></div>`;

    renderVerify('history');
    renderOrderGrid('history-orders', orders, 'history');
  } catch {
    contentEl.innerHTML = '<div class="empty-state">שגיאה בטעינת יום</div>';
  }
}

function buildHistorySummary(date, summary) {
  const itemRows = Object.entries(summary.item_counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => `<div class="summary-row"><span>${esc(name)}</span><span>×${n}</span></div>`)
    .join('');

  return `
      <div class="history-summary">
        <h3>${formatDateHe(date)}</h3>
        <div class="summary-row"><span>סה"כ הזמנות</span><strong>${summary.total_orders}</strong></div>
        <div class="summary-row"><span>הכנסה כוללת</span><strong>${summary.revenue.total}₪</strong></div>
        <div class="summary-row"><span>מזומן</span><span>${summary.revenue.cash}₪</span></div>
        <div class="summary-row"><span>ביט</span><span>${summary.revenue.bit}₪</span></div>
        <div class="summary-row"><span>פייבוקס</span><span>${summary.revenue.paybox}₪</span></div>
        <div class="summary-row"><span>ממתין לתשלום</span><span>${summary.revenue.pending}₪</span></div>
        ${itemRows ? `<div style="margin-top:10px">${itemRows}</div>` : ''}
        ${buildEventSummary(summary.event)}
      </div>`;
}

// Live update of the history day being viewed (another tablet changed an order).
function applyHistoryOrderUpdate(order) {
  const i = state.historyOrders.findIndex(o => o.id === order.id);
  if (i < 0) return;
  state.historyOrders[i] = order;
  refreshOrderDetails();
  if (state.tab !== 'history') return;
  renderVerify('history');
  renderOrderGrid('history-orders', state.historyOrders, 'history');
  const date = state.historyDate;
  api.get(`/api/orders/summary?date=${date}`).then(summary => {
    const box = document.getElementById('history-summary-box');
    if (box && state.historyDate === date) box.innerHTML = buildHistorySummary(date, summary);
  }).catch(() => {});
}

// ─── payment verification (completed tab + history day) ──────────────────────
// Each completed order can be marked "התקבל" after checking it against Bit,
// PayBox and the cash drawer. Stored on the order (paymentConfirmed), synced
// via the usual order:updated broadcast. Orders without the field = not verified.

const VF_METHODS = ['cash', 'bit', 'paybox', 'pending'];
const VF_LABEL   = { cash: 'מזומן', bit: 'ביט', paybox: 'PayBox', pending: 'אחר כך' };

const verifyUI = { filter: 'all', search: '', verifiedOpen: false };

function vfMethod(order) {
  return order.paid ? order.payment_method : 'pending';
}

function vfTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function vfRootId(scope) {
  return scope === 'today' ? 'completed-list' : 'history-verify';
}

function vfOrders(scope) {
  const orders = scope === 'today' ? state.orders : state.historyOrders;
  return orders.filter(o => o.status === 'done');
}

function renderVerifyCurrent() {
  if (state.tab === 'completed') renderVerify('today');
  if (state.tab === 'history')   renderVerify('history');
}

function setVerifyFilter(filter) {
  verifyUI.filter = filter;
  renderVerifyCurrent();
}

function setVerifySearch(text) {
  verifyUI.search = text;
  renderVerifyCurrent();
}

async function togglePaymentConfirmed(id, confirmed) {
  try {
    await api.patch(`/api/orders/${id}`, { paymentConfirmed: confirmed });
    // Row moves on all tablets via the WebSocket order:updated broadcast.
  } catch (e) { showActionError('שגיאה בעדכון אימות תשלום', e); }
}

function renderVerify(scope) {
  const root = document.getElementById(vfRootId(scope));
  if (!root) return;

  // Static parts (chips + search box) are built once so typing keeps focus.
  if (!root.querySelector('.vf-toolbar')) {
    root.innerHTML = `
      <div class="vf-summary"></div>
      <div class="vf-toolbar">
        <div class="vf-chips">
          ${['all', ...VF_METHODS].map(f => `
            <button class="vf-chip" data-filter="${f}" onclick="setVerifyFilter('${f}')">${f === 'all' ? 'הכל' : VF_LABEL[f]}</button>`).join('')}
        </div>
        <input type="search" class="vf-search" placeholder="🔍 חיפוש לפי שם" autocomplete="off" oninput="setVerifySearch(this.value)">
      </div>
      <div class="vf-list vf-todo"></div>
      <details class="vf-verified" ontoggle="verifyUI.verifiedOpen = this.open">
        <summary class="vf-verified-title"></summary>
        <div class="vf-list vf-done"></div>
      </details>`;
  }

  const all = vfOrders(scope);
  root.querySelector('.vf-summary').innerHTML = buildVerifySummary(all);

  root.querySelectorAll('.vf-chip').forEach(c =>
    c.classList.toggle('active', c.dataset.filter === verifyUI.filter));
  const input = root.querySelector('.vf-search');
  if (input !== document.activeElement && input.value !== verifyUI.search) input.value = verifyUI.search;

  const q = verifyUI.search.trim().toLowerCase();
  const shown = all
    .filter(o => verifyUI.filter === 'all' || vfMethod(o) === verifyUI.filter)
    .filter(o => !q || String(o.name).toLowerCase().includes(q))
    .sort((a, b) => a.id - b.id);
  const todo = shown.filter(o => !o.paymentConfirmed);
  const done = shown.filter(o =>  o.paymentConfirmed);

  root.querySelector('.vf-todo').innerHTML = todo.length
    ? todo.map(o => buildVerifyRow(o, scope)).join('')
    : `<div class="empty-state">${all.length ? 'אין הזמנות לאימות' : 'אין הזמנות שהושלמו'}</div>`;

  const details = root.querySelector('.vf-verified');
  details.open = verifyUI.verifiedOpen;
  root.querySelector('.vf-verified-title').textContent = `✓ אומתו (${done.length})`;
  root.querySelector('.vf-done').innerHTML = done.map(o => buildVerifyRow(o, scope)).join('');
}

function buildVerifySummary(orders) {
  const sum = list => list.reduce((s, o) => s + o.total, 0);
  const verified = orders.filter(o =>  o.paymentConfirmed);
  const todo     = orders.filter(o => !o.paymentConfirmed);

  const methodRows = VF_METHODS.map(m => {
    const list = orders.filter(o => vfMethod(o) === m);
    const ok   = list.filter(o => o.paymentConfirmed).length;
    return `
      <div class="vf-method-sum${m === 'pending' && list.length ? ' vf-unpaid' : ''}">
        <span class="vf-method-name">${VF_LABEL[m]}</span>
        <strong>${sum(list)}₪</strong>
        <small>${list.length} הזמנות · אומתו ${ok}</small>
      </div>`;
  }).join('');

  return `
    <div class="vf-totals">
      <div class="vf-total-box vf-total-ok"><span>אומת</span><strong>${sum(verified)}₪</strong><small>${verified.length} הזמנות</small></div>
      <div class="vf-total-box vf-total-todo"><span>נשאר לאמת</span><strong>${sum(todo)}₪</strong><small>${todo.length} הזמנות</small></div>
    </div>
    <div class="vf-methods-sum">${methodRows}</div>`;
}

function buildVerifyRow(order, scope) {
  const method    = vfMethod(order);
  const confirmed = !!order.paymentConfirmed;
  const rowClass  = ['vf-row',
    method === 'pending' ? 'vf-unpaid'    : '',
    confirmed            ? 'vf-confirmed' : '',
  ].filter(Boolean).join(' ');

  return `
    <div class="${rowClass}"${scope === 'today' ? ` id="card-${order.id}"` : ''} data-oid="${order.id}" data-oscope="${scope}">
      <div class="vf-row-top">
        <span class="vf-num">#${order.id}</span>
        <span class="vf-name">${esc(order.name)}</span>
        <span class="vf-time">${vfTime(order.created_at)}</span>
        <span class="vf-amount">${order.total}₪</span>
      </div>
      <div class="vf-row-actions">
        <div class="vf-method-btns">
          ${VF_METHODS.map(m => `
            <button class="vf-method-btn${method === m ? ' active' : ''}" data-pay="${m}"
              ${method === m ? 'disabled' : `onclick="changePayment(${order.id},'${m}')"`}>${VF_LABEL[m]}</button>`).join('')}
        </div>
        <button class="vf-confirm-btn${confirmed ? ' on' : ''}" onclick="togglePaymentConfirmed(${order.id}, ${!confirmed})">
          ${confirmed ? `✓ התקבל <small>${vfTime(order.paymentConfirmedAt)}</small>` : '✓ התקבל'}
        </button>
        ${scope === 'today' ? `<button class="delete-order-btn vf-delete-btn" onclick="deleteOrder(${order.id},'${esc(order.name)}')">🗑 מחק</button>` : ''}
      </div>
    </div>`;
}

// ─── order details (read-only) ────────────────────────────────────────────────
// Tapping a card (anywhere except its buttons) opens everything about the order.

const DETAIL_STATUS = { waiting: 'ממתין', cooking: 'בהכנה', ready: 'מוכן', done: 'נאסף', cancelled: 'בוטל' };
const details = { id: null, scope: 'today' };

function findOrder(id, scope) {
  const list = scope === 'history' ? state.historyOrders : state.orders;
  return list.find(o => o.id === id);
}

function onOrderCardClick(e) {
  // Buttons, inputs and the button rows (incl. gaps / disabled buttons) keep their own behaviour.
  if (e.target.closest('button, a, input, select, textarea, summary, label, ' +
      '.status-buttons, .payment-row, .vf-row-actions')) return;
  const card = e.target.closest('[data-oid]');
  if (!card) return;
  openOrderDetails(Number(card.dataset.oid), card.dataset.oscope);
}

function openOrderDetails(id, scope = 'today') {
  if (!findOrder(id, scope)) return;
  details.id = id;
  details.scope = scope;
  renderOrderDetails();
  document.getElementById('details-modal').classList.remove('hidden');
}

function closeOrderDetails() {
  details.id = null;
  document.getElementById('details-modal').classList.add('hidden');
}

// Keep an open details view in sync with live updates.
function refreshOrderDetails() {
  if (details.id === null) return;
  if (findOrder(details.id, details.scope)) renderOrderDetails();
  else closeOrderDetails();
}

function detailTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const time = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  const day  = iso.slice(0, 10);
  return day === TODAY ? time : `${time} · ${new Intl.DateTimeFormat('he-IL').format(d)}`;
}

// Per-unit spreads/sauces lines: #1, #2… (handles string[][], old string[] and []).
function detailUnits(item) {
  const spreads = item.spreads ?? [];
  if (!spreads.length) return '';
  if (!Array.isArray(spreads[0])) {
    return `<div class="dt-units"><div class="dt-unit">${esc(spreads.join(' · '))}</div></div>`;
  }
  const rows = [];
  for (let i = 0; i < item.quantity; i++) {
    const unit = spreads[i] ?? [];
    rows.push(`<div class="dt-unit"><span class="dt-unit-num">#${i + 1}</span>${unit.length ? esc(unit.join(' · ')) : '<span class="dt-none">—</span>'}</div>`);
  }
  return `<div class="dt-units">${rows.join('')}</div>`;
}

function renderOrderDetails() {
  const order = findOrder(details.id, details.scope);
  if (!order) return;

  const isWa = order.source === 'whatsapp_form';
  const row  = (label, value) => value ? `<div class="dt-row"><span class="dt-label">${label}</span><span class="dt-value">${value}</span></div>` : '';

  let payment;
  if (order.paid) payment = `${esc(PAY_LABEL[order.payment_method] || order.payment_method)} ✓ שולם`;
  else payment = order.status === 'done' ? '<span class="dt-warn">אחר כך — לא שולם</span>' : 'עדיין לא שולם';
  const verified = order.paymentConfirmed
    ? `<span class="dt-ok">✓ אומת ${vfTime(order.paymentConfirmedAt)}</span>`
    : 'לא אומת';

  const itemsHtml = order.items.map(item => `
    <div class="dt-item">
      <div class="dt-item-top">
        <span class="dt-qty">${item.quantity}×</span>
        <span class="dt-item-name">${esc(item.menu_item)}</span>
        <span class="dt-item-price">${item.quantity > 1 ? `${item.price}₪ × ${item.quantity} = ` : ''}${item.price * item.quantity}₪</span>
      </div>
      ${detailUnits(item)}
    </div>`).join('');

  document.getElementById('details-title').textContent = `הזמנה #${order.id} — ${order.name}`;
  document.getElementById('details-content').innerHTML = `
    <div class="dt-rows">
      ${row('שם', esc(order.name))}
      ${row('טלפון', order.phone ? `<a href="tel:${esc(order.phone)}" dir="ltr">${esc(order.phone)}</a>` : '')}
      ${row('מקור', isWa ? '📱 טופס' : '🏪 דוכן')}
      ${row('אירוע', order.event ? `🎪 ${esc(order.event)}` : '')}
      ${row('נוצרה', detailTime(order.created_at))}
      ${row('איסוף', order.pickup_time ? `<strong class="dt-pickup">🕐 ${esc(order.pickup_time)}</strong>` : 'בהקדם')}
      ${row('סטטוס', DETAIL_STATUS[order.status] || esc(order.status))}
      ${row('תשלום', payment)}
      ${row('אימות תשלום', verified)}
    </div>
    ${order.note ? `<div class="dt-note">💬 ${esc(order.note)}</div>` : ''}
    <div class="dt-items-title">פריטים</div>
    <div class="dt-items">${itemsHtml}</div>
    <div class="dt-total"><span>סה"כ</span><strong>${order.total}₪</strong></div>`;
}

// ─── daily summary modal ──────────────────────────────────────────────────────

// Separate totals for event-tagged orders (already included in the day totals above).
function buildEventSummary(ev) {
  if (!ev) return '';
  const itemRows = Object.entries(ev.item_counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => `<div class="summary-row"><span>${esc(name)}</span><span>×${n}</span></div>`)
    .join('');
  return `
    <div class="summary-section event-summary">
      <h3>🎪 אירוע: ${esc(ev.name)} <small>(כלול בסה"כ)</small></h3>
      <div class="summary-row"><span>הזמנות</span><span>${ev.orders}</span></div>
      <div class="summary-row"><span>מזומן</span><span>${ev.revenue.cash}₪</span></div>
      <div class="summary-row"><span>ביט</span><span>${ev.revenue.bit}₪</span></div>
      <div class="summary-row"><span>פייבוקס</span><span>${ev.revenue.paybox}₪</span></div>
      <div class="summary-row total-row"><span>סה"כ אירוע</span><span>${ev.revenue.total}₪</span></div>
      <div class="summary-row"><span>ממתין לתשלום</span><span>${ev.revenue.pending}₪</span></div>
      ${itemRows}
    </div>`;
}

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
        <div class="summary-row"><span>בהכנה / מוכן</span>
          <span>${s.cooking} / ${s.ready}</span></div>
      </div>
      <div class="summary-section">
        <h3>הכנסות</h3>
        <div class="summary-row"><span>מזומן</span><span>${s.revenue.cash}₪</span></div>
        <div class="summary-row"><span>ביט</span><span>${s.revenue.bit}₪</span></div>
        <div class="summary-row"><span>פייבוקס</span><span>${s.revenue.paybox}₪</span></div>
        <div class="summary-row total-row"><span>סה"כ</span><span>${s.revenue.total}₪</span></div>
        <div class="summary-row"><span>ממתין לתשלום</span><span>${s.revenue.pending}₪</span></div>
      </div>
      ${itemRows ? `<div class="summary-section"><h3>כמות לפי פריט</h3>${itemRows}</div>` : ''}
      ${buildEventSummary(s.event)}`;

    document.getElementById('summary-modal').classList.remove('hidden');
  } catch (e) {
    showActionError('שגיאה בטעינת סיכום', e);
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

// ─── connection indicator + errors ────────────────────────────────────────────

function setConnected(yes) {
  document.getElementById('connection-dot').className    = yes ? 'connected' : '';
  document.getElementById('connection-text').textContent = yes ? 'מחובר' : 'מנותק';
}

// Non-blocking message instead of an alert popup (api.js `connection`);
// falls back to alert if an older cached api.js is loaded.
function showActionError(label, err) {
  if (typeof connection !== 'undefined') connection.actionFailed(label, err);
  else { console.error(label, err); alert(label); }
}

async function loadTodayOrders() {
  const orders = await api.get(`/api/orders?date=${TODAY}`);
  state.orders = orders;
  await localDB.putMany(orders);
  renderAll();
}

// Connection is back: reload everything (broadcasts may have been missed).
async function reloadFromServer() {
  const knownIds = new Set(state.orders.map(o => o.id));
  try {
    const booth = await api.get('/api/booth');
    if (!state.demoMode) { state.boothOpen = booth.open; renderBoothToggle(); }
    applyEventMode(await api.get('/api/event'));
    await loadTodayOrders();
    // Form orders that arrived while offline still get their banner.
    if (knownIds.size && typeof showFormOrderBanner === 'function') {
      state.orders
        .filter(o => o.source === 'whatsapp_form' && !knownIds.has(o.id))
        .forEach(showFormOrderBanner);
    }
    if (state.tab === 'history') {
      loadHistoryDates();
      if (state.historyDate) loadHistoryDay(state.historyDate);
    }
  } catch (e) {
    console.error('Reload after reconnect failed', e);
  }
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
  document.getElementById('event-toggle-btn').addEventListener('click', toggleEventMode);
  document.getElementById('clear-completed-btn').addEventListener('click', clearCompleted);
  document.getElementById('modal-close').addEventListener('click', () =>
    document.getElementById('summary-modal').classList.add('hidden'));
  document.getElementById('summary-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
  });
  document.getElementById('payment-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closePaymentModal();
  });
  document.getElementById('edit-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeEditModal();
  });

  document.getElementById('orders-panel').addEventListener('click', onOrderCardClick);
  document.getElementById('details-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeOrderDetails();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && details.id !== null) closeOrderDetails();
  });

  document.getElementById('preorder-chip').addEventListener('click', goToPreorders);
  document.addEventListener('pointerdown', unlockAudio, { passive: true });

  document.querySelectorAll('.tab-btn').forEach(btn =>
    btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

  // Load booth state
  try {
    const booth = await api.get('/api/booth');
    state.boothOpen = booth.open;
    renderBoothToggle();
  } catch { renderBoothToggle(); }

  // Load event mode
  try {
    applyEventMode(await api.get('/api/event'));
  } catch { renderEventToggle(); }

  // Load from local IndexedDB cache first (instant render)
  try {
    const cached = await localDB.getByDate(TODAY);
    if (cached.length) { state.orders = cached; renderAll(); }
  } catch { /* IndexedDB unavailable */ }

  // Fetch authoritative data from server
  try {
    await loadTodayOrders();
  } catch (e) {
    console.warn('Server unavailable — showing local cache', e);
  }

  // WebSocket: live updates
  ws.on('order:created', order => {
    if (order.source === 'whatsapp_form') showFormOrderBanner(order);
    if (order.date !== TODAY) return;
    state.orders.push(order);
    localDB.put(order);
    renderAll();
  });

  ws.on('order:updated', order => {
    if (order.date === state.historyDate) applyHistoryOrderUpdate(order);
    if (order.date !== TODAY) return;
    const i = state.orders.findIndex(o => o.id === order.id);
    if (i >= 0) state.orders[i] = order; else state.orders.push(order);
    localDB.put(order);
    renderAll();
  });

  ws.on('order:deleted', ({ id }) => {
    state.orders = state.orders.filter(o => o.id !== id);
    if (state.historyOrders.some(o => o.id === id)) {
      state.historyOrders = state.historyOrders.filter(o => o.id !== id);
      if (state.tab === 'history') renderVerify('history');
    }
    if (edit.orderId === id) closeEditModal();
    renderAll();
  });

  ws.on('orders:cleared', ({ date }) => {
    if (date === TODAY) {
      state.orders = state.orders.filter(o => o.status !== 'done');
      renderAll();
    }
  });

  ws.on('demo:ended', ({ ids }) => {
    if (ids?.length) {
      state.orders = state.orders.filter(o => !ids.includes(o.id));
      renderAll();
    }
  });

  ws.on('booth:updated', ({ open }) => {
    if (!state.demoMode) {
      state.boothOpen = open;
      renderBoothToggle();
    }
  });

  ws.on('event:updated', applyEventMode);

  // Re-sync event mode after a reconnect in case a broadcast was missed.
  ws.on('_connected', () => api.get('/api/event').then(applyEventMode).catch(() => {}));

  if (typeof connection !== 'undefined') {
    connection.start({ dotId: 'connection-dot', textId: 'connection-text', onRecover: reloadFromServer });
  } else {
    ws.on('_connected',    () => setConnected(true));
    ws.on('_disconnected', () => setConnected(false));
  }
  ws.connect();

  setInterval(tickTimers, 1000);
}

document.addEventListener('DOMContentLoaded', init);
