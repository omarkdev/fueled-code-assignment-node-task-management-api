import { Tag, Task, TaskPriority, TaskStatus } from '@prisma/client';
import { ActivityListener } from '../../../src/activities/activity.listener';
import { TxClient } from '../../../src/tasks/task.events';

type TaskWithTags = Task & { tags: Tag[] };

const baseTask: TaskWithTags = {
  id: 'task-1',
  title: 'Original',
  description: 'old desc',
  status: TaskStatus.TODO,
  priority: TaskPriority.MEDIUM,
  dueDate: null,
  createdAt: new Date('2026-04-23T00:00:00Z'),
  updatedAt: new Date('2026-04-23T00:00:00Z'),
  projectId: 'project-1',
  assigneeId: 'user-1',
  tags: [],
};

const makeTx = () => {
  const create = jest.fn();
  const tx = { activity: { create } } as unknown as TxClient;
  return { tx, create };
};

describe('ActivityListener', () => {
  const listener = new ActivityListener();

  it('onTaskCreated inserts a CREATED activity with full snapshot', async () => {
    const { tx, create } = makeTx();
    await listener.onTaskCreated({ tx, userId: 'u', task: baseTask });

    expect(create).toHaveBeenCalledTimes(1);
    const args = create.mock.calls[0][0];
    expect(args.data.action).toBe('CREATED');
    expect(args.data.taskId).toBe('task-1');
    expect(args.data.userId).toBe('u');
    expect(args.data.taskTitle).toBe('Original');
    expect(args.data.changes).toMatchObject({
      title: { old: null, new: 'Original' },
    });
  });

  it('onTaskUpdated inserts an UPDATED activity with just the diff', async () => {
    const { tx, create } = makeTx();
    await listener.onTaskUpdated({
      tx,
      userId: 'u',
      before: baseTask,
      after: { ...baseTask, title: 'Renamed' },
      dto: { title: 'Renamed' },
    });

    expect(create).toHaveBeenCalledTimes(1);
    const args = create.mock.calls[0][0];
    expect(args.data.action).toBe('UPDATED');
    expect(args.data.changes).toEqual({
      title: { old: 'Original', new: 'Renamed' },
    });
  });

  it('onTaskUpdated writes nothing when the diff is empty', async () => {
    const { tx, create } = makeTx();
    await listener.onTaskUpdated({
      tx,
      userId: 'u',
      before: baseTask,
      after: baseTask,
      dto: {},
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('onTaskCreated folds initial tags into the changes payload', async () => {
    const { tx, create } = makeTx();
    await listener.onTaskCreated({
      tx,
      userId: 'u',
      task: {
        ...baseTask,
        tags: [
          { id: 'tag-a', name: 'a', createdAt: new Date() },
          { id: 'tag-b', name: 'b', createdAt: new Date() },
        ],
      },
    });

    const args = create.mock.calls[0][0];
    expect(args.data.changes).toMatchObject({
      tags: { added: ['tag-a', 'tag-b'], removed: [] },
    });
  });

  it('onTaskUpdated passes through a null dueDate in the DTO (clear)', async () => {
    const { tx, create } = makeTx();
    const before = { ...baseTask, dueDate: new Date('2026-05-01T00:00:00Z') };
    const after = { ...baseTask, dueDate: null };

    await listener.onTaskUpdated({
      tx,
      userId: 'u',
      before,
      after,
      dto: { dueDate: null as any },
    });

    const args = create.mock.calls[0][0];
    expect(args.data.changes).toEqual({
      dueDate: { old: '2026-05-01T00:00:00.000Z', new: null },
    });
  });

  it('onTaskUpdated converts a string dueDate DTO to a Date before diffing', async () => {
    const { tx, create } = makeTx();
    const before = { ...baseTask, dueDate: new Date('2026-05-01T00:00:00Z') };
    const after = { ...baseTask, dueDate: new Date('2026-06-01T00:00:00Z') };

    await listener.onTaskUpdated({
      tx,
      userId: 'u',
      before,
      after,
      dto: { dueDate: '2026-06-01T00:00:00Z' },
    });

    const args = create.mock.calls[0][0];
    expect(args.data.changes).toEqual({
      dueDate: {
        old: '2026-05-01T00:00:00.000Z',
        new: '2026-06-01T00:00:00.000Z',
      },
    });
  });
});
