import redis from './lib/redis';
import { feeConfigurationSchema, transactionSchema } from './validators';

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

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

  if (!matchingConfiguration) {
    let errorMessage = 'No fee configuration for this transaction.';
    if (unmatchedField) {
      errorMessage = `No fee configuration for ${unmatchedField} transactions.`;
    }

    throw new HttpError(404, errorMessage);
  }

  return matchingConfiguration;
}

export default {
  async computeTransactionFee(transaction) {
    const { error } = transactionSchema.validate(transaction);
    if (error) {
      const { message } = error.details[0];
      throw new HttpError(400, message);
    }

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
        throw new Error(`Fee configuration ${id} has an invalid fee type: ${feeType}`);
      }
    }

    const ChargeAmount = Customer.BearsFee ? Amount + AppliedFeeValue : Amount;
    const SettlementAmount = ChargeAmount - AppliedFeeValue;

    return {
      AppliedFeeID: id,
      AppliedFeeValue,
      ChargeAmount,
      SettlementAmount,
    };
  },

  async parseFeeConfiguration(configurations) {
    if (!configurations || typeof configurations !== 'string') {
      throw new HttpError(400, 'Invalid request payload');
    }
    /*
      Assessment does not specify how to deal with possible duplicate configurations
      Ideally a configuration id should be unique and we should throw a duplicate key error.
    */
    const existingConfigurations = await redis.get('configurations', []);
    const updatedConfigurations = configurations
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
      .concat(existingConfigurations)
      .sort((a, b) => b.rank - a.rank);
    await redis.set('configurations', updatedConfigurations);
  },
};
