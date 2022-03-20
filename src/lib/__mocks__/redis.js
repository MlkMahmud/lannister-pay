const redis = new Map();

export default {
  clear() {
    redis.clear();
  },

  get(key, fallback = '') {
    const value = redis.get(key);
    if (value) {
      return Promise.resolve(JSON.parse(value));
    }
    return Promise.resolve(fallback);
  },

  set(key, value) {
    redis.set(key, JSON.stringify(value));
    return Promise.resolve();
  },
};
