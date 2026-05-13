const Datastore = require('@seald-io/nedb');
const path = require('path');

const ds = new Datastore({
  filename: path.join(__dirname, 'schnitzel.db'),
  autoload: true,
});

ds.ensureIndex({ fieldName: 'date' });
ds.ensureIndex({ fieldName: 'id', sparse: true });

// ─── counter (sequential numeric order IDs) ───────────────────────────────────

async function nextId() {
  const result = await ds.updateAsync(
    { _id: '__counter__' },
    { $inc: { seq: 1 } },
    { upsert: true, returnUpdatedDocs: true }
  );
  return result.affectedDocuments.seq;
}

// ─── queries ──────────────────────────────────────────────────────────────────

async function getOrdersByDate(date) {
  return ds.findAsync({ date, _id: { $ne: '__counter__' } }).sort({ id: 1 });
}

async function getOrderById(id) {
  return ds.findOneAsync({ id });
}

async function createOrder(data) {
  const id = await nextId();
  const now = new Date().toISOString();
  const source = data.source || 'walk_in';

  const order = {
    id,
    name:           data.name,
    phone:          data.phone          || '',
    source,
    type:           source === 'whatsapp_form' ? 'advance' : 'walk_in',
    pickup_time:    data.pickup_time    || null,
    items:          data.items,
    total:          data.total,
    note:           data.note           || '',
    status:         'waiting',
    payment_method: data.payment_method || 'pending',
    paid:           data.paid           || false,
    created_at:     now,
    date:           now.slice(0, 10),
  };

  await ds.insertAsync(order);
  return order;
}

// Allowed mutable fields — guards against mass-assignment
const MUTABLE = new Set(['status', 'payment_method', 'paid', 'note', 'items', 'total']);

async function updateOrder(id, changes) {
  const $set = {};
  for (const [k, v] of Object.entries(changes)) {
    if (MUTABLE.has(k)) $set[k] = v;
  }
  if (Object.keys($set).length === 0) return getOrderById(id);

  await ds.updateAsync({ id }, { $set });
  return getOrderById(id);
}

async function getSummaryByDate(date) {
  const orders = await getOrdersByDate(date);

  const revenue = { total: 0, cash: 0, bit: 0, paybox: 0, pending: 0 };
  const itemCounts = {};

  for (const o of orders) {
    if (o.status === 'cancelled') continue;
    if (o.paid) {
      revenue.total += o.total;
      revenue[o.payment_method] = (revenue[o.payment_method] || 0) + o.total;
    } else {
      revenue.pending += o.total;
    }
    for (const item of o.items) {
      itemCounts[item.menu_item] = (itemCounts[item.menu_item] || 0) + item.quantity;
    }
  }

  const active = orders.filter(o => o.status !== 'done' && o.status !== 'cancelled');
  return {
    total_orders: active.length + orders.filter(o => o.status === 'done').length,
    waiting:  orders.filter(o => o.status === 'waiting').length,
    cooking:  orders.filter(o => o.status === 'cooking').length,
    ready:    orders.filter(o => o.status === 'ready').length,
    done:     orders.filter(o => o.status === 'done').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
    revenue,
    item_counts: itemCounts,
  };
}

async function getDistinctDates() {
  const docs = await ds.findAsync({ _id: { $ne: '__counter__' } }, { date: 1, _id: 0 });
  return [...new Set(docs.map(d => d.date))].sort().reverse();
}

async function getBooth() {
  const doc = await ds.findOneAsync({ _id: '__booth__' });
  return doc ? doc.open : false;
}

async function setBooth(open) {
  await ds.updateAsync({ _id: '__booth__' }, { $set: { open } }, { upsert: true });
}

async function deleteOrder(id) {
  await ds.removeAsync({ id }, {});
}

async function deleteCompletedOrders(date) {
  await ds.removeAsync({ date, status: 'done' }, { multi: true });
}

module.exports = { getOrdersByDate, getOrderById, createOrder, updateOrder, getSummaryByDate, getDistinctDates, getBooth, setBooth, deleteOrder, deleteCompletedOrders };
