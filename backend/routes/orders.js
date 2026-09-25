const express = require('express');
const router = express.Router();
const db = require('../db');
const demoStore = require('../demo');
const asyncHandler = require('../asyncHandler');

// GET /api/orders?date=YYYY-MM-DD  (defaults to today)
router.get('/', asyncHandler(async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const real  = await db.getOrdersByDate(date);
  const demo  = demoStore.getDemoOrders(date);
  res.json([...real, ...demo]);
}));

// GET /api/orders/summary?date=YYYY-MM-DD  — must be before /:id
router.get('/summary', asyncHandler(async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  res.json(await db.getSummaryByDate(date));
}));

// GET /api/orders/dates — list all days that have orders
router.get('/dates', asyncHandler(async (_req, res) => {
  res.json(await db.getDistinctDates());
}));

// POST /api/orders — create a new order (walk-in or whatsapp form)
router.post('/', asyncHandler(async (req, res) => {
  const { name, phone, source, pickup_time, items, total, note, payment_method, paid, demo } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'שם הוא שדה חובה' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'יש לבחור לפחות פריט אחד' });
  }
  if (total == null || typeof total !== 'number' || total < 0) {
    return res.status(400).json({ error: 'סכום לא תקין' });
  }

  if (demo) {
    const order = demoStore.createDemoOrder({ name: name.trim(), phone, source, pickup_time, items, total, note, payment_method, paid });
    req.broadcast({ type: 'order:created', payload: order });
    return res.status(201).json(order);
  }

  const order = await db.createOrder({ name: name.trim(), phone, source, pickup_time, items, total, note, payment_method, paid });
  req.broadcast({ type: 'order:created', payload: order });
  res.status(201).json(order);
}));

// DELETE /api/orders/completed?date=YYYY-MM-DD — must be before /:id
router.delete('/completed', asyncHandler(async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  await db.deleteCompletedOrders(date);
  req.broadcast({ type: 'orders:cleared', payload: { date } });
  res.json({ ok: true });
}));

// DELETE /api/orders/:id — hard delete a single order
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'מזהה הזמנה לא תקין' });
  if (demoStore.getDemoOrderById(id)) {
    demoStore.deleteDemoOrder(id);
  } else {
    await db.deleteOrder(id);
  }
  req.broadcast({ type: 'order:deleted', payload: { id } });
  res.json({ ok: true });
}));

// PATCH /api/orders/:id — update status, payment, note, etc.
router.patch('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'מזהה הזמנה לא תקין' });

  const changes = { ...req.body };
  if (changes.items !== undefined) {
    const items = changes.items;
    const valid = Array.isArray(items) && items.length > 0 && items.every(it =>
      it && typeof it.menu_item === 'string' && it.menu_item.trim() &&
      typeof it.price === 'number' && it.price >= 0 &&
      Number.isInteger(it.quantity) && it.quantity >= 1);
    if (!valid) return res.status(400).json({ error: 'רשימת פריטים לא תקינה' });
    // Total is always derived from the items so it can't drift from them.
    changes.total = items.reduce((sum, it) => sum + it.price * it.quantity, 0);
  }

  const demoOrder = demoStore.getDemoOrderById(id);
  if (demoOrder) {
    const order = demoStore.updateDemoOrder(id, changes);
    req.broadcast({ type: 'order:updated', payload: order });
    return res.json(order);
  }

  const existing = await db.getOrderById(id);
  if (!existing) return res.status(404).json({ error: 'הזמנה לא נמצאה' });

  const order = await db.updateOrder(id, changes);
  req.broadcast({ type: 'order:updated', payload: order });
  res.json(order);
}));

module.exports = router;
