// Default shopping data (menu, departments, recipe, pre-sale checklist).
// Used ONLY to seed the shopping collection on first run, when it is empty.
// After that the data lives in MongoDB and is edited from shopping.html.
// per = quantity per portion of each menu item; fixed = per sale; pack = package size;
// price = per package incl. VAT; check = estimate that still needs verifying.

module.exports = {
  "menu": [
    {
      "k": "challah",
      "name": "שניצל בחלה",
      "price": 35
    },
    {
      "k": "sch",
      "name": "שניצלונים",
      "price": 25
    },
    {
      "k": "combo",
      "name": "שניצלונים + צ'יפס",
      "price": 30
    },
    {
      "k": "chips",
      "name": "צ'יפס",
      "price": 10
    }
  ],
  "departments": [
    "בשר ועוף",
    "מאפייה",
    "ירקות",
    "מקרר",
    "מוצרי יסוד",
    "קפואים",
    "שתייה",
    "חד־פעמי"
  ],
  "recipe": [
    {
      "check": false,
      "dept": "בשר ועוף",
      "fixed": 0,
      "id": "chicken",
      "name": "חזה עוף נקי",
      "note": "חלה: 2 שניצלים של 85 גרם · שניצלונים: 100 גרם · כ־45.5 ₪ לק\"ג",
      "pack": 0.5,
      "packLabel": "",
      "per": {
        "challah": 0.17,
        "combo": 0.1,
        "sch": 0.1
      },
      "price": 22.75,
      "unit": "ק\"ג"
    },
    {
      "check": true,
      "dept": "מאפייה",
      "fixed": 0,
      "id": "challah",
      "name": "חלה",
      "pack": 1,
      "packLabel": "",
      "per": {
        "challah": 1
      },
      "price": 0,
      "unit": "יח׳"
    },
    {
      "check": true,
      "dept": "ירקות",
      "fixed": 0,
      "id": "lettuce",
      "name": "חסה",
      "pack": 1,
      "packLabel": "",
      "per": {
        "challah": 0.067
      },
      "price": 11.9,
      "unit": "ראש"
    },
    {
      "check": true,
      "dept": "ירקות",
      "fixed": 0,
      "id": "tomato",
      "name": "עגבניות",
      "pack": 0.5,
      "packLabel": "",
      "per": {
        "challah": 0.04
      },
      "price": 0,
      "unit": "ק\"ג"
    },
    {
      "check": true,
      "dept": "מקרר",
      "fixed": 0,
      "id": "eggs",
      "name": "ביצים",
      "pack": 18,
      "packLabel": "תבנית 18",
      "per": {
        "challah": 0.8,
        "combo": 0.6,
        "sch": 0.6
      },
      "price": 20,
      "unit": "יח׳"
    },
    {
      "check": true,
      "dept": "מקרר",
      "fixed": 0,
      "id": "spreads",
      "name": "ממרחים לחלה",
      "pack": 1,
      "packLabel": "",
      "per": {
        "challah": 0.084
      },
      "price": 0,
      "unit": "קופסה"
    },
    {
      "check": true,
      "dept": "מוצרי יסוד",
      "fixed": 0,
      "id": "crumbs",
      "name": "פירורי לחם",
      "pack": 0.5,
      "packLabel": "שקית 500 גרם",
      "per": {
        "challah": 0.05,
        "combo": 0.0375,
        "sch": 0.0375
      },
      "price": 5,
      "unit": "ק\"ג"
    },
    {
      "check": true,
      "dept": "מוצרי יסוד",
      "fixed": 0,
      "id": "flour",
      "name": "קמח",
      "pack": 1,
      "packLabel": "שקית 1 ק\"ג",
      "per": {
        "challah": 0.02,
        "combo": 0.015,
        "sch": 0.015
      },
      "price": 0,
      "unit": "ק\"ג"
    },
    {
      "check": false,
      "dept": "מוצרי יסוד",
      "fixed": 8,
      "id": "oil",
      "name": "שמן לטיגון",
      "note": "2 צ'יפסרים × 4 ליטר, שמן חדש בכל מכירה",
      "pack": 1,
      "packLabel": "",
      "per": {},
      "price": 6.88,
      "unit": "ליטר"
    },
    {
      "check": true,
      "dept": "מוצרי יסוד",
      "fixed": 0,
      "id": "sauces",
      "name": "קטשופ / מיונז",
      "pack": 1,
      "packLabel": "",
      "per": {
        "chips": 0.04,
        "combo": 0.04,
        "sch": 0.04
      },
      "price": 12.2,
      "unit": "בקבוק"
    },
    {
      "check": true,
      "dept": "קפואים",
      "fixed": 0,
      "id": "chips",
      "name": "צ'יפס קפוא",
      "pack": 2.5,
      "packLabel": "שקית 2.5 ק\"ג",
      "per": {
        "chips": 0.2,
        "combo": 0.2
      },
      "price": 0,
      "unit": "ק\"ג"
    },
    {
      "check": true,
      "dept": "חד־פעמי",
      "fixed": 0,
      "id": "boxes",
      "name": "קופסאות / סירות",
      "pack": 50,
      "packLabel": "חבילת 50",
      "per": {
        "chips": 1,
        "combo": 1,
        "sch": 1
      },
      "price": 0,
      "unit": "יח׳"
    },
    {
      "check": true,
      "dept": "חד־פעמי",
      "fixed": 0,
      "id": "bakingpaper",
      "name": "נייר אפייה לעטיפה",
      "pack": 1,
      "packLabel": "",
      "per": {
        "challah": 0.025
      },
      "price": 16,
      "unit": "גליל"
    },
    {
      "check": true,
      "dept": "חד־פעמי",
      "fixed": 0,
      "id": "napkins",
      "name": "מפיות",
      "pack": 1,
      "packLabel": "חבילת 100",
      "per": {
        "challah": 0.01,
        "chips": 0.01,
        "combo": 0.01,
        "sch": 0.01
      },
      "price": 0,
      "unit": "חבילה"
    }
  ],
  "checklist": [
    {
      "id": "c0",
      "group": "הכנות",
      "text": "להשיג כסף קטן"
    },
    {
      "id": "c1",
      "group": "הכנות",
      "text": "להטעין טאבלטים"
    },
    {
      "id": "c2",
      "group": "הכנות",
      "text": "להקים עמדות"
    },
    {
      "id": "c3",
      "group": "הכנות",
      "text": "לשים שקית בפח הגדול"
    },
    {
      "id": "c4",
      "group": "הכנות",
      "text": "למלא מים לשתייה + כוסות חד־פעמיות"
    },
    {
      "id": "c5",
      "group": "הכנות",
      "text": "לארגן פינות ישיבה"
    },
    {
      "id": "c6",
      "group": "ציוד בעמדות",
      "text": "שקיות נייר טייק אווי"
    },
    {
      "id": "c7",
      "group": "ציוד בעמדות",
      "text": "קופסאות קרטון"
    },
    {
      "id": "c8",
      "group": "ציוד בעמדות",
      "text": "נייר אפייה חום"
    },
    {
      "id": "c9",
      "group": "ציוד בעמדות",
      "text": "קרטונים לצ'יפס"
    },
    {
      "id": "c10",
      "group": "ציוד בעמדות",
      "text": "נייר סופג"
    },
    {
      "id": "c11",
      "group": "ציוד בעמדות",
      "text": "טושים פרמננט"
    },
    {
      "id": "c12",
      "group": "ציוד בעמדות",
      "text": "פח קטן לעמדה"
    },
    {
      "id": "c13",
      "group": "ממרחים ורטבים",
      "text": "חסה"
    },
    {
      "id": "c14",
      "group": "ממרחים ורטבים",
      "text": "לימון כבוש"
    },
    {
      "id": "c15",
      "group": "ממרחים ורטבים",
      "text": "מטבוחה"
    },
    {
      "id": "c16",
      "group": "ממרחים ורטבים",
      "text": "כרוב אדום במיונז"
    },
    {
      "id": "c17",
      "group": "ממרחים ורטבים",
      "text": "חצילים"
    },
    {
      "id": "c18",
      "group": "ממרחים ורטבים",
      "text": "טחינה"
    },
    {
      "id": "c19",
      "group": "ממרחים ורטבים",
      "text": "מיונז"
    },
    {
      "id": "c20",
      "group": "ממרחים ורטבים",
      "text": "קטשופ"
    },
    {
      "id": "c21",
      "group": "שתייה",
      "text": "בירה"
    },
    {
      "id": "c22",
      "group": "שתייה",
      "text": "טרופיות"
    },
    {
      "id": "c23",
      "group": "שתייה",
      "text": "פחיות"
    },
    {
      "id": "c24",
      "group": "מערכת",
      "text": "לכבות מצב אירוע (אם לא אירוע)"
    },
    {
      "id": "c25",
      "group": "מערכת",
      "text": "לרענן את כל הטאבלטים (קבלה, ציפסר, מריחות)"
    },
    {
      "id": "c26",
      "group": "מערכת",
      "text": "הזמנת ניסיון במצב דמו, ואז לכבות דמו"
    },
    {
      "id": "c27",
      "group": "מערכת",
      "text": "טאבלטים וטלפון מחוברים לחשמל"
    }
  ]
};
