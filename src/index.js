import app from './app';
import redis from './lib/redis';
import logger from './lib/logger';

const PORT = process.env.PORT || 3000;

(async function start() {
  try {
    await redis.connect();
    app.listen(PORT, () => {
      logger.info(`> Running on port: ${PORT}`);
    });
  } catch (e) {
    logger.error(e);
    if (redis.isOpen()) {
      await redis.quit();
    }
    process.exit(1);
  }
}());
