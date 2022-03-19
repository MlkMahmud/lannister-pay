const redis = new Map();

export default {
  clear() {
    redis.clear();
    return Promise.resolve();
  },

  get(key, fallback = '') {
    const value = redis.get(key) || fallback;
    return Promise.resolve(JSON.parse(value));
  },

  set(key, value) {
    redis.set(key, JSON.stringify(value));
    return Promise.resolve();
  },
};
