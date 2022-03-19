import Koa from 'koa';
import bodyparser from 'koa-bodyparser';
import helmet from 'koa-helmet';
import Sentry from './lib/sentry';
import router from './routes';

const app = new Koa();

app.on('error', async (err, ctx) => {
  Sentry.withScope((scope) => {
    scope.addEventProcessor((event) => Sentry.Handlers.parseRequest(event, ctx.request));
    Sentry.captureException(err);
  });
});

app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const message = statusCode < 500 ? err.message : 'Something went wrong on our end, please try again later.';
    ctx.status = statusCode;
    ctx.body = { Error: message };
    if (statusCode >= 500) app.emit('error', err, ctx);
  }
});
app.use(helmet());
app.use(bodyparser());
app.use(router.routes());
app.use(router.allowedMethods());

export default app;
