// Single source of truth for all menu items, prices, and spread rules.
// Imported by reception.html, fryer.html, and form.html.

const MENU = {
  food: [
    { id: 'chips',                   emoji: '🍟',      name: "צ'יפס",                   price: 10, hasSpreads: false },
    { id: 'chips_special',           emoji: '🍟',      name: "צ'יפס ספיישל",             price: 15, hasSpreads: false, desc: 'ברוטב פטרוזיליה ושום' },
    { id: 'schnitzelons',            emoji: '🍗',      name: 'שניצלונים',                 price: 25, hasSpreads: true  },
    { id: 'schnitzelons_chips',      emoji: '🍗🍟',   name: "שניצלונים + צ'יפס",        price: 30, hasSpreads: true  },
    { id: 'schnitzel_challah',       emoji: '🍗🥖',   name: 'שניצל בחלה',               price: 35, hasSpreads: true  },
    { id: 'schnitzel_challah_chips', emoji: '🍗🥖🍟', name: "שניצל בחלה + צ'יפס",      price: 40, hasSpreads: true  },
  ],
  drinks: [
    { id: 'tropical', emoji: '🧃', name: 'טרופית', price: 3, hasSpreads: false },
    { id: 'can',      emoji: '🥤', name: 'פחית',   price: 8, hasSpreads: false },
  ],
  spreadsMain:       ['מטבוחה', 'טחינה', 'חצילים', 'כרוב אדום', 'לימון כבוש', 'חריף', 'חסה'],
  spreadsCondiments: ['קטשופ', 'מיונז'],
};

MENU.allItems = [...MENU.food, ...MENU.drinks];
MENU.byId = Object.fromEntries(MENU.allItems.map(item => [item.id, item]));
