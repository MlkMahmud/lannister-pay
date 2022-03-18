import app from './app';
import redis from './lib/redis';

const PORT = process.env.PORT || 3000;

(async function start() {
  try {
    await redis.connect();
    app.listen(PORT, () => {
      console.log(`> Running on port: ${PORT}`);
    });
  } catch (e) {
    console.error(e);
    await redis.quit();
    process.exit(1);
  }
}());
