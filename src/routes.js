import Router from 'koa-router';
import controller from './controllers';

const router = new Router();

router.post('/fees', async (ctx) => {
  const { FeeConfigurationSpec } = ctx.request.body;
  await controller.parseFeeConfiguration(FeeConfigurationSpec);
  ctx.status = 200;
  ctx.body = {
    status: 'ok',
  };
});

router.post('/compute-transaction-fee', async (ctx) => {
  ctx.body = { message: 'compute fee' };
});

export default router;
