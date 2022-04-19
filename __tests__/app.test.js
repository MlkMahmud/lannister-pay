import request from 'supertest';
import app from '../src/app';
import redis, { startRedis } from '../src/lib/redis';
import { CONFIGURATION_IDS, sampleConfigurations, transactions } from './fixtures';

const server = app.listen();

beforeAll(async () => {
  await startRedis();
});

afterAll(async () => {
  await redis.del(CONFIGURATION_IDS);
  await redis.disconnect();
  server.close();
});

describe('/fees', () => {
  afterAll(async () => {
    await redis.del(CONFIGURATION_IDS);
  });

  it('should properly parse the fee configuration and save it to redis', async () => {
    const response = await request(server).post('/fees').send({
      FeeConfigurationSpec:
        'LNPY1221 NGN * *(*) : APPLY FLAT_PERC 20:1.4\nLNPY1222 NGN INTL CREDIT-CARD(VISA) : APPLY PERC 5.0\nLNPY1223 NGN LOCL CREDIT-CARD(*) : APPLY FLAT_PERC 50:1.4\nLNPY1224 NGN * BANK-ACCOUNT(*) : APPLY FLAT 100\nLNPY1225 NGN * USSD(MTN) : APPLY PERC 0.55',
    });
    const { documents, total } = await redis.ft.search('idx:configurations', '*');
    expect(response.status).toEqual(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(total).toEqual(5);
    expect(
      documents.map((doc) => doc.value),
    )
      .toEqual(expect.arrayContaining(sampleConfigurations.slice(0, 5)));
  });

  it('should properly parse the fee configuration and save it to redis', async () => {
    const response = await request(server).post('/fees').send({
      FeeConfigurationSpec:
        'FWLNAA01 NGN * BANK-ACCOUNT(UBA) : APPLY FLAT_PERC 25:2\nFWLNAA02 NGN LOCL *(*) : APPLY FLAT_PERC 50:1.2\nFWLNAA08 NGN INTL DEBIT-CARD(539983) : APPLY PERC 5.5\nFWLNAA03 NGN * USSD(GLOBACOM) : APPLY FLAT 65\nFWLNAA09 NGN * USSD(MTN) : APPLY FLAT 35\nFWLNAA04 NGN * BANK-ACCOUNT(*) : APPLY FLAT 35\nFWLNAA06 NGN INTL CREDIT-CARD(*) : APPLY PERC 2.0\nFWLNAA05 NGN * *(*) : APPLY PERC 5\nFWLNAA10 NGN * BANK-ACCOUNT(FBN) : APPLY FLAT_PERC 15:1.5\nFWLNAA11 NGN * BANK-ACCOUNT(GTB) : APPLY FLAT_PERC 11:1\nFWLNAA07 NGN INTL CREDIT-CARD(VISA) : APPLY PERC 2.5',
    });
    const { documents, total } = await redis.ft.search('idx:configurations', '*', { LIMIT: { from: 0, size: 16 } });
    expect(response.status).toEqual(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(total).toEqual(16);
    expect(documents.map((doc) => doc.value)).toEqual(expect.arrayContaining(sampleConfigurations));
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
    await request(server).post('/fees').send({
      FeeConfigurationSpec:
      'FWLNAA01 NGN * BANK-ACCOUNT(UBA) : APPLY FLAT_PERC 25:2\nFWLNAA02 NGN LOCL *(*) : APPLY FLAT_PERC 50:1.2\nFWLNAA08 NGN INTL DEBIT-CARD(539983) : APPLY PERC 5.5\nFWLNAA03 NGN * USSD(GLOBACOM) : APPLY FLAT 65\nFWLNAA09 NGN * USSD(MTN) : APPLY FLAT 35\nFWLNAA04 NGN * BANK-ACCOUNT(*) : APPLY FLAT 35\nFWLNAA06 NGN INTL CREDIT-CARD(*) : APPLY PERC 2.0\nFWLNAA05 NGN * *(*) : APPLY PERC 5\nFWLNAA10 NGN * BANK-ACCOUNT(FBN) : APPLY FLAT_PERC 15:1.5\nFWLNAA11 NGN * BANK-ACCOUNT(GTB) : APPLY FLAT_PERC 11:1\nFWLNAA07 NGN INTL CREDIT-CARD(VISA) : APPLY PERC 2.5\nLNPY1221 NGN * *(*) : APPLY FLAT_PERC 20:1.4\nLNPY1222 NGN INTL CREDIT-CARD(VISA) : APPLY PERC 5.0\nLNPY1223 NGN LOCL CREDIT-CARD(*) : APPLY FLAT_PERC 50:1.4\nLNPY1224 NGN * BANK-ACCOUNT(*) : APPLY FLAT 100\nLNPY1225 NGN * USSD(MTN) : APPLY PERC 0.55',
    });
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
      AppliedFeeID: 'FWLNAA02',
      AppliedFeeValue: 92,
      ChargeAmount: 3500,
      SettlementAmount: 3408,
    });
  });

  it('should accurately compute the transaction fee', async () => {
    const payload = transactions[3];
    const response = await request(server).post('/compute-transaction-fee').send(payload);
    expect(response.status).toEqual(200);
    expect(response.body).toEqual({
      AppliedFeeID: 'FWLNAA01',
      AppliedFeeValue: 95,
      ChargeAmount: 3595,
      SettlementAmount: 3500,
    });
  });

  it('should accurately compute the transaction fee', async () => {
    const payload = transactions[4];
    const response = await request(server).post('/compute-transaction-fee').send(payload);
    expect(response.status).toEqual(200);
    expect(response.body).toEqual({
      AppliedFeeID: 'FWLNAA08',
      AppliedFeeValue: 1045,
      ChargeAmount: 20045,
      SettlementAmount: 19000,
    });
  });

  it('should accurately compute the transaction fee', async () => {
    const payload = transactions[4];
    const response = await request(server).post('/compute-transaction-fee').send(payload);
    expect(response.status).toEqual(200);
    expect(response.body).toEqual({
      AppliedFeeID: 'FWLNAA08',
      AppliedFeeValue: 1045,
      ChargeAmount: 20045,
      SettlementAmount: 19000,
    });
  });

  it('should accurately compute the transaction fee', async () => {
    const payload = transactions[5];
    const response = await request(server).post('/compute-transaction-fee').send(payload);
    expect(response.status).toEqual(200);
    expect(response.body).toEqual({
      AppliedFeeID: 'FWLNAA02',
      AppliedFeeValue: 200,
      ChargeAmount: 12700,
      SettlementAmount: 12500,
    });
  });

  it('should accurately compute the transaction fee', async () => {
    const payload = transactions[6];
    const response = await request(server).post('/compute-transaction-fee').send(payload);
    expect(response.status).toEqual(200);
    expect(response.body).toEqual({
      AppliedFeeID: 'FWLNAA05',
      AppliedFeeValue: 472,
      ChargeAmount: 9912,
      SettlementAmount: 9440,
    });
  });

  it('should accurately compute the transaction fee', async () => {
    const payload = transactions[7];
    const response = await request(server).post('/compute-transaction-fee').send(payload);
    expect(response.status).toEqual(200);
    expect(response.body).toEqual({
      AppliedFeeID: 'FWLNAA09',
      AppliedFeeValue: 35,
      ChargeAmount: 2750,
      SettlementAmount: 2715,
    });
  });

  it('should accurately compute the transaction fee', async () => {
    const payload = transactions[8];
    const response = await request(server).post('/compute-transaction-fee').send(payload);
    expect(response.status).toEqual(200);
    expect(response.body).toEqual({
      AppliedFeeID: 'FWLNAA07',
      AppliedFeeValue: 2120,
      ChargeAmount: 86920,
      SettlementAmount: 84800,
    });
  });

  it('should accurately compute the transaction fee', async () => {
    const payload = transactions[9];
    const response = await request(server).post('/compute-transaction-fee').send(payload);
    expect(response.status).toEqual(200);
    expect(response.body).toEqual({
      AppliedFeeID: 'FWLNAA06',
      AppliedFeeValue: 360,
      ChargeAmount: 18360,
      SettlementAmount: 18000,
    });
  });

  it('should accurately compute the transaction fee', async () => {
    const payload = transactions[10];
    const response = await request(server).post('/compute-transaction-fee').send(payload);
    expect(response.status).toEqual(200);
    expect(response.body).toEqual({
      AppliedFeeID: 'FWLNAA10',
      AppliedFeeValue: 117,
      ChargeAmount: 6917,
      SettlementAmount: 6800,
    });
  });

  it('should accurately compute the transaction fee', async () => {
    const payload = transactions[11];
    const response = await request(server).post('/compute-transaction-fee').send(payload);
    expect(response.status).toEqual(200);
    expect(response.body).toEqual({
      AppliedFeeID: 'FWLNAA03',
      AppliedFeeValue: 65,
      ChargeAmount: 2750,
      SettlementAmount: 2685,
    });
  });

  it('should accurately compute the transaction fee', async () => {
    const payload = transactions[12];
    const response = await request(server).post('/compute-transaction-fee').send(payload);
    expect(response.status).toEqual(200);
    expect(response.body).toEqual({
      AppliedFeeID: 'FWLNAA04',
      AppliedFeeValue: 35,
      ChargeAmount: 15285,
      SettlementAmount: 15250,
    });
  });

  it('should return an error message if transaction configuration does not exist', async () => {
    const payload = transactions[2];
    const response = await request(server).post('/compute-transaction-fee').send(payload);
    expect(response.status).toEqual(404);
    expect(response.body).toEqual({ Error: 'No fee configuration for this transaction.' });
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
