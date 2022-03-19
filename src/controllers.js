import Joi from 'joi';
import redis from './lib/redis';

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

const feeConfigurationSchema = Joi.object({
  id: Joi.string().min(8).max(8).required(),
  currency: Joi.string().valid('*', 'NGN').required(),
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
      if (
        !flat
        || !perc
        || Number.isNaN(Number(flat))
        || Number.isNaN(Number(perc))
      ) {
        return helper.message({
          custom:
            'FLAT_PERC fee type requires fee value to match [FLAT-VALUE]:[PERC-VALUE]',
        });
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

async function getMatchingFeeConfiguration(transaction) {
  const configurations = await redis.get('configurations', []);
  let unmatchedField;

  const matchingConfiguration = configurations.find(({
    currency, entity, entityProperty, locale,
  }) => {
    const { PaymentEntity } = transaction;
    const transactionLocale = transaction.CurrencyCountry === PaymentEntity.Country ? 'LOCL' : 'INTL';
    if (currency !== '*' && currency !== transaction.Currency) {
      unmatchedField = transaction.Currency;
      return false;
    }

    if (entity !== '*' && entity !== PaymentEntity.Type) {
      unmatchedField = PaymentEntity.Type;
      return false;
    }

    if (locale !== '*' && locale !== transactionLocale) {
      unmatchedField = transactionLocale;
      return false;
    }

    if (
      entityProperty !== '*'
      && !([
        PaymentEntity.ID,
        PaymentEntity.Issuer,
        PaymentEntity.Brand,
        PaymentEntity.Number,
        PaymentEntity.SixID,
      ].includes(entityProperty))
    ) {
      unmatchedField = entityProperty;
      return false;
    }
    return true;
  });

  if (!matchingConfiguration) throw new HttpError(404, `No fee configuration for ${unmatchedField || 'this'} transaction`);
  return matchingConfiguration;
}

export default {
  async computeTransactionFee(transaction) {
    const { id, feeType, feeValue } = await getMatchingFeeConfiguration(transaction);
    const { Amount, Customer } = transaction;
    let AppliedFeeValue;
    switch (feeType) {
      case 'FLAT': {
        AppliedFeeValue = Number(feeValue);
        break;
      }
      case 'PERC': {
        AppliedFeeValue = (Number(feeValue) * Amount) / 100;
        break;
      }
      case 'FLAT_PERC': {
        const [flat, perc] = feeValue.split(':');
        AppliedFeeValue = Number(flat) + ((Number(perc) * Amount) / 100);
        break;
      }
      default: {
        /*
          Ideally, this should never actually run.
          Since we validate each configuration's fee type before saving it.
          However, if for some weird reason, it does, let's throw a 500 error.
        */
        throw new Error(`Configuration id: ${id} has an invalid fee type: ${feeType}`);
      }
    }

    const ChargeAmount = Customer.BearsFee ? Amount + AppliedFeeValue : Amount;
    const SettlementAmount = ChargeAmount - AppliedFeeValue;

    return {
      AppliedFeeId: id,
      AppliedFeeValue,
      ChargeAmount,
      SettlementAmount,
    };
  },

  async parseFeeConfiguration(configurations) {
    if (!configurations || typeof configurations !== 'string') {
      throw new HttpError(400, 'Invalid request payload');
    }
    const parsedConfigurations = configurations
      .split('\n')
      .map((item) => {
        const [id, currency, locale, entity = '', , , feeType, feeValue] = item.split(' ');
        const match = entity.match(/(.*)\(([^)]+)\)/) || [];
        const { error, value } = feeConfigurationSchema.validate({
          id,
          currency,
          locale,
          entity: match[1],
          entityProperty: match[2],
          feeType,
          feeValue,
        });
        if (error) {
          const { message } = error.details[0];
          throw new HttpError(400, message);
        }
        return rankFeeConfiguration(value);
      })
      .sort((a, b) => b.rank - a.rank);
    await redis.set('configurations', parsedConfigurations);
  },
};
