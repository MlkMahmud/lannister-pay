import os from 'os';
import app from './app';
import redis, { SchemaFieldTypes } from './lib/redis';
import logger from './lib/logger';

const PORT = process.env.PORT || 3000;
const CONFIG_INDEX = 'idx:configurations';

(async function start() {
  try {
    await redis.connect();
    // eslint-disable-next-line no-underscore-dangle
    const redisIndexes = await redis.ft._list();
    if (!redisIndexes.includes(CONFIG_INDEX)) {
      redis.ft.create(
        CONFIG_INDEX,
        {
          '$.currency': {
            type: SchemaFieldTypes.TEXT,
            AS: 'currency',
          },

          '$.entity': {
            type: SchemaFieldTypes.TEXT,
            AS: 'entity',
          },

          '$.locale': {
            type: SchemaFieldTypes.TEXT,
            AS: 'locale',
          },

          '$.entityProperty': {
            type: SchemaFieldTypes.TEXT,
            AS: 'entityProperty',
          },
        },
        {
          ON: 'JSON',
          PREFIX: 'configurations',
        },
      );
    }
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
    if (redis.isOpen) {
      await redis.quit();
    }
    process.exit(1);
  }
}());
