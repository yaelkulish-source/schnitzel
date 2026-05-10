// IndexedDB wrapper for offline-first order caching.
// On page load, screens render from the local cache before the server responds.

const localDB = (() => {
  const DB_NAME = 'schnitzel-v1';
  const STORE   = 'orders';
  let _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = e => {
        const store = e.target.result.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('date', 'date', { unique: false });
      };
      req.onsuccess = e => { _db = e.target.result; resolve(_db); };
      req.onerror   = () => reject(req.error);
    });
  }

  async function getByDate(date) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const index = db.transaction(STORE, 'readonly').objectStore(STORE).index('date');
      const req   = index.getAll(date);
      req.onsuccess = () => resolve(req.result.sort((a, b) => a.id - b.id));
      req.onerror   = () => reject(req.error);
    });
  }

  async function put(order) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(order);
      tx.oncomplete = resolve;
      tx.onerror    = () => reject(tx.error);
    });
  }

  async function putMany(orders) {
    if (!orders.length) return;
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const o of orders) store.put(o);
      tx.oncomplete = resolve;
      tx.onerror    = () => reject(tx.error);
    });
  }

  return { getByDate, put, putMany };
})();
