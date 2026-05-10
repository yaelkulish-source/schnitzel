const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/orders?date=YYYY-MM-DD  (defaults to today)
router.get('/', async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  res.json(await db.getOrdersByDate(date));
});

// GET /api/orders/summary?date=YYYY-MM-DD  — must be before /:id
router.get('/summary', async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  res.json(await db.getSummaryByDate(date));
});

// GET /api/orders/dates — list all days that have orders
router.get('/dates', async (_req, res) => {
  res.json(await db.getDistinctDates());
});

// POST /api/orders — create a new order (walk-in or whatsapp form)
router.post('/', async (req, res) => {
  const { name, phone, source, pickup_time, items, total, note, payment_method, paid } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'שם הוא שדה חובה' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'יש לבחור לפחות פריט אחד' });
  }
  if (total == null || typeof total !== 'number' || total < 0) {
    return res.status(400).json({ error: 'סכום לא תקין' });
  }

  const order = await db.createOrder({ name: name.trim(), phone, source, pickup_time, items, total, note, payment_method, paid });
  req.broadcast({ type: 'order:created', payload: order });
  res.status(201).json(order);
});

// PATCH /api/orders/:id — update status, payment, note, etc.
router.patch('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'מזהה הזמנה לא תקין' });

  const existing = await db.getOrderById(id);
  if (!existing) return res.status(404).json({ error: 'הזמנה לא נמצאה' });

  const order = await db.updateOrder(id, req.body);
  req.broadcast({ type: 'order:updated', payload: order });
  res.json(order);
});

module.exports = router;
