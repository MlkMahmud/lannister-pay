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
export default createClient(redisOptions);
export * from 'redis';
