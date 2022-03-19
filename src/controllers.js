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
  feeType: Joi.string().valid('FLAT', 'FLAT_PERC', 'PERC').required(),
  feeValue: Joi.when('feeType', {
    is: Joi.string().valid('FLAT', 'PERC'),
    then: Joi.number().required(),
    otherwise: Joi.custom((value, helper) => {
      const [flat, perc] = value.split(':');
      if (!flat || Number.isNaN(Number(flat)) || !perc || Number.isNaN(Number(perc))) {
        return helper.message({ custom: 'FLAT_PERC fee type requires fee value to match [FLAT-VALUE]:[PERC-VALUE]' });
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
      const [id, currency, locale, entity = '', , , feeType, feeValue] = item.split(' ');
      const match = entity.match(/(.*)\(([^)]+)\)/) || [];
      const configuration = {
        id,
        currency,
        locale,
        entity: match[1],
        entityProperty: match[2],
        feeType,
        feeValue,
      };
      const { error } = feeConfigurationSchema.validate(configuration, { abortEarly: true });
      if (error) {
        const { message } = error.details[0];
        throw new HttpError(400, message);
      }
      return rankFeeConfiguration(configuration);
    }).sort((a, b) => b.rank - a.rank);
    await redis.set('configurations', parsedConfigurations);
  },
};
