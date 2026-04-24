import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('ProjectsController (e2e)', () => {
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

  describe('GET /projects', () => {
    it('returns a non-empty array of projects', async () => {
      const res = await request(app.getHttpServer()).get('/projects').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('each project exposes id, name, createdAt and updatedAt', async () => {
      const res = await request(app.getHttpServer()).get('/projects').expect(200);
      for (const project of res.body) {
        expect(project).toEqual(
          expect.objectContaining({
            id: expect.any(String),
            name: expect.any(String),
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
          }),
        );
      }
    });

    it('does not require X-User-Id (read-only endpoint)', async () => {
      await request(app.getHttpServer()).get('/projects').expect(200);
    });
  });
});
