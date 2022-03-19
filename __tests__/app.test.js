import request from 'supertest';
import app from '../src/app';
import redis from '../src/lib/redis';

jest.mock('../src/lib/redis');

const server = app.listen();

afterAll(() => {
  server.close();
});

afterEach(async () => {
  await redis.clear();
});

describe('/fees', () => {
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
        feeValue: '5.0',
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
      '"currency" is not allowed to be empty',
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
