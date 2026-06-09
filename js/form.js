// Customer order form — opened from a WhatsApp link on the customer's phone.
// Goal: fill and submit in under 30 seconds.
// Active only on Tuesdays 18:00–20:30. Add ?preview=1 to bypass for testing.

// ─── state ────────────────────────────────────────────────────────────────────

let boothOpen       = false;
let formInitialized = false;
let boothOpenedAt   = null;
let boothHours      = { open_time: null, close_time: null };

const cartQty     = new Map(); // item id → quantity
const cartSpreads = new Map(); // item id → Array<Set<spreadName>>, one Set per unit

// ─── helpers ──────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatHHMM(date) {
  return `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
}

function applyBoothState() {
  const closedEl  = document.getElementById('closed-state');
  const formEl    = document.getElementById('order-form');
  const confirmEl = document.getElementById('confirm-state');

  // Don't change anything if we're already on the confirmation screen
  if (confirmEl && !confirmEl.classList.contains('hidden')) return;

  if (boothOpen) {
    if (!boothOpenedAt) boothOpenedAt = new Date();
    closedEl.classList.add('hidden');
    if (!formInitialized) {
      renderMenuGrids();
      document.getElementById('f-name').addEventListener('input', refreshSubmit);
      document.getElementById('f-phone').addEventListener('input', () => {
        clearFieldError('f-phone', 'err-phone');
        refreshSubmit();
      });
      document.getElementById('order-form').addEventListener('submit', handleSubmit);
      formInitialized = true;
    }
    formEl.classList.remove('hidden');
  } else {
    const msgEl = document.getElementById('booth-hours-msg');
    if (msgEl) {
      if (boothOpenedAt && boothHours.open_time && boothHours.close_time) {
        msgEl.textContent = `היה פתוח היום מ-${boothHours.open_time} עד ${boothHours.close_time}`;
      } else if (boothHours.open_time) {
        msgEl.textContent = `הדוכן יפתח בשעה ${boothHours.open_time} — עדכון יישלח בוואטסאפ`;
      } else {
        msgEl.textContent = 'הדוכן יפתח בקרוב — עדכון יישלח בוואטסאפ';
      }
    }
    closedEl.classList.remove('hidden');
    formEl.classList.add('hidden');
  }
}

function calcTotal() {
  let total = 0;
  for (const [id, qty] of cartQty) {
    const item = MENU.byId[id];
    if (item) total += item.price * qty;
  }
  return total;
}

function buildItemsArray() {
  const items = [];
  for (const [id, qty] of cartQty) {
    const def = MENU.byId[id];
    if (!def) continue;
    const spreads = def.hasSpreads
      ? (cartSpreads.get(id) ?? []).map(s => [...s])
      : [];
    items.push({ menu_item: def.name, price: def.price, quantity: qty, spreads });
  }
  return items;
}

function refreshSubmit() {
  const name     = document.getElementById('f-name').value.trim();
  const hasItems = cartQty.size > 0;
  document.getElementById('submit-btn').disabled = !name || !hasItems;
}

// ─── menu grid ────────────────────────────────────────────────────────────────

function renderMenuGrids() {
  renderGroup('food-grid',   MENU.food);
  renderGroup('drinks-grid', MENU.drinks);
}

function renderGroup(id, items) {
  document.getElementById(id).innerHTML = items.map(item => `
    <button type="button" class="menu-btn" data-item-id="${item.id}" onclick="toggleItem('${item.id}')">
      <span class="m-emoji">${item.emoji}</span>
      <span class="m-name">${esc(item.name)}</span>
      ${item.desc ? `<span class="m-desc">${esc(item.desc)}</span>` : ''}
      <span class="m-price">${item.price}₪</span>
    </button>`).join('');
}

function toggleItem(itemId) {
  const def = MENU.byId[itemId];
  if (cartQty.has(itemId)) {
    cartQty.delete(itemId);
    cartSpreads.delete(itemId);
    document.querySelector(`[data-item-id="${itemId}"]`)?.classList.remove('selected');
  } else {
    cartQty.set(itemId, 1);
    if (def?.hasSpreads) cartSpreads.set(itemId, [new Set()]);
    document.querySelector(`[data-item-id="${itemId}"]`)?.classList.add('selected');
  }
  renderCart();
  refreshSubmit();
}

function changeQty(itemId, delta) {
  const q = (cartQty.get(itemId) ?? 0) + delta;
  if (q <= 0) {
    cartQty.delete(itemId);
    cartSpreads.delete(itemId);
    document.querySelector(`[data-item-id="${itemId}"]`)?.classList.remove('selected');
  } else {
    cartQty.set(itemId, q);
    const def = MENU.byId[itemId];
    if (def?.hasSpreads) {
      const arr = cartSpreads.get(itemId) ?? [];
      if (delta > 0) arr.push(new Set());
      else arr.pop();
    }
  }
  renderCart();
  refreshSubmit();
}

function toggleSpread(itemId, unitIndex, spreadName) {
  const arr = cartSpreads.get(itemId);
  if (!arr) return;
  const set = arr[unitIndex];
  if (!set) return;
  set.has(spreadName) ? set.delete(spreadName) : set.add(spreadName);
  renderSpreadButtons(itemId, unitIndex);
}

function renderSpreadButtons(itemId, unitIndex) {
  const set = (cartSpreads.get(itemId) ?? [])[unitIndex] ?? new Set();
  const allSpreads = [...MENU.spreadsMain, ...MENU.spreadsCondiments];
  allSpreads.forEach(name => {
    const btn = document.querySelector(`[data-spread="${itemId}:${unitIndex}:${name}"]`);
    if (btn) btn.classList.toggle('selected', set.has(name));
  });
}

// ─── cart rendering ───────────────────────────────────────────────────────────

function renderCart() {
  const section = document.getElementById('cart-section');
  const totalRow = document.getElementById('total-row');

  if (cartQty.size === 0) {
    section.classList.remove('visible');
    totalRow.classList.add('hidden');
    document.getElementById('total-amount').textContent = '';
    return;
  }

  section.classList.add('visible');

  document.getElementById('cart-items').innerHTML =
    [...cartQty.entries()].map(([id, qty]) => buildCartCard(id, qty)).join('');

  const total = calcTotal();
  document.getElementById('total-amount').textContent = `${total}₪`;
  totalRow.classList.remove('hidden');
}

function buildCartCard(itemId, qty) {
  const def     = MENU.byId[itemId];
  if (!def) return '';
  const lineTotal = def.price * qty;

  const spreadsSectionHtml = def.hasSpreads ? buildSpreadsSection(itemId, qty) : '';

  return `
    <div class="cart-card" id="cc-${itemId}">
      <div class="cart-card-top">
        <span class="cc-name">${esc(def.name)}</span>
        <div class="qty-row">
          <button type="button" class="qty-btn remove" onclick="changeQty('${itemId}',-1)">−</button>
          <span class="qty-num">${qty}</span>
          <button type="button" class="qty-btn" onclick="changeQty('${itemId}',1)">+</button>
        </div>
        <span class="cc-price">${lineTotal}₪</span>
      </div>
      ${spreadsSectionHtml}
    </div>`;
}

function buildSpreadsSection(itemId, qty) {
  const spreadsArr = cartSpreads.get(itemId) ?? [];
  const units = [];

  for (let i = 0; i < qty; i++) {
    const selected = spreadsArr[i] ?? new Set();

    const mainBtns = MENU.spreadsMain.map(name => `
      <button type="button"
        class="spread-btn${selected.has(name) ? ' selected' : ''}"
        data-spread="${itemId}:${i}:${name}"
        onclick="toggleSpread('${itemId}',${i},'${name}')">${esc(name)}</button>`).join('');

    const condBtns = MENU.spreadsCondiments.map(name => `
      <button type="button"
        class="spread-btn${selected.has(name) ? ' selected' : ''}"
        data-spread="${itemId}:${i}:${name}"
        onclick="toggleSpread('${itemId}',${i},'${name}')">${esc(name)}</button>`).join('');

    units.push(`
      <div class="spread-unit">
        ${qty > 1 ? `<div class="spread-unit-label">#${i + 1}</div>` : ''}
        <div class="spreads-group">${mainBtns}</div>
        <hr class="spread-divider">
        <div class="spreads-group">${condBtns}</div>
      </div>`);
  }

  return `
    <div class="spreads-section">
      <div class="spreads-title">ממרחים</div>
      ${units.join('')}
    </div>`;
}

// ─── submit validation helpers ────────────────────────────────────────────────

function clearFieldErrors() {
  document.getElementById('f-phone')?.classList.remove('field-error-input');
  const errPhone = document.getElementById('err-phone');
  if (errPhone) errPhone.style.display = 'none';
}

function clearFieldError(inputId, msgId) {
  const el = document.getElementById(inputId);
  if (el) el.classList.remove('field-error-input', 'field-error');
  const msgEl = document.getElementById(msgId);
  if (msgEl) msgEl.style.display = 'none';
}

function showFieldError(inputId, msgId, msg) {
  const el = document.getElementById(inputId);
  if (el) el.classList.add(inputId === 'pickup-grid' ? 'field-error' : 'field-error-input');
  const msgEl = document.getElementById(msgId);
  if (msgEl) { msgEl.textContent = msg; msgEl.style.display = 'block'; }
}

// ─── submit ───────────────────────────────────────────────────────────────────

async function handleSubmit(e) {
  e.preventDefault();
  clearFieldErrors();

  const name  = document.getElementById('f-name').value.trim();
  const phone = document.getElementById('f-phone').value.trim();
  const note  = document.getElementById('f-note').value.trim();
  const items = buildItemsArray();
  const total = calcTotal();

  if (!name || !items.length) return;

  let firstErrorId = null;

  if (phone.replace(/\D/g, '').length < 9) {
    showFieldError('f-phone', 'err-phone', 'יש להזין מספר טלפון תקין');
    firstErrorId ??= 'f-phone';
  }
  if (firstErrorId) {
    document.getElementById(firstErrorId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const btn = document.getElementById('submit-btn');
  btn.disabled    = true;
  btn.textContent = 'שולח…';

  try {
    const order = await api.post('/api/orders', {
      name, phone,
      source: 'whatsapp_form',
      items,
      total,
      note,
    });
    showConfirmation(order);
  } catch (err) {
    alert('שגיאה בשליחת ההזמנה:\n' + err.message);
    btn.disabled    = false;
    btn.textContent = 'שליחת הזמנה';
  }
}

// ─── confirmation ─────────────────────────────────────────────────────────────

function showConfirmation(order) {
  document.getElementById('order-form').classList.add('hidden');
  document.getElementById('conf-num').textContent   = `#${order.id}`;
  document.getElementById('conf-total').textContent = `${order.total}₪`;
  document.getElementById('confirm-state').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── init ─────────────────────────────────────────────────────────────────────

async function init() {
  const isPreview = new URLSearchParams(location.search).has('preview');

  if (isPreview) {
    boothOpen = true;
    applyBoothState();
    return;
  }

  try {
    const booth = await api.get('/api/booth');
    boothOpen  = booth.open;
    boothHours = { open_time: booth.open_time || null, close_time: booth.close_time || null };
  } catch {
    boothOpen = false;
  }

  applyBoothState();

  // Listen for real-time booth open/close from reception screen
  ws.on('booth:updated', (booth) => {
    boothOpen  = booth.open;
    boothHours = { open_time: booth.open_time || null, close_time: booth.close_time || null };
    applyBoothState();
  });
  ws.connect();
}

document.addEventListener('DOMContentLoaded', init);
