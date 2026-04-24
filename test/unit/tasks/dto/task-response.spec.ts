import { TaskPriority, TaskStatus } from '@prisma/client';
import { toTaskResponse } from '../../../../src/tasks/dto/task-response.dto';
import { TaskWithRelations } from '../../../../src/tasks/tasks.repository';

const make = (overrides: Partial<TaskWithRelations> = {}): TaskWithRelations => ({
  id: 't1',
  title: 'title',
  description: 'desc',
  status: TaskStatus.TODO,
  priority: TaskPriority.MEDIUM,
  dueDate: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
  projectId: 'p1',
  assigneeId: 'u1',
  assignee: {
    id: 'u1',
    name: 'Alice',
    email: 'alice@example.com',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  project: { id: 'p1', name: 'Project', createdAt: new Date(), updatedAt: new Date() },
  tags: [{ id: 'tag1', name: 'bug', createdAt: new Date() }],
  ...overrides,
});

describe('toTaskResponse', () => {
  it('flattens relations to summary shapes', () => {
    const res = toTaskResponse(make());
    expect(res).toEqual({
      id: 't1',
      title: 'title',
      description: 'desc',
      status: TaskStatus.TODO,
      priority: TaskPriority.MEDIUM,
      dueDate: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-02T00:00:00Z'),
      assignee: { id: 'u1', name: 'Alice', email: 'alice@example.com' },
      project: { id: 'p1', name: 'Project' },
      tags: [{ id: 'tag1', name: 'bug' }],
    });
  });

  it('serializes null assignee', () => {
    const res = toTaskResponse(make({ assignee: null, assigneeId: null }));
    expect(res.assignee).toBeNull();
  });

  it('returns empty tags array when task has none', () => {
    const res = toTaskResponse(make({ tags: [] }));
    expect(res.tags).toEqual([]);
  });
});
