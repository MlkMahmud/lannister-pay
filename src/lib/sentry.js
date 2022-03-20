import * as Sentry from '@sentry/node';

const version = process.env.SENTRY_RELEASE
  ? process.env.SENTRY_RELEASE.trim()
  : 'current';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production',
  release: `lannister-pay@${version}`,
});

export default Sentry;
