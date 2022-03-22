import Joi from 'joi';
import { alpha3ToAlpha2, isValid as isValidCountryCode } from 'i18n-iso-countries';
import { countries } from 'countries-list';

function validateCountry(countryCode, helpers) {
  if (isValidCountryCode(countryCode)) {
    return countryCode;
  }
  return helpers.message({ custom: `Country Code: ${countryCode} is invalid` });
}

function validateCurrency(transaction, helpers) {
  const { Currency, CurrencyCountry } = transaction;
  let countryCode = CurrencyCountry;
  if (!isValidCountryCode(countryCode)) {
    return helpers.message({ custom: `Country Code: ${countryCode} is invalid.` });
  }
  /*
    Coutries list only supports alpha2 country codes
    So convert alpha3codes to alpha2
  */
  if (countryCode.length > 2) {
    countryCode = alpha3ToAlpha2(countryCode);
  }
  const country = countries[countryCode];
  const currencies = country.currency.split(',');
  if (!currencies.includes(Currency)) {
    return helpers.message({ custom: `${country.name} does not support ${Currency}.` });
  }
  return Currency;
}

const ENTITIES = ['*', 'CREDIT-CARD', 'DEBIT-CARD', 'BANK-ACCOUNT', 'USSD', 'WALLET-ID'];

export const feeConfigurationSchema = Joi.object({
  id: Joi.string().min(8).max(8).required(),
  currency: Joi.string().valid('*', 'NGN').required(),
  locale: Joi.string().valid('*', 'INTL', 'LOCL').required(),
  entity: Joi.string().valid(...ENTITIES).required(),
  entityProperty: Joi
    .string()
    .custom((value) => {
      if (value.startsWith('0') || Number.isNaN(Number(value))) {
        return value;
      }
      return Number(value);
    })
    .required(),
  feeType: Joi.string().valid('FLAT', 'FLAT_PERC', 'PERC').required(),
  feeValue: Joi.when('feeType', {
    is: Joi.string().valid('FLAT', 'PERC'),
    then: Joi.number().required(),
    otherwise: Joi.custom((value, helpers) => {
      const [flat, perc] = value.split(':');
      if (
        !flat
        || !perc
        || Number.isNaN(Number(flat))
        || Number.isNaN(Number(perc))
      ) {
        return helpers.message({
          custom:
            'FLAT_PERC fee type requires fee value to match [FLAT-VALUE]:[PERC-VALUE]',
        });
      }
      return value;
    }),
  }),
});

/*
  Ideally, currency and country code should be validated against
  a list of coutries maintained by Lannister Pay.
*/

export const transactionSchema = Joi.object({
  ID: Joi.any(),
  Amount: Joi.number().min(0).required(),
  Currency: Joi.string().required(),
  CurrencyCountry: Joi.string().custom(validateCountry).required(),
  Customer: Joi.object({
    ID: Joi.any(),
    EmailAddress: Joi.string().email().allow(''),
    FullName: Joi.string().allow(''),
    BearsFee: Joi.boolean().default(false),
  }),
  PaymentEntity: {
    ID: Joi.any(),
    Issuer: Joi.string().allow(''),
    Brand: Joi.string().allow(''),
    Number: Joi.alternatives().try(Joi.string().allow(''), Joi.number()),
    SixID: Joi.alternatives().try(Joi.string().allow(''), Joi.number()),
    Type: Joi.string().valid(...ENTITIES).required(),
    Country: Joi.string().custom(validateCountry).required(),
  },
}).custom(validateCurrency);
