// Single source of truth for all menu items, prices, and spread rules.
// Imported by reception.html, fryer.html, and form.html.
// hasSpreads    → per-unit picker with all spreads (main + ketchup/mayo).
// hasCondiments → per-unit "רטבים" picker with ketchup/mayo only.

// Fryer + spreads screens: a scheduled (form) order moves from the faded
// "upcoming" section into the main list this many minutes before pickup.
const PREP_LEAD_MINUTES = 15;

const MENU = {
  food: [
    { id: 'chips',                   emoji: '🍟',      name: "צ'יפס",                   price: 10, hasSpreads: false, hasCondiments: true },
    { id: 'schnitzelons',            emoji: '🍗',      name: 'שניצלונים',                 price: 25, hasSpreads: false, hasCondiments: true },
    { id: 'schnitzelons_chips',      emoji: '🍗🍟',   name: "שניצלונים + צ'יפס",        price: 30, hasSpreads: false, hasCondiments: true },
    { id: 'schnitzel_challah',       emoji: '🍗🥖',   name: 'שניצל בחלה',               price: 35, hasSpreads: true  },
  ],
  drinks: [
    { id: 'tropical', emoji: '🧃', name: 'טרופית', price: 3,  hasSpreads: false },
    { id: 'can',      emoji: '🥤', name: 'פחית',   price: 8,  hasSpreads: false },
    { id: 'beer',     emoji: '🍺', name: 'בירה',   price: 10, hasSpreads: false },
  ],
  spreadsMain:       ['מטבוחה', 'טחינה', 'חצילים', 'כרוב אדום', 'לימון כבוש', 'חריף', 'חסה'],
  spreadsCondiments: ['קטשופ', 'מיונז'],
};

MENU.allItems = [...MENU.food, ...MENU.drinks];
MENU.byId = Object.fromEntries(MENU.allItems.map(item => [item.id, item]));

// Event menu ("טעם הבית") — used by reception while event mode is on.
// Item names match the regular menu so the fryer screen shows them unchanged.
// `stock` = portions available for the event (no stock = unlimited).
const EVENT_MENU = {
  food: [
    { id: 'event_schnitzel_challah', emoji: '🍗🥖', name: 'שניצל בחלה', price: 25, hasSpreads: true,  stock: 80 },
    { id: 'event_schnitzelons',      emoji: '🍗',   name: 'שניצלונים',   price: 20, hasSpreads: false, hasCondiments: true, stock: 33 },
    { id: 'event_chips',             emoji: '🍟',   name: "צ'יפס",       price: 10, hasSpreads: false, hasCondiments: true },
  ],
  drinks: [
    { id: 'event_tropical', emoji: '🧃', name: 'טרופית', price: 3,  hasSpreads: false },
    { id: 'event_beer',     emoji: '🍺', name: 'בירה',   price: 10, hasSpreads: false },
    { id: 'event_can',      emoji: '🥤', name: 'פחית',   price: 8,  hasSpreads: false },
  ],
  spreadsMain:       MENU.spreadsMain,
  spreadsCondiments: MENU.spreadsCondiments,
};

EVENT_MENU.allItems = [...EVENT_MENU.food, ...EVENT_MENU.drinks];
EVENT_MENU.byId = Object.fromEntries(EVENT_MENU.allItems.map(item => [item.id, item]));

// ─── spread display helpers (reception, fryer, spreads, form) ─────────────────
// Canonical order: MENU.spreadsMain, then MENU.spreadsCondiments. Applied at
// display time, so older orders saved in click order show the same way too.

const SPREAD_ORDER = [...MENU.spreadsMain, ...MENU.spreadsCondiments];

function sortSpreads(list) {
  const rank = s => { const i = SPREAD_ORDER.indexOf(s); return i === -1 ? SPREAD_ORDER.length : i; };
  return [...(list ?? [])].map((s, i) => [s, i])
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1])   // unknown names keep their order, at the end
    .map(([s]) => s);
}

// Per-unit choices (string[][], one array per unit) → identical units grouped:
// [{ nums: [1, 2, 3], spreads: [...] }, …], in order of each group's first unit.
// `count` pads missing units with [] (a unit with nothing chosen).
function groupSpreadUnits(units, count = units.length) {
  const groups = [];
  const byKey = new Map();
  for (let i = 0; i < Math.max(count, units.length); i++) {
    const spreads = sortSpreads(units[i] ?? []);
    const key = spreads.join('\u0001');
    let g = byKey.get(key);
    if (!g) { g = { nums: [], spreads }; byKey.set(key, g); groups.push(g); }
    g.nums.push(i + 1);
  }
  return groups;
}

// [1,2,3] → "#1–#3", [1,3] → "#1, #3", [1,2,4] → "#1–#2, #4"
function formatUnitNums(nums) {
  const parts = [];
  for (let i = 0; i < nums.length; i++) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    parts.push(j > i ? `#${nums[i]}–#${nums[j]}` : `#${nums[i]}`);
    i = j;
  }
  return parts.join(', ');
}

// Label for a group: "#2" or "#1–#3 (×3)".
function unitGroupLabel(nums) {
  return nums.length > 1 ? `${formatUnitNums(nums)} (×${nums.length})` : formatUnitNums(nums);
}
