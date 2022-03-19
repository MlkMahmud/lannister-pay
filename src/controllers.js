import Joi from 'joi';
import redis from './lib/redis';

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'ApplicationError';
    this.statusCode = statusCode;
  }
}

const feeConfigurationSchema = Joi.object({
  id: Joi.string().min(8).max(8).required(),
  currency: Joi.string().required(),
  locale: Joi.string().valid('*', 'INTL', 'LOCL').required(),
  entity: Joi.string()
    .valid(
      '*',
      'CREDIT-CARD',
      'DEBIT-CARD',
      'BANK-ACCOUNT',
      'USSD',
      'WALLET-ID',
    )
    .required(),
  entityProperty: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
  type: Joi.string().valid('FLAT', 'FLAT_PERC', 'PERC').required(),
  value: Joi.when('type', {
    is: Joi.string().valid('FLAT', 'PERC'),
    then: Joi.number().required(),
    otherwise: Joi.custom((value, helpers) => {
      const [flat, perc] = value.split(':');
      if (!flat || Number.isNaN(flat) || !perc || Number.isNaN(perc)) {
        return helpers.error('Fee configuration value is invalid');
      }
      return value;
    }),
  }),
});

function rankFeeConfiguration(configuration) {
  const rankedConfiguration = { ...configuration, rank: 0 };
  Object.keys(rankedConfiguration).forEach((key) => {
    if (key !== 'rank' && rankedConfiguration[key] !== '*') {
      rankedConfiguration.rank += 1;
    }
  });
  return rankedConfiguration;
}

export default {
  // async computeTransactionFee() {},

  async parseFeeConfiguration(configurations) {
    if (!configurations || typeof configurations !== 'string') {
      throw new HttpError(400, 'Invalid request payload');
    }
    const parsedConfigurations = configurations.split('\n').map((item) => {
      const [id, currency, locale, entity = '', , , type, value] = item.split(' ');
      const match = entity.match(/(.*)\(([^)]+)\)/) || [];
      const configuration = {
        id,
        currency,
        locale,
        entity: match[1],
        entityProperty: match[2],
        type,
        value,
      };
      const { error } = feeConfigurationSchema.validate(configuration);
      if (error) {
        throw new HttpError(400, `Fee configuration ${id || ''} is invalid`);
      }
      return rankFeeConfiguration(configuration);
    }).sort((a, b) => b.rank - a.rank);
    await redis.set('configurations', parsedConfigurations);
  },
};
