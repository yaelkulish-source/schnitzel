// Shopping list screen (phone). Recipe, plan (portions + cart/home marks) and the
// pre-sale checklist live in MongoDB; every change is broadcast over the WebSocket
// so two phones in the supermarket stay in sync.

const CACHE_KEY = 'shoppingCache';
const TAB_KEY   = 'shoppingTab';
const BAKERY    = 'מאפייה';

const state = { recipe: null, plan: null, checklist: null };

// Local changes not yet confirmed by the server — kept on top of incoming
// broadcasts so a tap never flickers back.
const pendingPortions = {};          // k → value
const pendingMarks    = {};          // itemId → { cart?, home? }
const pendingTicks    = {};          // checklist id → done

let recipeDraft = null;              // editable copy of recipe.items while editing
let recipeDirty = false;

// ─── helpers ──────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
const $ = id => document.getElementById(id);
const fmt = n => String(Math.round(n * 100) / 100);
const money = n => `₪${Math.round(n).toLocaleString('he-IL')}`;

function saveCache() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
}
function loadCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; }
}

function portions() {
  return { ...(state.plan?.portions || {}), ...pendingPortions };
}
function marks(id) {
  return { ...(state.plan?.marks?.[id] || {}), ...(pendingMarks[id] || {}) };
}

// ─── in-page confirm ──────────────────────────────────────────────────────────

function confirmDialog(text, okLabel = 'אישור') {
  return new Promise(resolve => {
    $('confirm-text').textContent = text;
    $('confirm-ok').textContent = okLabel;
    $('confirm').classList.add('show');
    const done = v => {
      $('confirm').classList.remove('show');
      $('confirm-ok').onclick = $('confirm-cancel').onclick = $('confirm').onclick = null;
      resolve(v);
    };
    $('confirm-ok').onclick = e => { e.stopPropagation(); done(true); };
    $('confirm-cancel').onclick = e => { e.stopPropagation(); done(false); };
    $('confirm').onclick = e => { if (e.target.id === 'confirm') done(false); };
  });
}

// ─── math ─────────────────────────────────────────────────────────────────────

// One row per recipe item that is needed for the current portions.
function computeList() {
  const p = portions();
  const totalPortions = Object.values(p).reduce((s, v) => s + (v || 0), 0);
  const rows = [];
  for (const it of state.recipe.items) {
    let need = 0;
    for (const [k, per] of Object.entries(it.per || {})) need += (p[k] || 0) * per;
    if (totalPortions > 0) need += it.fixed || 0;
    if (need <= 1e-9) continue;
    const pack  = it.pack > 0 ? it.pack : 1;
    const packs = Math.ceil(need / pack - 1e-9);
    rows.push({ it, need, packs, buy: packs * pack, cost: it.price > 0 ? packs * it.price : null, ...marks(it.id) });
  }
  return rows;
}

function revenue() {
  const p = portions();
  return state.recipe.menu.reduce((s, m) => s + (p[m.k] || 0) * m.price, 0);
}

// Raw kg of chicken needed (not rounded up to packs).
function chickenKg() {
  const p = portions();
  const it = state.recipe.items.find(i => i.id === 'chicken')
          || state.recipe.items.find(i => i.dept === 'בשר ועוף' && i.unit === 'ק"ג');
  if (!it) return 0;
  return Object.entries(it.per || {}).reduce((s, [k, per]) => s + (p[k] || 0) * per, 0);
}

function costSummary(rows) {
  const toBuy = rows.filter(r => !r.home);
  const priced = toBuy.filter(r => r.cost != null);
  return {
    toBuy,
    inCart: toBuy.filter(r => r.cart).length,
    cost: priced.reduce((s, r) => s + r.cost, 0),
    noPrice: toBuy.length - priced.length,
  };
}

// ─── tabs ─────────────────────────────────────────────────────────────────────

function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === `panel-${name}`));
  $('save-bar').classList.toggle('show', name === 'recipe' && recipeDirty);
  try { localStorage.setItem(TAB_KEY, name); } catch { /* ignore */ }
  window.scrollTo(0, 0);
}

// ─── render: portions ─────────────────────────────────────────────────────────

