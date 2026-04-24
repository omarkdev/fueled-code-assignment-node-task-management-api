import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as http from 'http';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

const MAILPIT_API = 'http://localhost:8025/api/v1';

function mailpit(method: 'GET' | 'DELETE', path: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${MAILPIT_API}${path}`);
    const req = http.request(
      { method, hostname: url.hostname, port: url.port, path: url.pathname + url.search },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString();
          if (!body) return resolve({});
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(body);
          }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

async function waitForMessage(predicate: (m: any) => boolean, timeoutMs = 3000): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await mailpit('GET', '/messages?limit=50');
    const match = (res.messages ?? []).find(predicate);
    if (match) return match;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('message not found in mailpit within timeout');
}

describe('Email delivery (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;
  let projectId: string;
  let assigneeEmail: string;
  let createdTaskIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    const users = await prisma.user.findMany({ take: 2 });
    const project = await prisma.project.findFirst();
    if (users.length < 2 || !project) {
      throw new Error('Need at least 2 users and 1 project seeded. Run `npm run seed`.');
    }
    userId = users[0].id;
    assigneeEmail = users[1].email;
    projectId = project.id;

    await mailpit('DELETE', '/messages');
  });

  afterAll(async () => {
    for (const id of createdTaskIds) {
      await request(app.getHttpServer()).delete(`/tasks/${id}`).set('X-User-Id', userId);
    }
    await app.close();
  });

  it('delivers an assignment email when a task is created with an assignee', async () => {
    const res = await request(app.getHttpServer())
      .post('/tasks')
      .set('X-User-Id', userId)
      .send({ title: 'email test create', projectId, assigneeId: (await prisma.user.findMany({ take: 2 }))[1].id })
      .expect(201);
    createdTaskIds.push(res.body.id);

    const msg = await waitForMessage(
      (m) => m.To?.some((t: any) => t.Address === assigneeEmail) && m.Subject.includes('assigned'),
    );
    expect(msg.Subject).toContain('assigned');
  });

  it('does not send an email when a task is created without an assignee', async () => {
    await mailpit('DELETE', '/messages');

    const res = await request(app.getHttpServer())
      .post('/tasks')
      .set('X-User-Id', userId)
      .send({ title: 'email test no assignee', projectId })
      .expect(201);
    createdTaskIds.push(res.body.id);

    // Give the fire-and-forget path time to reach the mailer if it were going to.
    await new Promise((r) => setTimeout(r, 300));

    const inbox = await mailpit('GET', '/messages?limit=50');
    expect(inbox.messages ?? []).toEqual([]);
  });

  it('delivers an email when the assignee changes on update', async () => {
    await mailpit('DELETE', '/messages');
    const users = await prisma.user.findMany({ take: 2 });

    const created = await request(app.getHttpServer())
      .post('/tasks')
      .set('X-User-Id', userId)
      .send({ title: 'email test update', projectId, assigneeId: users[0].id })
      .expect(201);
    createdTaskIds.push(created.body.id);

    await mailpit('DELETE', '/messages');

    await request(app.getHttpServer())
      .put(`/tasks/${created.body.id}`)
      .set('X-User-Id', userId)
      .send({ assigneeId: users[1].id })
      .expect(200);

    const msg = await waitForMessage(
      (m) => m.To?.some((t: any) => t.Address === users[1].email),
    );
    expect(msg).toBeDefined();
  });
});
