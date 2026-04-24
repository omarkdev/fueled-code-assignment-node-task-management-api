import { ActivityAction } from '@prisma/client';
import { ActivitiesService } from '../../../src/activities/activities.service';
import { PrismaService } from '../../../src/prisma/prisma.service';

const sample = (overrides: any = {}) => ({
  id: 'a1',
  taskId: 't1',
  taskTitle: 'Title',
  userId: 'u1',
  action: ActivityAction.CREATED,
  changes: {},
  createdAt: new Date('2026-04-23T00:00:00Z'),
  user: { id: 'u1', name: 'Alice' },
  ...overrides,
});

describe('ActivitiesService', () => {
  let prisma: any;
  let service: ActivitiesService;

  beforeEach(() => {
    prisma = {
      activity: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn((ops: Promise<any>[]) => Promise.all(ops)),
    };
    service = new ActivitiesService(prisma as unknown as PrismaService);
  });

  describe('findAll', () => {
    it('builds an empty where clause and returns mapped paginated output', async () => {
      prisma.activity.findMany.mockResolvedValue([sample()]);
      prisma.activity.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, perPage: 20 } as any);

      expect(prisma.activity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: undefined,
            action: undefined,
            createdAt: undefined,
          }),
          skip: 0,
          take: 20,
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result.data[0].userName).toBe('Alice');
      expect(result.data[0].action).toBe('created');
      expect(result.meta).toEqual({ total: 1, page: 1, perPage: 20 });
    });

    it('pushes userId and action filters into the where clause', async () => {
      prisma.activity.findMany.mockResolvedValue([]);
      prisma.activity.count.mockResolvedValue(0);

      await service.findAll({
        page: 1,
        perPage: 10,
        userId: 'u-filter',
        action: ActivityAction.UPDATED,
      } as any);

      expect(prisma.activity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'u-filter',
            action: ActivityAction.UPDATED,
          }),
        }),
      );
    });

    it('builds the createdAt range when dateFrom/dateTo provided', async () => {
      prisma.activity.findMany.mockResolvedValue([]);
      prisma.activity.count.mockResolvedValue(0);

      await service.findAll({
        page: 1,
        perPage: 10,
        dateFrom: '2026-04-01T00:00:00Z',
        dateTo: '2026-04-30T00:00:00Z',
      } as any);

      const args = prisma.activity.findMany.mock.calls[0][0];
      expect(args.where.createdAt.gte).toEqual(new Date('2026-04-01T00:00:00Z'));
      expect(args.where.createdAt.lte).toEqual(new Date('2026-04-30T00:00:00Z'));
    });

    it('honors only dateFrom when dateTo is missing', async () => {
      prisma.activity.findMany.mockResolvedValue([]);
      prisma.activity.count.mockResolvedValue(0);

      await service.findAll({
        page: 1,
        perPage: 10,
        dateFrom: '2026-04-01T00:00:00Z',
      } as any);

      const args = prisma.activity.findMany.mock.calls[0][0];
      expect(args.where.createdAt.gte).toEqual(new Date('2026-04-01T00:00:00Z'));
      expect(args.where.createdAt.lte).toBeUndefined();
    });

    it('computes skip from page/perPage', async () => {
      prisma.activity.findMany.mockResolvedValue([]);
      prisma.activity.count.mockResolvedValue(0);

      await service.findAll({ page: 3, perPage: 25 } as any);
      const args = prisma.activity.findMany.mock.calls[0][0];
      expect(args.skip).toBe(50);
      expect(args.take).toBe(25);
    });
  });

  describe('findByTask', () => {
    it('filters by taskId and returns paginated', async () => {
      prisma.activity.findMany.mockResolvedValue([sample({ taskId: 't-target' })]);
      prisma.activity.count.mockResolvedValue(1);

      const result = await service.findByTask('t-target', { page: 1, perPage: 20 } as any);

      expect(prisma.activity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { taskId: 't-target' } }),
      );
      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({ total: 1, page: 1, perPage: 20 });
    });
  });
});