function renderPortions() {
  const p = portions();
  $('portion-list').innerHTML = state.recipe.menu.map((m, i) => `
    ${i ? '<hr style="border:none;border-top:1px solid #eee;margin:10px 0">' : ''}
    <div class="portion">
      <div class="portion-name">${esc(m.name)}<span class="muted">${money(m.price)} למנה</span></div>
      <div class="stepper">
        <button class="step" data-step="${esc(m.k)}" data-d="1" aria-label="הוסף">+</button>
        <input type="number" inputmode="numeric" min="0" data-portion="${esc(m.k)}" value="${p[m.k] || 0}">
        <button class="step" data-step="${esc(m.k)}" data-d="-1" aria-label="הורד">−</button>
      </div>
    </div>`).join('');
  renderPortionStats();
}

function renderPortionStats() {
  const p = portions();
  const total = Object.values(p).reduce((s, v) => s + (v || 0), 0);
  $('portion-stats').innerHTML = `
    <div class="stat"><b>${total}</b><span>מנות</span></div>
    <div class="stat"><b>${fmt(chickenKg())}</b><span>ק״ג עוף</span></div>
    <div class="stat"><b>${money(revenue())}</b><span>הכנסה אם הכול נמכר</span></div>`;
}

function setPortion(k, v) {
  v = Math.max(0, Math.min(10000, Math.round(Number(v) || 0)));
  pendingPortions[k] = v;
  const input = document.querySelector(`[data-portion="${CSS.escape(k)}"]`);
  if (input && document.activeElement !== input) input.value = v;
  renderPortionStats();
  renderList();
  schedulePortionSave();
}

let portionTimer = null;
function schedulePortionSave() {
  clearTimeout(portionTimer);
  portionTimer = setTimeout(savePortions, 400);
}

async function savePortions() {
  const sent = { ...pendingPortions };
  if (!Object.keys(sent).length) return;
  try {
    const plan = await api.patch('/api/shopping/plan/portions', { portions: sent });
    for (const [k, v] of Object.entries(sent)) if (pendingPortions[k] === v) delete pendingPortions[k];
    applyPlan(plan);
  } catch (e) {
    connection.actionFailed('שמירת מנות', e);
  }
}

async function fillAverage() {
  const btn = $('avg-btn');
  btn.disabled = true;
  try {
    const avg = await api.get('/api/shopping/average');
    if (!avg.dates.length) {
      $('avg-info').textContent = 'אין עדיין הזמנות אמיתיות במערכת — אין ממה לחשב ממוצע.';
      return;
    }
    const nice = d => d.split('-').reverse().slice(0, 2).join('.');
    $('avg-info').textContent = `ממוצע של ${avg.dates.length} ימי מכירה אחרונים: ${avg.dates.map(nice).join(', ')} (בלי דמו, בוטלו ואירועים)`;
    for (const [k, v] of Object.entries(avg.portions)) pendingPortions[k] = v;
    renderPortions();
    renderList();
    clearTimeout(portionTimer);
    await savePortions();
  } catch (e) {
    connection.actionFailed('חישוב ממוצע', e);
  } finally {
    btn.disabled = false;
  }
}

// ─── render: shopping list ───────────────────────────────────────────────────

function qtyText(r) {
  const { it, packs, buy } = r;
  if (it.packLabel) return `${packs} × ${esc(it.packLabel)} <span class="row-sub">(${fmt(buy)} ${esc(it.unit)})</span>`;
  if (it.pack === 1) return `${fmt(buy)} ${esc(it.unit)}`;
  return `${fmt(buy)} ${esc(it.unit)} <span class="row-sub">(${packs} × ${fmt(it.pack)})</span>`;
}

