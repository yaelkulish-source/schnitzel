const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI environment variable is required');

const client = new MongoClient(uri);
const dbName = process.env.MONGODB_DB || 'schnitzel';

let orders;
let counters;
let booth;

async function connect() {
  await client.connect();
  const database = client.db(dbName);
  orders   = database.collection('orders');
  counters = database.collection('counters');
  booth    = database.collection('booth');

  await orders.createIndex({ id: 1 }, { unique: true });
  await orders.createIndex({ date: 1 });
}

// ─── counter (sequential numeric order IDs) ───────────────────────────────────

async function nextId() {
  const result = await counters.findOneAndUpdate(
    { _id: 'orders' },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return result.seq;
}

// ─── queries ──────────────────────────────────────────────────────────────────

async function getOrdersByDate(date) {
  return orders.find({ date }).sort({ id: 1 }).toArray();
}

async function getOrderById(id) {
  return orders.findOne({ id });
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
    status:         'cooking',
    payment_method: data.payment_method || 'pending',
    paid:           data.paid           || false,
    created_at:     now,
    date:           now.slice(0, 10),
  };

  await orders.insertOne(order);
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

  await orders.updateOne({ id }, { $set });
  return getOrderById(id);
}

async function getSummaryByDate(date) {
  const ordersForDate = await getOrdersByDate(date);

  const revenue = { total: 0, cash: 0, bit: 0, paybox: 0, pending: 0 };
  const itemCounts = {};

  for (const o of ordersForDate) {
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

  const active = ordersForDate.filter(o => o.status !== 'done' && o.status !== 'cancelled');
  return {
    total_orders: active.length + ordersForDate.filter(o => o.status === 'done').length,
    waiting:  ordersForDate.filter(o => o.status === 'waiting').length,
    cooking:  ordersForDate.filter(o => o.status === 'cooking').length,
    ready:    ordersForDate.filter(o => o.status === 'ready').length,
    done:     ordersForDate.filter(o => o.status === 'done').length,
    cancelled: ordersForDate.filter(o => o.status === 'cancelled').length,
    revenue,
    item_counts: itemCounts,
  };
}

async function getDistinctDates() {
  const dates = await orders.distinct('date');
  return dates.sort().reverse();
}

async function getBooth() {
  const doc = await booth.findOne({ _id: 'state' });
  if (!doc) return { open: false, open_time: null, close_time: null };
  return { open: doc.open, open_time: doc.open_time || null, close_time: doc.close_time || null };
}

async function setBooth({ open, open_time, close_time }) {
  const $set = { open };
  if (open_time  !== undefined) $set.open_time  = open_time;
  if (close_time !== undefined) $set.close_time = close_time;
  await booth.updateOne({ _id: 'state' }, { $set }, { upsert: true });
}

async function deleteOrder(id) {
  await orders.deleteOne({ id });
}

async function deleteCompletedOrders(date) {
  await orders.deleteMany({ date, status: 'done' });
}

module.exports = { connect, getOrdersByDate, getOrderById, createOrder, updateOrder, getSummaryByDate, getDistinctDates, getBooth, setBooth, deleteOrder, deleteCompletedOrders };
