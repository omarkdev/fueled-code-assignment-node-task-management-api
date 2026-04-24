import { TaskPriority, TaskStatus } from '@prisma/client';
import { TasksRepository } from '../../../src/tasks/tasks.repository';
import { PrismaService } from '../../../src/prisma/prisma.service';

describe('TasksRepository', () => {
  let prisma: any;
  let repo: TasksRepository;

  beforeEach(() => {
    prisma = {
      task: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn((ops: Promise<any>[]) => Promise.all(ops)),
    };
    repo = new TasksRepository(prisma as unknown as PrismaService);
  });

  describe('findAllPaginated', () => {
    it('builds a full where clause with dueDate range, skip and take', async () => {
      prisma.task.findMany.mockResolvedValue([]);
      prisma.task.count.mockResolvedValue(0);

      await repo.findAllPaginated({
        page: 3,
        perPage: 5,
        status: TaskStatus.TODO,
        priority: TaskPriority.HIGH,
        assigneeId: 'u1',
        projectId: 'p1',
        dueDateFrom: '2026-01-01T00:00:00Z',
        dueDateTo: '2026-02-01T00:00:00Z',
      } as any);

      const args = prisma.task.findMany.mock.calls[0][0];
      expect(args.where).toMatchObject({
        status: TaskStatus.TODO,
        priority: TaskPriority.HIGH,
        assigneeId: 'u1',
        projectId: 'p1',
      });
      expect(args.where.dueDate.gte).toEqual(new Date('2026-01-01T00:00:00Z'));
      expect(args.where.dueDate.lte).toEqual(new Date('2026-02-01T00:00:00Z'));
      expect(args.skip).toBe(10);
      expect(args.take).toBe(5);
      expect(args.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('omits the dueDate clause entirely when no dates supplied', async () => {
      prisma.task.findMany.mockResolvedValue([]);
      prisma.task.count.mockResolvedValue(0);

      await repo.findAllPaginated({ page: 1, perPage: 20 } as any);

      const args = prisma.task.findMany.mock.calls[0][0];
      expect(args.where.dueDate).toBeUndefined();
    });
  });

  describe('findById', () => {
    it('queries with include of all relations', async () => {
      prisma.task.findUnique.mockResolvedValue(null);
      await repo.findById('t1');
      expect(prisma.task.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 't1' },
          include: { assignee: true, project: true, tags: true },
        }),
      );
    });
  });

  describe('create', () => {
    it('connects project, assignee and tags when provided', async () => {
      prisma.task.create.mockResolvedValue({});
      await repo.create({
        title: 'T',
        projectId: 'p1',
        assigneeId: 'u1',
        tagIds: ['tag-a', 'tag-b'],
      } as any);

      const { data } = prisma.task.create.mock.calls[0][0];
      expect(data.project).toEqual({ connect: { id: 'p1' } });
      expect(data.assignee).toEqual({ connect: { id: 'u1' } });
      expect(data.tags).toEqual({ connect: [{ id: 'tag-a' }, { id: 'tag-b' }] });
    });

    it('leaves assignee and tags undefined when not provided', async () => {
      prisma.task.create.mockResolvedValue({});
      await repo.create({ title: 'T', projectId: 'p1' } as any);

      const { data } = prisma.task.create.mock.calls[0][0];
      expect(data.assignee).toBeUndefined();
      expect(data.tags).toBeUndefined();
    });

    it('uses the passed tx client when provided', async () => {
      const tx = { task: { create: jest.fn().mockResolvedValue({}) } };
      await repo.create({ title: 'T', projectId: 'p1' } as any, tx as any);
      expect(tx.task.create).toHaveBeenCalledTimes(1);
      expect(prisma.task.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('connects a new assignee', async () => {
      prisma.task.update.mockResolvedValue({});
      await repo.update('t1', { assigneeId: 'u2' } as any);
      const { data } = prisma.task.update.mock.calls[0][0];
      expect(data.assignee).toEqual({ connect: { id: 'u2' } });
    });

    it('disconnects the assignee when null is passed', async () => {
      prisma.task.update.mockResolvedValue({});
      await repo.update('t1', { assigneeId: null } as any);
      const { data } = prisma.task.update.mock.calls[0][0];
      expect(data.assignee).toEqual({ disconnect: true });
    });

    it('leaves assignee untouched when key is absent', async () => {
      prisma.task.update.mockResolvedValue({});
      await repo.update('t1', { title: 'new' } as any);
      const { data } = prisma.task.update.mock.calls[0][0];
      expect(data.assignee).toBeUndefined();
    });

    it('uses set for tags when tagIds is provided', async () => {
      prisma.task.update.mockResolvedValue({});
      await repo.update('t1', { tagIds: ['a', 'b'] } as any);
      const { data } = prisma.task.update.mock.calls[0][0];
      expect(data.tags).toEqual({ set: [{ id: 'a' }, { id: 'b' }] });
    });

    it('leaves tags untouched when tagIds is absent', async () => {
      prisma.task.update.mockResolvedValue({});
      await repo.update('t1', { title: 'x' } as any);
      const { data } = prisma.task.update.mock.calls[0][0];
      expect(data.tags).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('calls prisma.task.delete with the id', async () => {
      prisma.task.delete.mockResolvedValue({});
      await repo.delete('t1');
      expect(prisma.task.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
    });
  });
});
