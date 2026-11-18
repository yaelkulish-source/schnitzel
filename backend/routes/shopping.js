// Shopping list screen (shopping.html): recipe, current plan and pre-sale checklist.
// Every change is broadcast as 'shopping:<doc>' with the full updated doc, so
// two phones in the supermarket stay in sync.
const express = require('express');
const router = express.Router();
const db = require('../db');
const asyncHandler = require('../asyncHandler');

const isNum = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const str = (v, max = 200) => typeof v === 'string' && v.length <= max;

function send(req, res, type, doc) {
  req.broadcast({ type: `shopping:${type}`, payload: doc });
  res.json(doc);
}

// GET /api/shopping — everything the screen needs in one call
router.get('/', asyncHandler(async (_req, res) => {
  res.json(await db.getShopping());
}));

// GET /api/shopping/average — average portions over the last 3 real sale days
router.get('/average', asyncHandler(async (_req, res) => {
  const recipe = await db.getShoppingDoc('recipe');
  const names = recipe.menu.map(m => m.name);
  const { dates, average, perDate } = await db.getAveragePortions(names, 3);
  const byKey = k => Object.fromEntries(recipe.menu.map(m => [m.k, k(m.name)]));
  res.json({
    dates,
    portions: byKey(n => average[n]),
    perDate: Object.fromEntries(dates.map(d => [d, byKey(n => perDate[d][n] || 0)])),
  });
}));

// ─── recipe ───────────────────────────────────────────────────────────────────

// PUT /api/shopping/recipe { items, departments? } — replaces the item list
router.put('/recipe', asyncHandler(async (req, res) => {
  const recipe = await db.getShoppingDoc('recipe');
  const menuKeys = new Set(recipe.menu.map(m => m.k));
  const { items } = req.body;
  if (!Array.isArray(items) || items.length > 300) return res.status(400).json({ error: 'רשימת פריטים לא תקינה' });

  const ids = new Set();
  const clean = [];
  for (const it of items) {
    if (!it || !str(it.id, 60) || !it.id || ids.has(it.id)) return res.status(400).json({ error: 'מזהה פריט לא תקין' });
    if (!str(it.name) || !it.name.trim()) return res.status(400).json({ error: 'לכל פריט צריך שם' });
    if (!str(it.dept, 60) || !str(it.unit, 30) || !str(it.packLabel ?? '', 60) || !str(it.note ?? '', 300)) {
      return res.status(400).json({ error: `שדה טקסט לא תקין ב"${it.name}"` });
    }
    if (!isNum(it.fixed) || !isNum(it.price) || !isNum(it.pack) || it.pack <= 0) {
      return res.status(400).json({ error: `מספר לא תקין ב"${it.name}" (גודל אריזה חייב להיות גדול מ־0)` });
    }
    const per = {};
    for (const [k, v] of Object.entries(it.per || {})) {
      if (!menuKeys.has(k) || !isNum(v)) return res.status(400).json({ error: `כמות למנה לא תקינה ב"${it.name}"` });
      if (v > 0) per[k] = v;
    }
    ids.add(it.id);
    clean.push({
      id: it.id, name: it.name.trim(), dept: it.dept.trim(), unit: it.unit.trim(),
      per, fixed: it.fixed, pack: it.pack, packLabel: (it.packLabel || '').trim(),
      price: it.price, check: !!it.check, note: (it.note || '').trim(),
    });
  }

  // Keep the department order; append any new department typed in the editor.
  const departments = [...recipe.departments];
  for (const it of clean) if (it.dept && !departments.includes(it.dept)) departments.push(it.dept);

  const doc = await db.updateShoppingDoc('recipe', { $set: { items: clean, departments } });
  send(req, res, 'recipe', doc);
}));

// ─── plan (portions + cart/home marks) ───────────────────────────────────────

// PATCH /api/shopping/plan/portions { portions: { challah: 40, ... } }  (partial ok)
router.patch('/plan/portions', asyncHandler(async (req, res) => {
  const recipe = await db.getShoppingDoc('recipe');
  const menuKeys = new Set(recipe.menu.map(m => m.k));
  const $set = {};
  for (const [k, v] of Object.entries(req.body.portions || {})) {
    if (!menuKeys.has(k) || !Number.isInteger(v) || v < 0 || v > 10000) {
      return res.status(400).json({ error: 'מספר מנות לא תקין' });
    }
    $set[`portions.${k}`] = v;
  }
  if (!Object.keys($set).length) return res.status(400).json({ error: 'אין שינוי' });
  send(req, res, 'plan', await db.updateShoppingDoc('plan', { $set }));
}));

// PATCH /api/shopping/plan/marks/:id { cart?: bool, home?: bool }
// Field-level update so two phones ticking different rows never overwrite each other.
router.patch('/plan/marks/:id', asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!/^[\w-]{1,60}$/.test(id)) return res.status(400).json({ error: 'מזהה לא תקין' });
  const $set = {};
  for (const f of ['cart', 'home']) {
    if (req.body[f] === undefined) continue;
    if (typeof req.body[f] !== 'boolean') return res.status(400).json({ error: `${f} must be boolean` });
    $set[`marks.${id}.${f}`] = req.body[f];
  }
  if (!Object.keys($set).length) return res.status(400).json({ error: 'אין שינוי' });
  send(req, res, 'plan', await db.updateShoppingDoc('plan', { $set }));
}));

// POST /api/shopping/plan/clear-marks — "ניקוי סימונים"
router.post('/plan/clear-marks', asyncHandler(async (req, res) => {
  send(req, res, 'plan', await db.updateShoppingDoc('plan', { $set: { marks: {} } }));
}));

// ─── checklist ("לפני מכירה") ────────────────────────────────────────────────

// POST /api/shopping/checklist { group, text } — add an item
router.post('/checklist', asyncHandler(async (req, res) => {
  const { group, text } = req.body;
  if (!str(group, 60) || !group.trim() || !str(text) || !text.trim()) {
    return res.status(400).json({ error: 'צריך קבוצה וטקסט' });
  }
  const item = { id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, group: group.trim(), text: text.trim(), done: false };
  send(req, res, 'checklist', await db.updateShoppingDoc('checklist', { $push: { items: item } }));
}));

// POST /api/shopping/checklist/reset — "מכירה חדשה": untick everything
router.post('/checklist/reset', asyncHandler(async (req, res) => {
  send(req, res, 'checklist', await db.updateShoppingDoc('checklist', { $set: { 'items.$[].done': false } }));
}));

// PATCH /api/shopping/checklist/:id { done }
router.patch('/checklist/:id', asyncHandler(async (req, res) => {
  if (typeof req.body.done !== 'boolean') return res.status(400).json({ error: 'done must be boolean' });
  const doc = await db.updateShoppingDoc('checklist', {
    $set: { 'items.$[it].done': req.body.done },
  }, { arrayFilters: [{ 'it.id': req.params.id }] });
  send(req, res, 'checklist', doc);
}));

// DELETE /api/shopping/checklist/:id
router.delete('/checklist/:id', asyncHandler(async (req, res) => {
  send(req, res, 'checklist', await db.updateShoppingDoc('checklist', { $pull: { items: { id: req.params.id } } }));
}));

module.exports = router;
