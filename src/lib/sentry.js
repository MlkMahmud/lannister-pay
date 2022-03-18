import * as Sentry from '@sentry/node';
import config from 'config';

Sentry.init({
  dsn: config.get('sentry.dsn'),
  enabled: config.get('sentry.enabled'),
});

export default Sentry;
