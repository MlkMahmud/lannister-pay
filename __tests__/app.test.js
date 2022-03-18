import request from 'supertest';
import app from '../src/app';

const server = app.listen();

afterAll(() => {
  server.close();
});

describe('/fees', () => {
  it('should exist', async () => {
    const response = await request(server).post('/fees').send();
    expect(response.status).toEqual(200);
  });
});

describe('/compute-transaction-fee', () => {
  it('should return a valid response', async () => {
    const response = await request(server).post('/compute-transaction-fee').send();
    expect(response.status).toEqual(200);
    expect(response.body).toEqual({ message: 'compute fee' });
  });
});