function renderList() {
  if (!state.recipe) return;
  const rows = computeList();
  const sum = costSummary(rows);
  const pct = sum.toBuy.length ? Math.round(sum.inCart / sum.toBuy.length * 100) : 0;
  const rev = revenue();

  $('list-summary').innerHTML = rows.length ? `
    <div class="sum-line"><span>בעגלה</span><b>${sum.inCart} מתוך ${sum.toBuy.length}</b></div>
    <div class="progress"><div style="width:${pct}%"></div></div>
    <div class="sum-line"><span>עלות משוערת</span><b>≈ ${money(sum.cost)}</b></div>
    ${sum.noPrice ? `<div class="small muted">${sum.noPrice} ${sum.noPrice === 1 ? 'פריט' : 'פריטים'} בלי מחיר — לא כלולים בעלות</div>` : ''}
    <div class="sum-line"><span>הכנסה אם הכול נמכר</span><b>${money(rev)}</b></div>
    <div class="sum-line"><span>רווח גולמי צפוי</span><b>≈ ${money(rev - sum.cost)}</b></div>
    ${sum.noPrice ? '<div class="small muted">(הרווח בפועל נמוך יותר — חסרים מחירים)</div>' : ''}`
    : '<div class="empty">אין מנות — הגדירו כמות בלשונית "מנות"</div>';

  const depts = [...state.recipe.departments];
  for (const r of rows) if (!depts.includes(r.it.dept)) depts.push(r.it.dept);

  $('list-body').innerHTML = depts.map(d => {
    const dr = rows.filter(r => r.it.dept === d);
    if (!dr.length) return '';
    return `
      <div class="dept-title">${esc(d)}${d === BAKERY ? ' <span class="badge bakery">במאפייה</span>' : ''}</div>
      <div class="dept">${dr.map(r => `
        <div class="row${r.cart ? ' cart' : ''}${r.home ? ' home' : ''}">
          <div>
            <div class="row-name">${esc(r.it.name)} ${r.it.check ? '<span class="badge check">לבדוק</span>' : ''}</div>
            <div class="row-qty">${qtyText(r)}</div>
            <div class="row-sub">צריך ${fmt(r.need)} ${esc(r.it.unit)}${r.cost != null ? ` · ≈ ${money(r.cost)}` : ' · אין מחיר'}${r.home ? ' · יש בבית, לא קונים' : ''}</div>
          </div>
          <div class="row-btns">
            <button class="tog cart-btn${r.cart ? ' on' : ''}" data-mark="cart" data-id="${esc(r.it.id)}">${r.cart ? '✓ בעגלה' : 'בעגלה'}</button>
            <button class="tog home-btn${r.home ? ' on' : ''}" data-mark="home" data-id="${esc(r.it.id)}">🏠 יש בבית</button>
          </div>
        </div>`).join('')}
      </div>`;
  }).join('');

  $('clear-marks-btn').style.display = rows.length ? '' : 'none';
}

async function toggleMark(id, field) {
  const value = !marks(id)[field];
  (pendingMarks[id] ??= {})[field] = value;
  renderList();
  try {
    const plan = await api.patch(`/api/shopping/plan/marks/${encodeURIComponent(id)}`, { [field]: value });
    if (pendingMarks[id]?.[field] === value) delete pendingMarks[id][field];
    applyPlan(plan);
  } catch (e) {
    delete pendingMarks[id]?.[field];
    renderList();
    connection.actionFailed('סימון', e);
  }
}

async function clearMarks() {
  if (!await confirmDialog('לנקות את כל הסימונים (בעגלה + יש בבית)?', 'נקה')) return;
  try {
    for (const k of Object.keys(pendingMarks)) delete pendingMarks[k];
    applyPlan(await api.post('/api/shopping/plan/clear-marks', {}));
  } catch (e) {
    connection.actionFailed('ניקוי סימונים', e);
  }
}

// ─── render: recipe editor ───────────────────────────────────────────────────

function startDraft() {
  recipeDraft = JSON.parse(JSON.stringify(state.recipe.items));
  recipeDirty = false;
  $('recipe-notice').style.display = 'none';
}

function setDirty() {
  if (!recipeDirty) { recipeDirty = true; $('save-bar').classList.add('show'); }
}

