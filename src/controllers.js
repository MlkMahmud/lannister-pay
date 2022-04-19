import redis from './lib/redis';
import {
  escapeCharacters,
  feeConfigurationSchema,
  isEmptyString,
  transactionSchema,
} from './utils';

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function rankFeeConfiguration(configuration) {
  const rankedConfiguration = { ...configuration, rank: 0 };
  ['currency', 'locale', 'entity', 'entityProperty'].forEach((key) => {
    if (rankedConfiguration[key] !== '*') {
      if (key === 'entity') rankedConfiguration.rank += 2;
      else rankedConfiguration.rank += 1;
    }
  });
  return rankedConfiguration;
}

async function getMatchingFeeConfiguration(transaction) {
  const { Currency, CurrencyCountry, PaymentEntity } = transaction;
  const locale = CurrencyCountry === PaymentEntity.Country ? 'LOCL' : 'INTL';
  const entityProperties = [
    ...(isEmptyString(PaymentEntity.ID) ? [] : [PaymentEntity.ID]),
    ...(isEmptyString(PaymentEntity.Issuer) ? [] : [PaymentEntity.Issuer]),
    ...(isEmptyString(PaymentEntity.Brand) ? [] : [PaymentEntity.Brand]),
    ...(isEmptyString(PaymentEntity.Number) ? [] : [PaymentEntity.Number]),
    ...(isEmptyString(PaymentEntity.SixID) ? [] : [PaymentEntity.SixID]),
  ];
  const entityPropQuery = escapeCharacters(entityProperties.join('|'));
  const query = `@currency:(X|${Currency}) @entity:(X|${escapeCharacters(PaymentEntity.Type)}) @locale:(X|${locale}) @entityProperty:(X|${entityPropQuery})`;
  const { documents, total } = await redis.ft.search('idx:configurations', query, { NOSTOPWORDS: true });

  if (!total) {
    throw new HttpError(404, 'No fee configuration for this transaction.');
  }
  const [matchingConfiguration] = documents.sort((a, b) => b.value.rank - a.value.rank);

  return matchingConfiguration.value;
}

export default {
  async computeTransactionFee(transaction) {
    const { error } = transactionSchema.validate(transaction);
    if (error) {
      const { message } = error.details[0];
      throw new HttpError(400, message);
    }

    const { id, feeType, feeValue } = await getMatchingFeeConfiguration(
      transaction,
    );
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
        AppliedFeeValue = Number(flat) + (Number(perc) * Amount) / 100;
        break;
      }
      default: {
        /*
          Ideally, this should never actually run.
          Since we validate each configuration's fee type before saving it.
          However, if for some weird reason, it does, let's throw a 500 error.
        */
        throw new Error(
          `Fee configuration ${id} has an invalid fee type: ${feeType}`,
        );
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

  async parseFeeConfiguration(payload = '') {
    if (!payload || typeof payload !== 'string') {
      throw new HttpError(400, 'Invalid request payload');
    }
    /*
      Assessment does not specify how to deal with possible duplicate configurations
      Ideally a configuration id should be unique and we should throw a duplicate key error.
    */
    const configurations = payload.split('\n').map((item) => {
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
    });
    await Promise.all(
      configurations.map((configuration) => (
        redis.json.set(`configurations:${configuration.id}`, '$', {
          id: configuration.id,
          currency: escapeCharacters(configuration.currency),
          locale: escapeCharacters(configuration.locale),
          entity: escapeCharacters(configuration.entity),
          entityProperty: escapeCharacters(configuration.entityProperty),
          feeType: configuration.feeType,
          feeValue: configuration.feeValue,
          rank: configuration.rank,
        })
      )),
    );
  },
};
