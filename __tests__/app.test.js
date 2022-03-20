import request from 'supertest';
import app from '../src/app';
import redis from '../src/lib/redis';
import { sampleConfigurations, transactions } from './fixtures';

jest.mock('../src/lib/redis');

const server = app.listen();

afterAll(() => {
  server.close();
});

describe('/fees', () => {
  afterAll(() => {
    redis.clear();
  });

  it('should properly parse the fee configuration and save it to redis', async () => {
    const response = await request(server).post('/fees').send({
      FeeConfigurationSpec:
        'LNPY1221 NGN * *(*) : APPLY FLAT_PERC 20:1.4\nLNPY1222 NGN INTL CREDIT-CARD(VISA) : APPLY PERC 5.0',
    });
    const configurations = await redis.get('configurations');
    expect(response.status).toEqual(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(configurations).toEqual([
      {
        id: 'LNPY1222',
        currency: 'NGN',
        locale: 'INTL',
        entity: 'CREDIT-CARD',
        entityProperty: 'VISA',
        feeType: 'PERC',
        feeValue: 5,
        rank: 7,
      },
      {
        id: 'LNPY1221',
        currency: 'NGN',
        locale: '*',
        entity: '*',
        entityProperty: '*',
        feeType: 'FLAT_PERC',
        feeValue: '20:1.4',
        rank: 4,
      },
    ]);
  });

  it('should return an error if payload does not adhere to fee configuration spec', async () => {
    const payload = {};
    const response = await request(server).post('/fees').send(payload);
    expect(response.status).toEqual(400);
    expect(response.body).toHaveProperty('Error', 'Invalid request payload');
  });

  it('should validate configuration id', async () => {
    const id = 'LNPY122';
    const payload = {
      FeeConfigurationSpec: `${id} NGN * *(*) : APPLY PERC 1.4`,
    };
    const response = await request(server).post('/fees').send(payload);
    expect(response.status).toEqual(400);
    expect(response.body).toHaveProperty(
      'Error',
      '"id" length must be at least 8 characters long',
    );
  });

  it('should validate configuration currency', async () => {
    const currency = '';
    const payload = {
      FeeConfigurationSpec: `LNPY1223 ${currency} * *(*) : APPLY PERC 1.4`,
    };
    const response = await request(server).post('/fees').send(payload);
    expect(response.status).toEqual(400);
    expect(response.body).toHaveProperty(
      'Error',
      '"currency" must be one of [*, NGN]',
    );
  });

  it('should validate configuration locale', async () => {
    const locale = 'LONDON';
    const payload = {
      FeeConfigurationSpec: `LNPY1223 NGN ${locale} *(*) : APPLY PERC 1.4`,
    };
    const response = await request(server).post('/fees').send(payload);
    expect(response.status).toEqual(400);
    expect(response.body).toHaveProperty(
      'Error',
      '"locale" must be one of [*, INTL, LOCL]',
    );
  });

  it('should validate configuration entity', async () => {
    const entity = 'NOCHARGE';
    const payload = {
      FeeConfigurationSpec: `LNPY1223 NGN LOCL ${entity}(*) : APPLY PERC 1.4`,
    };
    const response = await request(server).post('/fees').send(payload);
    expect(response.status).toEqual(400);
    expect(response.body).toHaveProperty(
      'Error',
      '"entity" must be one of [*, CREDIT-CARD, DEBIT-CARD, BANK-ACCOUNT, USSD, WALLET-ID]',
    );
  });

  it('should validate configuration fee type', async () => {
    const feeType = 'NOCHARGE';
    const payload = {
      FeeConfigurationSpec: `LNPY1223 NGN LOCL *(*) : APPLY ${feeType} 1.4`,
    };
    const response = await request(server).post('/fees').send(payload);
    expect(response.status).toEqual(400);
    expect(response.body).toHaveProperty(
      'Error',
      '"feeType" must be one of [FLAT, FLAT_PERC, PERC]',
    );
  });

  it('should validate configuration fee type', async () => {
    const feeValue = '1.4';
    const payload = {
      FeeConfigurationSpec: `LNPY1223 NGN LOCL *(*) : APPLY FLAT_PERC ${feeValue}`,
    };
    const response = await request(server).post('/fees').send(payload);
    expect(response.status).toEqual(400);
    expect(response.body).toHaveProperty(
      'Error',
      'FLAT_PERC fee type requires fee value to match [FLAT-VALUE]:[PERC-VALUE]',
    );
  });
});

describe('/compute-transaction-fee', () => {
  beforeAll(async () => {
    await redis.set('configurations', sampleConfigurations);
  });
  afterAll(() => {
    redis.clear();
  });

  it('should accurately compute the transaction fee', async () => {
    const payload = transactions[0];
    const response = await request(server).post('/compute-transaction-fee').send(payload);
    expect(response.status).toEqual(200);
    expect(response.body).toEqual({
      AppliedFeeID: 'LNPY1223',
      AppliedFeeValue: 120,
      ChargeAmount: 5120,
      SettlementAmount: 5000,
    });
  });

  it('should accurately compute the transaction fee', async () => {
    const payload = transactions[1];
    const response = await request(server).post('/compute-transaction-fee').send(payload);
    expect(response.status).toEqual(200);
    expect(response.body).toEqual({
      AppliedFeeID: 'LNPY1221',
      AppliedFeeValue: 49,
      ChargeAmount: 3500,
      SettlementAmount: 3451,
    });
  });

  it('should return an error message if transaction configuration does not exist', async () => {
    const payload = transactions[2];
    const response = await request(server).post('/compute-transaction-fee').send(payload);
    expect(response.status).toEqual(404);
    expect(response.body).toEqual({ Error: 'No fee configuration for USD transactions.' });
  });

  it('should validate transaction amount', async () => {
    const payload = { ...transactions[0], Amount: -5 };
    const response = await request(server).post('/compute-transaction-fee').send(payload);
    expect(response.status).toEqual(400);
    expect(response.body).toEqual({ Error: '"Amount" must be greater than or equal to 0' });
  });

  it('should validate transaction currency', async () => {
    const Currency = 'USD';
    const CurrencyCountry = 'NG';
    const payload = { ...transactions[0], Currency, CurrencyCountry };
    const response = await request(server).post('/compute-transaction-fee').send(payload);
    expect(response.status).toEqual(400);
    expect(response.body).toEqual({ Error: `Nigeria does not support ${Currency}.` });
  });

  it('should validate transaction country', async () => {
    const CurrencyCountry = 'FAKECODE';
    const payload = { ...transactions[0], CurrencyCountry };
    const response = await request(server).post('/compute-transaction-fee').send(payload);
    expect(response.status).toEqual(400);
    expect(response.body).toEqual({ Error: `Country Code: ${CurrencyCountry} is invalid` });
  });

  it('should validate transaction payment entity', async () => {
    const transaction = transactions[0];
    const invalidEntityType = 'NOCHARGE';
    const payload = {
      ...transaction, PaymentEntity: { ...transaction.PaymentEntity, Type: invalidEntityType },
    };
    const response = await request(server).post('/compute-transaction-fee').send(payload);
    expect(response.status).toEqual(400);
    expect(response.body).toHaveProperty(
      'Error',
      '"PaymentEntity.Type" must be one of [*, CREDIT-CARD, DEBIT-CARD, BANK-ACCOUNT, USSD, WALLET-ID]',
    );
  });
});
