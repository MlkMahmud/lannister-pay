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
    const value = await redis.get(key) || fallback;
    return JSON.parse(value);
  },
  async set(key, value) {
    await redis.set(key, JSON.stringify(value));
  },

  async quit() {
    await redis.quit();
  },
};