function renderRecipe() {
  if (!recipeDraft) startDraft();
  $('dept-list').innerHTML = state.recipe.departments.map(d => `<option value="${esc(d)}">`).join('');
  const menu = state.recipe.menu;
  $('recipe-body').innerHTML = recipeDraft.length ? recipeDraft.map((it, i) => `
    <div class="card ritem" data-i="${i}">
      <div class="ritem-head">
        <input data-f="name" value="${esc(it.name)}" placeholder="שם הפריט" aria-label="שם הפריט">
        <button class="icon-btn" data-del="${i}" aria-label="מחק פריט">🗑</button>
      </div>
      <div class="grid">
        <label class="f">מחלקה<input data-f="dept" list="dept-list" value="${esc(it.dept)}" autocomplete="off"></label>
        <label class="f">יחידה<input data-f="unit" value="${esc(it.unit)}"></label>
      </div>
      <fieldset><legend>כמות למנה (${esc(it.unit || 'יחידה')})</legend>
        <div class="grid four">${menu.map(m => `
          <label class="f">${esc(m.name)}<input data-per="${esc(m.k)}" type="number" inputmode="decimal" step="any" min="0" value="${it.per?.[m.k] ?? ''}" placeholder="0"></label>`).join('')}
        </div>
      </fieldset>
      <div class="grid">
        <label class="f">קבוע לכל מכירה<input data-n="fixed" type="number" inputmode="decimal" step="any" min="0" value="${it.fixed || ''}" placeholder="0"></label>
        <label class="f">גודל אריזה (${esc(it.unit || 'יחידה')})<input data-n="pack" type="number" inputmode="decimal" step="any" min="0" value="${it.pack}"></label>
        <label class="f">שם אריזה<input data-f="packLabel" value="${esc(it.packLabel)}" placeholder="למשל: שקית 500 גרם"></label>
        <label class="f">מחיר לאריזה (₪ כולל מע״מ)<input data-n="price" type="number" inputmode="decimal" step="any" min="0" value="${it.price || ''}" placeholder="אין מחיר"></label>
      </div>
      <label class="f">הערה<textarea data-f="note" rows="1">${esc(it.note)}</textarea></label>
      <label class="chk"><input type="checkbox" data-c="check" ${it.check ? 'checked' : ''}> לבדוק (הערכה)</label>
    </div>`).join('') : '<div class="empty">אין פריטים</div>';
}

function onRecipeInput(e) {
  const card = e.target.closest('.ritem');
  if (!card) return;
  const it = recipeDraft[+card.dataset.i];
  const t = e.target;
  if (t.dataset.f) it[t.dataset.f] = t.value;
  else if (t.dataset.n) it[t.dataset.n] = t.value === '' ? 0 : Number(t.value);
  else if (t.dataset.per) {
    it.per ??= {};
    if (t.value === '' || Number(t.value) === 0) delete it.per[t.dataset.per];
    else it.per[t.dataset.per] = Number(t.value);
  } else if (t.dataset.c) it[t.dataset.c] = t.checked;
  else return;
  setDirty();
}

function addRecipeItem() {
  recipeDraft.push({
    id: `i${Date.now().toString(36)}`, name: '', dept: state.recipe.departments[0] || '', unit: 'יח׳',
    per: {}, fixed: 0, pack: 1, packLabel: '', price: 0, check: true, note: '',
  });
  setDirty();
  renderRecipe();
  const cards = document.querySelectorAll('.ritem');
  const last = cards[cards.length - 1];
  last?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  last?.querySelector('[data-f="name"]')?.focus();
}

async function deleteRecipeItem(i) {
  const it = recipeDraft[i];
  if (!await confirmDialog(`למחוק את "${it.name || 'פריט חדש'}" מהמתכון? (נמחק סופית אחרי שמירה)`, 'מחק')) return;
  recipeDraft.splice(i, 1);
  setDirty();
  renderRecipe();
}

async function saveRecipe() {
  const bad = recipeDraft.find(it => !it.name.trim());
  if (bad) return showToast('לכל פריט צריך שם');
  const badPack = recipeDraft.find(it => !(it.pack > 0));
  if (badPack) return showToast(`גודל אריזה חייב להיות גדול מ־0 ("${badPack.name}")`);
  const btn = $('save-btn');
  btn.disabled = true;
  try {
    const recipe = await api.put('/api/shopping/recipe', { items: recipeDraft });
    state.recipe = recipe;
    saveCache();
    startDraft();
    $('save-bar').classList.remove('show');
    renderAll();
    btn.textContent = '✓ נשמר';
    setTimeout(() => { btn.textContent = '💾 שמור מתכון'; }, 1500);
  } catch (e) {
    connection.actionFailed('שמירת מתכון', e);
  } finally {
    btn.disabled = false;
  }
}

async function discardRecipe() {
  if (!await confirmDialog('לבטל את כל השינויים במתכון?', 'בטל שינויים')) return;
  startDraft();
  $('save-bar').classList.remove('show');
  renderRecipe();
}

