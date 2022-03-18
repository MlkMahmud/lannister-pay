import Router from 'koa-router';

const router = new Router();

router.post('/fees', async (ctx) => {
  ctx.body = { message: 'save fees to db' };
});

router.post('/compute-transaction-fee', async (ctx) => {
  ctx.body = { message: 'compute fee' };
});

export default router;
