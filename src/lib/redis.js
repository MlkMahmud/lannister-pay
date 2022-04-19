import { createClient, SchemaFieldTypes } from 'redis';

const CONFIG_INDEX = 'idx:configurations';
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
export default redis;
export async function startRedis() {
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
}

export * from 'redis';
