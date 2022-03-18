import Koa from 'koa';
import bodyparser from 'koa-bodyparser';
import helmet from 'koa-helmet';
import Sentry from './lib/sentry';

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
    ctx.status = err.status || 500;
    ctx.body = 'Uh Oh! Something went wrong on my end, please try again later.';
    app.emit('error', err, ctx);
  }
});
app.use(helmet());
app.use(bodyparser());

export default app;
