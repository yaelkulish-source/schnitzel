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
