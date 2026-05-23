// ── Shared storage helpers ──────────────────────────────────────────────────
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

// ── Validation ──────────────────────────────────────────────────────────────
function validatePhone(phone) {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 15;
}

// ── Submit ──────────────────────────────────────────────────────────────────
function submitOrder() {
  const name       = document.getElementById('name').value.trim();
  const phone      = document.getElementById('phone').value.trim();
  const items      = document.getElementById('items').value.trim();
  const pickupTime = document.getElementById('pickupTime').value; // "HH:MM" or ""

  if (!name) {
    alert('נא להכניס שם');
    document.getElementById('name').focus();
    return;
  }
  if (!phone || !validatePhone(phone)) {
    alert('נא להכניס מספר טלפון תקין (לפחות 9 ספרות)');
    document.getElementById('phone').focus();
    return;
  }
  if (!items) {
    alert('נא לציין מה תרצו להזמין');
    document.getElementById('items').focus();
    return;
  }

  const order = {
    id:         generateId(),
    name,
    phone,
    items,
    pickupTime: pickupTime || null,   // null = no pickup time
    source:     'form',
    status:     'pending',
    createdAt:  Date.now(),
    readyAt:    null,
  };

  const orders = getOrders();
  orders.push(order);
  saveOrders(orders);

  showConfirmation();
}

// ── UI helpers ───────────────────────────────────────────────────────────────
function showConfirmation() {
  document.getElementById('formScreen').style.display    = 'none';
  document.getElementById('confirmScreen').style.display = 'block';
}

function resetForm() {
  document.getElementById('name').value       = '';
  document.getElementById('phone').value      = '';
  document.getElementById('items').value      = '';
  document.getElementById('pickupTime').value = '';

  document.getElementById('confirmScreen').style.display = 'none';
  document.getElementById('formScreen').style.display    = '';
  document.getElementById('name').focus();
}
