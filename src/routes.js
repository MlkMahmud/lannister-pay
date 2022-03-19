import Router from 'koa-router';
import controller from './controllers';

const router = new Router();

router.get('/', async (ctx) => {
  ctx.body = { message: 'ok' };
});

router.post('/fees', async (ctx) => {
  const { FeeConfigurationSpec } = ctx.request.body;
  await controller.parseFeeConfiguration(FeeConfigurationSpec);
  ctx.body = { status: 'ok' };
});

router.post('/compute-transaction-fee', async (ctx) => {
  const transactionFee = await controller.computeTransactionFee(ctx.request.body);
  ctx.body = transactionFee;
});

export default router;
