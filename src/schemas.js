import Joi from 'joi';

const ENTITIES = ['*', 'CREDIT-CARD', 'DEBIT-CARD', 'BANK-ACCOUNT', 'USSD', 'WALLET-ID'];

export const feeConfigurationSchema = Joi.object({
  id: Joi.string().min(8).max(8).required(),
  currency: Joi.string().valid('*', 'NGN').required(),
  locale: Joi.string().valid('*', 'INTL', 'LOCL').required(),
  entity: Joi.string().valid(...ENTITIES).required(),
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

export const transactionSchema = Joi.object({
  ID: Joi.any(),
  Amount: Joi.number().min(0).required(),
  Currency: Joi.string().required(),
  CurrencyCountry: Joi.string().required(),
  Customer: Joi.object({
    ID: Joi.any(),
    EmailAddress: Joi.string().email().allow(''),
    FullName: Joi.string().allow(''),
    BearsFee: Joi.boolean().required(),
  }),
  PaymentEntity: {
    ID: Joi.any(),
    Issuer: Joi.string().allow(''),
    Brand: Joi.string().allow(''),
    Number: Joi.alternatives().try(Joi.string().allow(''), Joi.number()),
    SixID: Joi.alternatives().try(Joi.string().allow(''), Joi.number()),
    Type: Joi.string().valid(...ENTITIES).required(),
    Country: Joi.string().required(),
  },
});
