import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ActivityListener } from '../../src/activities/activity.listener';

describe('TasksController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;
  let projectId: string;

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
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /tasks', () => {
    it('returns a paginated envelope with meta', async () => {
      const res = await request(app.getHttpServer()).get('/tasks').expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toMatchObject({ page: 1, perPage: 20 });
      expect(res.body.meta.total).toBeGreaterThanOrEqual(0);

      res.body.data.forEach((t: any) => {
        expect(t).toHaveProperty('assignee');
        expect(t).toHaveProperty('project');
        expect(t).toHaveProperty('tags');
      });
    });

    it('honors page and perPage query params', async () => {
      const res = await request(app.getHttpServer())
        .get('/tasks?page=1&perPage=5')
        .expect(200);

      expect(res.body.meta.perPage).toBe(5);
      expect(res.body.data.length).toBeLessThanOrEqual(5);
    });

    it('filters by status and returns only matching rows', async () => {
      const res = await request(app.getHttpServer())
        .get('/tasks?status=TODO&perPage=100')
        .expect(200);

      expect(res.body.data.every((t: any) => t.status === 'TODO')).toBe(true);
    });

    it('rejects an invalid status enum with 400', async () => {
      await request(app.getHttpServer())
        .get('/tasks?status=NOPE')
        .expect(400);
    });
  });

  describe('Auth', () => {
    it('rejects mutations without X-User-Id header with 401', async () => {
      await request(app.getHttpServer())
        .post('/tasks')
        .send({ title: 'no user', projectId })
        .expect(401);
    });

    it('rejects mutations with a malformed X-User-Id with 401', async () => {
      await request(app.getHttpServer())
        .post('/tasks')
        .set('X-User-Id', 'not-a-uuid')
        .send({ title: 'bad user', projectId })
        .expect(401);
    });
  });

  describe('Activity log', () => {
    it('emits CREATED / UPDATED activities and cascades deletion', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/tasks')
        .set('X-User-Id', userId)
        .send({
          title: 'Activity log smoke test',
          description: 'original',
          projectId,
        })
        .expect(201);

      const taskId = createRes.body.id;

      await request(app.getHttpServer())
        .put(`/tasks/${taskId}`)
        .set('X-User-Id', userId)
        .send({ title: 'renamed', status: 'IN_PROGRESS' })
        .expect(200);

      const taskActivitiesRes = await request(app.getHttpServer())
        .get(`/tasks/${taskId}/activities`)
        .expect(200);

      expect(taskActivitiesRes.body).toHaveProperty('data');
      expect(taskActivitiesRes.body).toHaveProperty('meta');
      expect(taskActivitiesRes.body.data).toHaveLength(2);

      const [updated, created] = taskActivitiesRes.body.data;
      expect(created.action).toBe('created');
      expect(updated.action).toBe('updated');
      expect(updated.changes).toMatchObject({
        title: { old: 'Activity log smoke test', new: 'renamed' },
        status: { old: 'TODO', new: 'IN_PROGRESS' },
      });
      expect(updated.userName).toBeDefined();

      await request(app.getHttpServer())
        .delete(`/tasks/${taskId}`)
        .set('X-User-Id', userId)
        .expect(200);

      const orphanCount = await prisma.activity.count({ where: { taskId } });
      expect(orphanCount).toBe(0);
    });

    it('returns 404 on /tasks/:unknown/activities', async () => {
      await request(app.getHttpServer())
        .get('/tasks/00000000-0000-4000-8000-000000000000/activities')
        .expect(404);
    });

    it('filters /activities by action', async () => {
      const res = await request(app.getHttpServer())
        .get('/activities?action=CREATED&perPage=5')
        .expect(200);

      expect(res.body.data.every((a: any) => a.action === 'created')).toBe(true);
    });

    it('filters /activities by date range', async () => {
      const far = '2020-01-01T00:00:00Z';
      const res = await request(app.getHttpServer())
        .get(`/activities?dateTo=${far}`)
        .expect(200);

      expect(res.body.data).toEqual([]);
    });
  });

  describe('Transaction atomicity (rollback)', () => {
    it('rolls back the task mutation when the activity listener throws', async () => {
      const listener = app.get(ActivityListener);
      const spy = jest
        .spyOn(listener, 'onTaskCreated')
        .mockRejectedValueOnce(new Error('boom'));

      const uniqueTitle = `rollback-probe-${Date.now()}`;

      await request(app.getHttpServer())
        .post('/tasks')
        .set('X-User-Id', userId)
        .send({ title: uniqueTitle, projectId })
        .expect(500);

      const persisted = await prisma.task.findFirst({ where: { title: uniqueTitle } });
      expect(persisted).toBeNull();

      spy.mockRestore();
    });
  });
});
