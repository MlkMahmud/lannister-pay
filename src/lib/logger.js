import bunyan from 'bunyan';

const logger = bunyan.createLogger({
  name: 'lannister-pay',
  streams: [{ level: 'info', stream: process.stdout }],
  serializers: {
    err: bunyan.stdSerializers.err,
  },
});

export default logger;