// ─── render: checklist ───────────────────────────────────────────────────────

function clItems() {
  return (state.checklist?.items || []).map(c => (c.id in pendingTicks ? { ...c, done: pendingTicks[c.id] } : c));
}

function renderChecklist() {
  const items = clItems();
  const groups = [...new Set(items.map(c => c.group))];
  const done = items.filter(c => c.done).length;
  $('cl-summary').innerHTML = `
    <div class="sum-line"><span>בוצע</span><b>${done} מתוך ${items.length}</b></div>
    <div class="progress"><div style="width:${items.length ? Math.round(done / items.length * 100) : 0}%"></div></div>`;
  $('cl-groups').innerHTML = groups.map(g => `<option value="${esc(g)}">`).join('');
  $('cl-body').innerHTML = groups.map(g => `
    <div class="dept-title">${esc(g)}</div>
    <div class="dept">${items.filter(c => c.group === g).map(c => `
      <div class="cl-row">
        <button class="cl-tick${c.done ? ' done' : ''}" data-tick="${esc(c.id)}"><span class="cl-box">${c.done ? '✓' : ''}</span><span class="cl-text">${esc(c.text)}</span></button>
        <button class="cl-del" data-cldel="${esc(c.id)}" aria-label="הסר">✕</button>
      </div>`).join('')}
    </div>`).join('') || '<div class="empty">הרשימה ריקה</div>';
}

async function toggleTick(id) {
  const c = clItems().find(x => x.id === id);
  if (!c) return;
  const value = !c.done;
  pendingTicks[id] = value;
  renderChecklist();
  try {
    const doc = await api.patch(`/api/shopping/checklist/${encodeURIComponent(id)}`, { done: value });
    if (pendingTicks[id] === value) delete pendingTicks[id];
    applyChecklist(doc);
  } catch (e) {
    delete pendingTicks[id];
    renderChecklist();
    connection.actionFailed('סימון', e);
  }
}

async function addChecklistItem() {
  const group = $('cl-group').value.trim();
  const text  = $('cl-text').value.trim();
  if (!group || !text) return showToast('צריך קבוצה וטקסט');
  try {
    applyChecklist(await api.post('/api/shopping/checklist', { group, text }));
    $('cl-text').value = '';
  } catch (e) {
    connection.actionFailed('הוספה', e);
  }
}

async function removeChecklistItem(id) {
  const c = clItems().find(x => x.id === id);
  if (!c || !await confirmDialog(`להסיר את "${c.text}" מהרשימה?`, 'הסר')) return;
  try {
    applyChecklist(await api.delete(`/api/shopping/checklist/${encodeURIComponent(id)}`));
  } catch (e) {
    connection.actionFailed('הסרה', e);
  }
}

async function resetChecklist() {
  if (!await confirmDialog('מכירה חדשה — לבטל את כל הסימונים ברשימת "לפני מכירה"?', 'מכירה חדשה')) return;
  try {
    for (const k of Object.keys(pendingTicks)) delete pendingTicks[k];
    applyChecklist(await api.post('/api/shopping/checklist/reset', {}));
  } catch (e) {
    connection.actionFailed('מכירה חדשה', e);
  }
}

// ─── state updates (from REST responses and WebSocket broadcasts) ────────────

function applyPlan(plan) {
  if (!plan) return;
  state.plan = plan;
  saveCache();
  // Refresh portion inputs the user isn't typing in.
  const p = portions();
  document.querySelectorAll('[data-portion]').forEach(inp => {
    if (document.activeElement !== inp) inp.value = p[inp.dataset.portion] || 0;
  });
  renderPortionStats();
  renderList();
}

function applyChecklist(doc) {
  if (!doc) return;
  state.checklist = doc;
  saveCache();
  renderChecklist();
}

function applyRecipe(recipe) {
  if (!recipe) return;
  state.recipe = recipe;
  saveCache();
  if (recipeDirty) {
    // Don't throw away edits in progress — offer to load the other phone's version.
    const n = $('recipe-notice');
    n.innerHTML = 'המתכון עודכן בטלפון אחר. <button class="big-btn secondary" style="margin-top:8px" id="reload-recipe">טען את הגרסה החדשה (מבטל את השינויים שלי)</button>';
    n.style.display = 'block';
    $('reload-recipe').onclick = () => { startDraft(); $('save-bar').classList.remove('show'); renderRecipe(); };
  } else {
    startDraft();
    renderRecipe();
  }
  renderPortions();
  renderList();
}

