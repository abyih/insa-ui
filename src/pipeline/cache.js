/**
 * Simple in-memory cache with TTL support.
 * Keys map to { data, timestamp }.
 */
const store = new Map();

const DEFAULT_TTL_MS = 20_000; // 20 seconds (slightly more than 15s poll interval)

export const cache = {
  get(key) {
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttl) {
      store.delete(key);
      return null;
    }
    return entry.data;
  },

  set(key, data, ttl = DEFAULT_TTL_MS) {
    store.set(key, { data, timestamp: Date.now(), ttl });
  },

  invalidate(key) {
    store.delete(key);
  },

  invalidateAll() {
    store.clear();
  },
};
