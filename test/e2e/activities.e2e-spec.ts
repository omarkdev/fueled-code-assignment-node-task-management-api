import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('ActivitiesController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;
  let projectId: string;
  let seededTaskId: string;

  // Baseline set of activities produced by the test:
  //   1. CREATED (title "activities e2e seed")
  //   2. UPDATED (title → "activities e2e seed renamed")
  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    const user = await prisma.user.findFirst();
    const project = await prisma.project.findFirst();
    if (!user || !project) {
      throw new Error('Run `npm run seed` before running e2e tests.');
    }
    userId = user.id;
    projectId = project.id;

    const createRes = await request(app.getHttpServer())
      .post('/tasks')
      .set('X-User-Id', userId)
      .send({ title: 'activities e2e seed', projectId })
      .expect(201);
    seededTaskId = createRes.body.id;

    await request(app.getHttpServer())
      .put(`/tasks/${seededTaskId}`)
      .set('X-User-Id', userId)
      .send({ title: 'activities e2e seed renamed' })
      .expect(200);
  });

  afterAll(async () => {
    // Cascade wipes the 2 activities + any spill from earlier test failures.
    if (seededTaskId) {
      await request(app.getHttpServer())
        .delete(`/tasks/${seededTaskId}`)
        .set('X-User-Id', userId);
    }
    await app.close();
  });

  describe('GET /activities', () => {
    it('returns the paginated envelope per spec ({ data, meta })', async () => {
      const res = await request(app.getHttpServer()).get('/activities').expect(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta');
      expect(res.body.meta).toMatchObject({ page: 1, perPage: 20 });
      expect(res.body.meta.total).toBeGreaterThanOrEqual(2);
    });

    it('honors page and perPage', async () => {
      const res = await request(app.getHttpServer())
        .get('/activities?page=1&perPage=1')
        .expect(200);
      expect(res.body.meta.perPage).toBe(1);
      expect(res.body.data.length).toBeLessThanOrEqual(1);
    });

    it('orders results by createdAt desc by default', async () => {
      const res = await request(app.getHttpServer())
        .get('/activities?perPage=50')
        .expect(200);
      const times = res.body.data.map((a: any) => new Date(a.createdAt).getTime());
      for (let i = 1; i < times.length; i++) {
        expect(times[i - 1]).toBeGreaterThanOrEqual(times[i]);
      }
    });

    it('filters by userId', async () => {
      const res = await request(app.getHttpServer())
        .get(`/activities?userId=${userId}&perPage=100`)
        .expect(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      expect(res.body.data.every((a: any) => a.userId === userId)).toBe(true);
    });

    it('filters by action', async () => {
      const res = await request(app.getHttpServer())
        .get('/activities?action=UPDATED&perPage=100')
        .expect(200);
      expect(res.body.data.every((a: any) => a.action === 'updated')).toBe(true);
    });

    it('filters by date range (past dateTo returns nothing)', async () => {
      const res = await request(app.getHttpServer())
        .get('/activities?dateTo=2020-01-01T00:00:00Z')
        .expect(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta.total).toBe(0);
    });

    it('combines filters (userId + action)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/activities?userId=${userId}&action=CREATED&perPage=100`)
        .expect(200);
      expect(
        res.body.data.every((a: any) => a.userId === userId && a.action === 'created'),
      ).toBe(true);
    });

    it('rejects an invalid action enum with 400', async () => {
      await request(app.getHttpServer())
        .get('/activities?action=BOGUS')
        .expect(400);
    });

    it('rejects a malformed userId UUID with 400', async () => {
      await request(app.getHttpServer())
        .get('/activities?userId=not-a-uuid')
        .expect(400);
    });

    it('rejects a non-integer page with 400', async () => {
      await request(app.getHttpServer())
        .get('/activities?page=abc')
        .expect(400);
    });

    it('rejects a malformed dateFrom with 400', async () => {
      await request(app.getHttpServer())
        .get('/activities?dateFrom=not-a-date')
        .expect(400);
    });
  });

  describe('GET /tasks/:id/activities', () => {
    it('returns all activities for the seeded task in createdAt desc order', async () => {
      const res = await request(app.getHttpServer())
        .get(`/tasks/${seededTaskId}/activities`)
        .expect(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].action).toBe('updated');
      expect(res.body.data[1].action).toBe('created');
    });

    it('every returned activity references the same taskId', async () => {
      const res = await request(app.getHttpServer())
        .get(`/tasks/${seededTaskId}/activities`)
        .expect(200);
      expect(res.body.data.every((a: any) => a.taskId === seededTaskId)).toBe(true);
    });

    it('exposes userName via the User join', async () => {
      const res = await request(app.getHttpServer())
        .get(`/tasks/${seededTaskId}/activities`)
        .expect(200);
      expect(res.body.data[0].userName).toEqual(expect.any(String));
    });

    it('returns 404 when the task does not exist', async () => {
      await request(app.getHttpServer())
        .get('/tasks/00000000-0000-4000-8000-000000000000/activities')
        .expect(404);
    });
  });
});
