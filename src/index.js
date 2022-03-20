import os from 'os';
import app from './app';
import redis from './lib/redis';
import logger from './lib/logger';

const PORT = process.env.PORT || 3000;

(async function start() {
  try {
    await redis.connect();
    const server = app.listen(PORT, () => {
      logger.info(
        '> Lannister Pay is listening at http://%s:%s - env %s',
        os.hostname(),
        server.address().port,
        process.env.NODE_ENV,
      );
    });
  } catch (e) {
    logger.error(e);
    if (redis.isOpen()) {
      await redis.quit();
    }
    process.exit(1);
  }
}());
