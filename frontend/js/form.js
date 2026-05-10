// Customer order form — opened from a WhatsApp link on the customer's phone.
// Goal: fill and submit in under 30 seconds.
// Active only on Tuesdays 18:00–20:30. Add ?preview=1 to bypass for testing.

// ─── pickup time options ──────────────────────────────────────────────────────

const PICKUP_TIMES = (() => {
  const times = [];
  for (let h = 18; h <= 20; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 20 && m > 30) break;
      times.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
    }
  }
  return times; // 18:00 … 20:30
})();

// ─── state ────────────────────────────────────────────────────────────────────

let selectedPickup = null;
const cartQty     = new Map(); // item id → quantity
const cartSpreads = new Map(); // item id → Set<spreadName>

// ─── helpers ──────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function isOpen() {
  if (new URLSearchParams(location.search).has('preview')) return true;
  const now = new Date();
  if (now.getDay() !== 2) return false; // 2 = Tuesday
  const mins = now.getHours() * 60 + now.getMinutes();
  return mins >= 18 * 60 && mins <= 20 * 60 + 30;
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
    const spreads = def.hasSpreads ? [...(cartSpreads.get(id) ?? [])] : [];
    items.push({ menu_item: def.name, price: def.price, quantity: qty, spreads });
  }
  return items;
}

function refreshSubmit() {
  const name     = document.getElementById('f-name').value.trim();
  const phone    = document.getElementById('f-phone').value.replace(/\D/g,'');
  const hasItems = cartQty.size > 0;
  document.getElementById('submit-btn').disabled =
    !name || phone.length < 9 || !selectedPickup || !hasItems;
}

// ─── pickup time grid ─────────────────────────────────────────────────────────

function renderPickupGrid() {
  document.getElementById('pickup-grid').innerHTML = PICKUP_TIMES.map(t => `
    <button type="button" class="pickup-btn" data-time="${t}" onclick="selectPickup('${t}')">
      ${t}
    </button>`).join('');
}

function selectPickup(time) {
  selectedPickup = time;
  document.querySelectorAll('.pickup-btn').forEach(b =>
    b.classList.toggle('selected', b.dataset.time === time));
  refreshSubmit();
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
  if (cartQty.has(itemId)) {
    // Already in cart → bump qty by 1
    cartQty.set(itemId, cartQty.get(itemId) + 1);
  } else {
    cartQty.set(itemId, 1);
    const def = MENU.byId[itemId];
    if (def?.hasSpreads) cartSpreads.set(itemId, new Set());
  }
  document.querySelector(`[data-item-id="${itemId}"]`)?.classList.add('selected');
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
  }
  renderCart();
  refreshSubmit();
}

function toggleSpread(itemId, spreadName) {
  const set = cartSpreads.get(itemId);
  if (!set) return;
  set.has(spreadName) ? set.delete(spreadName) : set.add(spreadName);
  // Re-render only the spread buttons for this item (avoid full cart re-render)
  renderSpreadButtons(itemId);
}

function renderSpreadButtons(itemId) {
  const allSpreads = [...MENU.spreadsMain, ...MENU.spreadsCondiments];
  allSpreads.forEach(name => {
    const btn = document.querySelector(`[data-spread="${itemId}:${name}"]`);
    if (btn) btn.classList.toggle('selected', cartSpreads.get(itemId)?.has(name));
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

  const spreadsSectionHtml = def.hasSpreads ? buildSpreadsSection(itemId) : '';

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

function buildSpreadsSection(itemId) {
  const selected = cartSpreads.get(itemId) ?? new Set();

  const mainBtns = MENU.spreadsMain.map(name => `
    <button type="button"
      class="spread-btn${selected.has(name) ? ' selected' : ''}"
      data-spread="${itemId}:${name}"
      onclick="toggleSpread('${itemId}','${name}')">${esc(name)}</button>`).join('');

  const condBtns = MENU.spreadsCondiments.map(name => `
    <button type="button"
      class="spread-btn${selected.has(name) ? ' selected' : ''}"
      data-spread="${itemId}:${name}"
      onclick="toggleSpread('${itemId}','${name}')">${esc(name)}</button>`).join('');

  return `
    <div class="spreads-section">
      <div class="spreads-title">ממרחים</div>
      <div class="spreads-group">${mainBtns}</div>
      <hr class="spread-divider">
      <div class="spreads-group">${condBtns}</div>
    </div>`;
}

// ─── submit ───────────────────────────────────────────────────────────────────

async function handleSubmit(e) {
  e.preventDefault();

  const name  = document.getElementById('f-name').value.trim();
  const phone = document.getElementById('f-phone').value.trim();
  const note  = document.getElementById('f-note').value.trim();
  const items = buildItemsArray();
  const total = calcTotal();

  if (!name || !phone || !selectedPickup || !items.length) return;

  const btn = document.getElementById('submit-btn');
  btn.disabled    = true;
  btn.textContent = 'שולח…';

  try {
    const order = await api.post('/api/orders', {
      name, phone,
      source:      'whatsapp_form',
      pickup_time: selectedPickup,
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
  document.getElementById('conf-num').textContent    = `#${order.id}`;
  document.getElementById('conf-total').textContent  = `${order.total}₪`;
  document.getElementById('conf-pickup').textContent = order.pickup_time;
  document.getElementById('confirm-state').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── init ─────────────────────────────────────────────────────────────────────

function init() {
  if (!isOpen()) {
    document.getElementById('closed-state').classList.remove('hidden');
    return;
  }

  renderPickupGrid();
  renderMenuGrids();

  document.getElementById('f-name').addEventListener('input',  refreshSubmit);
  document.getElementById('f-phone').addEventListener('input', refreshSubmit);
  document.getElementById('order-form').addEventListener('submit', handleSubmit);

  document.getElementById('order-form').classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', init);
