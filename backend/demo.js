// In-memory demo order store — orders created during demo mode are never persisted to DB.
// High IDs (starting at 9000) avoid conflicts with real nedb sequential IDs.

const demoOrders = new Map();
let seq = 9000;

function createDemoOrder(data) {
  const id  = seq++;
  const now = new Date().toISOString();
  const order = {
    id,
    name:           data.name,
    phone:          data.phone           || '',
    source:         data.source          || 'walk_in',
    type:           data.source === 'whatsapp_form' ? 'advance' : 'walk_in',
    pickup_time:    data.pickup_time     || null,
    items:          data.items,
    total:          data.total,
    note:           data.note            || '',
    status:         'cooking',
    payment_method: data.payment_method  || 'pending',
    paid:           data.paid            || false,
    created_at:     now,
    date:           now.slice(0, 10),
    demo:           true,
  };
  demoOrders.set(id, order);
  return order;
}

function updateDemoOrder(id, changes) {
  const order = demoOrders.get(id);
  if (!order) return null;
  const MUTABLE = new Set(['status', 'payment_method', 'paid', 'note', 'items', 'total']);
  for (const [k, v] of Object.entries(changes)) {
    if (MUTABLE.has(k)) order[k] = v;
  }
  return order;
}

function getDemoOrders(date) {
  return [...demoOrders.values()].filter(o => o.date === date);
}

function getDemoOrderById(id) {
  return demoOrders.get(id) || null;
}

function getAllDemoIds() {
  return [...demoOrders.keys()];
}

function clear() {
  demoOrders.clear();
  seq = 9000;
}

module.exports = { createDemoOrder, updateDemoOrder, getDemoOrders, getDemoOrderById, getAllDemoIds, clear };
