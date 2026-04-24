import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('UsersController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /users', () => {
    it('returns a non-empty array of users', async () => {
      const res = await request(app.getHttpServer()).get('/users').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('each user exposes id, email and name', async () => {
      const res = await request(app.getHttpServer()).get('/users').expect(200);
      for (const user of res.body) {
        expect(user).toEqual(
          expect.objectContaining({
            id: expect.any(String),
            email: expect.any(String),
            name: expect.any(String),
          }),
        );
      }
    });

    it('does not require X-User-Id (read-only endpoint)', async () => {
      await request(app.getHttpServer()).get('/users').expect(200);
    });
  });
});
