// Single source of truth for all menu items, prices, and spread rules.
// Imported by reception.html, fryer.html, and form.html.

const MENU = {
  food: [
    { id: 'chips',                   emoji: '🍟',      name: "צ'יפס",                   price: 10, hasSpreads: false },
    { id: 'schnitzelons',            emoji: '🍗',      name: 'שניצלונים',                 price: 25, hasSpreads: false },
    { id: 'schnitzelons_chips',      emoji: '🍗🍟',   name: "שניצלונים + צ'יפס",        price: 30, hasSpreads: false },
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
    { id: 'event_schnitzelons',      emoji: '🍗',   name: 'שניצלונים',   price: 20, hasSpreads: false, stock: 33 },
    { id: 'event_chips',             emoji: '🍟',   name: "צ'יפס",       price: 10, hasSpreads: false },
  ],
  drinks: [],
  spreadsMain:       MENU.spreadsMain,
  spreadsCondiments: MENU.spreadsCondiments,
};

EVENT_MENU.allItems = [...EVENT_MENU.food, ...EVENT_MENU.drinks];
EVENT_MENU.byId = Object.fromEntries(EVENT_MENU.allItems.map(item => [item.id, item]));
