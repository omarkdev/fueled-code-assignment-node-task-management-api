import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClsService } from 'nestjs-cls';
import { TaskPriority, TaskStatus } from '@prisma/client';

import { TasksService } from '../../../src/tasks/tasks.service';
import { TasksRepository, TaskWithRelations } from '../../../src/tasks/tasks.repository';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { EmailService } from '../../../src/email/email.service';
import { ActivitiesService } from '../../../src/activities/activities.service';
import { CLS_USER_ID_KEY } from '../../../src/common/constants';
import { TASK_CREATED, TASK_UPDATED } from '../../../src/tasks/task.events';

const USER_ID = '00000000-0000-4000-8000-000000000001';

const makeTask = (overrides: Partial<TaskWithRelations> = {}): TaskWithRelations => ({
  id: 't1',
  title: 'title',
  description: null,
  status: TaskStatus.TODO,
  priority: TaskPriority.MEDIUM,
  dueDate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  projectId: 'p1',
  assigneeId: null,
  assignee: null,
  project: { id: 'p1', name: 'P', createdAt: new Date(), updatedAt: new Date() },
  tags: [],
  ...overrides,
});

const withAssignee = (email = 'alice@example.com', id = 'u-assignee'): Partial<TaskWithRelations> => ({
  assigneeId: id,
  assignee: {
    id,
    name: 'Alice',
    email,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
});

describe('TasksService', () => {
  let prisma: jest.Mocked<Pick<PrismaService, '$transaction'>>;
  let repo: jest.Mocked<TasksRepository>;
  let email: jest.Mocked<EmailService>;
  let activities: jest.Mocked<ActivitiesService>;
  let events: jest.Mocked<EventEmitter2>;
  let cls: jest.Mocked<ClsService>;
  let service: TasksService;

  const txStub = {} as any;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(async (fn: any) => fn(txStub)),
    } as any;
    repo = {
      findAllPaginated: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as any;
    email = { sendTaskAssignmentNotification: jest.fn() } as any;
    activities = { findByTask: jest.fn() } as any;
    events = { emitAsync: jest.fn().mockResolvedValue([]) } as any;
    cls = { get: jest.fn().mockReturnValue(USER_ID) } as any;

    service = new TasksService(
      prisma as unknown as PrismaService,
      repo,
      email,
      activities,
      events,
      cls,
    );
  });

  describe('findAll', () => {
    it('wraps repo results into the paginated envelope', async () => {
      const task = makeTask();
      repo.findAllPaginated.mockResolvedValue([[task], 1] as any);
      const result = await service.findAll({ page: 2, perPage: 10 } as any);

      expect(result.meta).toEqual({ total: 1, page: 2, perPage: 10 });
      expect(result.data[0].id).toBe('t1');
    });
  });

  describe('findOne', () => {
    it('returns the mapped task when found', async () => {
      repo.findById.mockResolvedValue(makeTask({ id: 'abc' }));
      const result = await service.findOne('abc');
      expect(result.id).toBe('abc');
    });

    it('throws NotFoundException when missing', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findActivities', () => {
    it('verifies task exists then delegates to ActivitiesService', async () => {
      repo.findById.mockResolvedValue(makeTask({ id: 't1' }));
      activities.findByTask.mockResolvedValue({ data: [], meta: { total: 0, page: 1, perPage: 20 } } as any);

      await service.findActivities('t1', { page: 1, perPage: 20 } as any);

      expect(repo.findById).toHaveBeenCalledWith('t1');
      expect(activities.findByTask).toHaveBeenCalledWith('t1', { page: 1, perPage: 20 });
    });

    it('propagates NotFoundException when task is missing', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.findActivities('missing', {} as any)).rejects.toThrow(NotFoundException);
      expect(activities.findByTask).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('emits task.created inside the transaction and returns the mapped task', async () => {
      const created = makeTask({ id: 'new' });
      repo.create.mockResolvedValue(created);

      const result = await service.create({ title: 'x', projectId: 'p1' } as any);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(repo.create).toHaveBeenCalledWith({ title: 'x', projectId: 'p1' }, txStub);
      expect(events.emitAsync).toHaveBeenCalledWith(TASK_CREATED, {
        tx: txStub,
        userId: USER_ID,
        task: created,
      });
      expect(result.id).toBe('new');
    });

    it('fires the email notification when an assignee is set', async () => {
      const created = makeTask({ ...withAssignee('bob@example.com') });
      repo.create.mockResolvedValue(created);
      email.sendTaskAssignmentNotification.mockResolvedValue();

      await service.create({ title: 'x', projectId: 'p1', assigneeId: 'u-assignee' } as any);

      expect(email.sendTaskAssignmentNotification).toHaveBeenCalledWith('bob@example.com', 'title');
    });

    it('does not call the mailer when there is no assignee', async () => {
      repo.create.mockResolvedValue(makeTask());
      await service.create({ title: 'x', projectId: 'p1' } as any);
      expect(email.sendTaskAssignmentNotification).not.toHaveBeenCalled();
    });

    it('throws when CLS has no userId (guard invariant broken)', async () => {
      cls.get.mockReturnValue(undefined as any);
      await expect(service.create({ title: 'x', projectId: 'p1' } as any)).rejects.toThrow(
        /guard invariant/,
      );
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('loads existing task first, then emits task.updated inside the transaction', async () => {
      const existing = makeTask({ title: 'old' });
      const updated = makeTask({ title: 'new' });
      repo.findById.mockResolvedValue(existing);
      repo.update.mockResolvedValue(updated);

      await service.update('t1', { title: 'new' } as any);

      expect(repo.findById).toHaveBeenCalledWith('t1');
      expect(repo.update).toHaveBeenCalledWith('t1', { title: 'new' }, txStub);
      expect(events.emitAsync).toHaveBeenCalledWith(TASK_UPDATED, {
        tx: txStub,
        userId: USER_ID,
        before: existing,
        after: updated,
        dto: { title: 'new' },
      });
    });

    it('notifies the new assignee when assignee actually changes', async () => {
      const existing = makeTask({ ...withAssignee('old@x.com', 'u-old') });
      const updated = makeTask({ ...withAssignee('new@x.com', 'u-new') });
      repo.findById.mockResolvedValue(existing);
      repo.update.mockResolvedValue(updated);
      email.sendTaskAssignmentNotification.mockResolvedValue();

      await service.update('t1', { assigneeId: 'u-new' } as any);

      expect(email.sendTaskAssignmentNotification).toHaveBeenCalledWith('new@x.com', 'title');
    });

    it('skips notification when assignee is not changing', async () => {
      const same = makeTask({ ...withAssignee('alice@x.com', 'u-1') });
      repo.findById.mockResolvedValue(same);
      repo.update.mockResolvedValue(same);

      await service.update('t1', { assigneeId: 'u-1' } as any);

      expect(email.sendTaskAssignmentNotification).not.toHaveBeenCalled();
    });

    it('propagates NotFoundException for missing task', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.update('missing', {} as any)).rejects.toThrow(NotFoundException);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('loads, then deletes — no transaction, no event', async () => {
      repo.findById.mockResolvedValue(makeTask());
      repo.delete.mockResolvedValue(undefined as any);

      const result = await service.remove('t1');

      expect(repo.delete).toHaveBeenCalledWith('t1');
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(events.emitAsync).not.toHaveBeenCalled();
      expect(result).toEqual({ message: 'Task deleted successfully' });
    });

    it('throws NotFoundException when task does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });

  describe('notifyAssignee (fire-and-forget)', () => {
    it('does not reject the caller when the mailer fails with an Error', async () => {
      const created = makeTask({ ...withAssignee('bob@example.com') });
      repo.create.mockResolvedValue(created);
      email.sendTaskAssignmentNotification.mockRejectedValue(new Error('smtp down'));
      const loggerSpy = jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined);

      await expect(
        service.create({ title: 'x', projectId: 'p1', assigneeId: 'u-assignee' } as any),
      ).resolves.toBeDefined();

      await new Promise((r) => setImmediate(r));
      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('smtp down'));
      loggerSpy.mockRestore();
    });

    it('stringifies non-Error rejection reasons', async () => {
      const created = makeTask({ ...withAssignee('bob@example.com') });
      repo.create.mockResolvedValue(created);
      email.sendTaskAssignmentNotification.mockRejectedValue('plain-string-reason');
      const loggerSpy = jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined);

      await service.create({ title: 'x', projectId: 'p1', assigneeId: 'u-assignee' } as any);
      await new Promise((r) => setImmediate(r));

      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('plain-string-reason'));
      loggerSpy.mockRestore();
    });
  });

  it('reads userId from CLS using the shared key', async () => {
    repo.create.mockResolvedValue(makeTask());
    await service.create({ title: 'x', projectId: 'p1' } as any);
    expect(cls.get).toHaveBeenCalledWith(CLS_USER_ID_KEY);
  });
});