function renderAll() {
  if (!state.recipe) return;
  renderPortions();
  renderList();
  if (!recipeDirty) renderRecipe();
  renderChecklist();
}

async function loadAll() {
  const data = await api.get('/api/shopping');
  state.plan = data.plan;
  state.checklist = data.checklist;
  saveCache();
  if (recipeDirty) applyRecipe(data.recipe);
  else { state.recipe = data.recipe; startDraft(); }
  renderAll();
}

// ─── init ─────────────────────────────────────────────────────────────────────

function bindEvents() {
  $('tabs').addEventListener('click', e => { const t = e.target.closest('.tab'); if (t) showTab(t.dataset.tab); });

  $('portion-list').addEventListener('click', e => {
    const b = e.target.closest('[data-step]');
    if (b) setPortion(b.dataset.step, (portions()[b.dataset.step] || 0) + Number(b.dataset.d));
  });
  $('portion-list').addEventListener('input', e => {
    const k = e.target.dataset.portion;
    if (k && e.target.value !== '') setPortion(k, e.target.value);
  });
  $('portion-list').addEventListener('focusin', e => { if (e.target.dataset.portion) e.target.select(); });
  $('portion-list').addEventListener('focusout', e => {
    const k = e.target.dataset.portion;
    if (k) e.target.value = portions()[k] || 0;
  });
  $('avg-btn').addEventListener('click', fillAverage);

  $('list-body').addEventListener('click', e => {
    const b = e.target.closest('[data-mark]');
    if (b) toggleMark(b.dataset.id, b.dataset.mark);
  });
  $('clear-marks-btn').addEventListener('click', clearMarks);

  $('recipe-body').addEventListener('input', onRecipeInput);
  $('recipe-body').addEventListener('change', onRecipeInput);
  $('recipe-body').addEventListener('click', e => {
    const b = e.target.closest('[data-del]');
    if (b) deleteRecipeItem(+b.dataset.del);
  });
  $('add-item-btn').addEventListener('click', addRecipeItem);
  $('save-btn').addEventListener('click', saveRecipe);
  $('discard-btn').addEventListener('click', discardRecipe);

  $('cl-body').addEventListener('click', e => {
    const t = e.target.closest('[data-tick]');
    if (t) return toggleTick(t.dataset.tick);
    const d = e.target.closest('[data-cldel]');
    if (d) removeChecklistItem(d.dataset.cldel);
  });
  $('cl-add-btn').addEventListener('click', addChecklistItem);
  $('cl-text').addEventListener('keydown', e => { if (e.key === 'Enter') addChecklistItem(); });
  $('cl-reset-btn').addEventListener('click', resetChecklist);

  // Unsaved recipe edits — warn before leaving the page.
  window.addEventListener('beforeunload', e => { if (recipeDirty) { e.preventDefault(); e.returnValue = ''; } });
}

async function init() {
  bindEvents();
  let tab = 'list';
  try { tab = localStorage.getItem(TAB_KEY) || 'portions'; } catch { tab = 'portions'; }
  showTab(['portions', 'list', 'recipe', 'checklist'].includes(tab) ? tab : 'portions');

  // Show the last known data at once (weak reception in the supermarket), then refresh.
  const cached = loadCache();
  if (cached?.recipe) { Object.assign(state, cached); startDraft(); renderAll(); }

  try {
    await loadAll();
  } catch (e) {
    console.warn('Server unavailable — showing cached data', e);
  }

  ws.on('shopping:plan',      applyPlan);
  ws.on('shopping:checklist', applyChecklist);
  ws.on('shopping:recipe',    applyRecipe);

  // Clear "no connection" banner + auto-retry; reload once the server is back.
  connection.start({ dotId: 'conn-dot', textId: 'conn-text', onRecover: () =>
    loadAll().catch(e => console.error('Reload after reconnect failed', e)) });
  ws.connect();
}

document.addEventListener('DOMContentLoaded', init);
