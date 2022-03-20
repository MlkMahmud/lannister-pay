import { createClient } from 'redis';

const redisOptions = {
  url: process.env.REDIS_URL,
};

if (process.env.NODE_ENV === 'production') {
  redisOptions.socket = {
    tls: true,
    // Deployment provider uses self-signed certs, so disable cert verification
    rejectUnauthorized: false,
  };
}
const redis = createClient(redisOptions);

export default {
  async connect() {
    await redis.connect();
  },

  async get(key, fallback = '') {
    const value = await redis.get(key);
    if (value) return JSON.parse(value);
    return fallback;
  },

  isOpen() {
    return redis.isOpen;
  },

  async quit() {
    await redis.QUIT();
  },

  async set(key, value) {
    await redis.set(key, JSON.stringify(value));
  },
};
