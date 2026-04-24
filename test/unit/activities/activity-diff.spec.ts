import { Task, TaskPriority, TaskStatus } from '@prisma/client';
import { buildCreatedChanges, diffTask } from '../../../src/activities/activity-diff';

const baseTask: Task = {
  id: 'task-1',
  title: 'Original',
  description: 'old desc',
  status: TaskStatus.TODO,
  priority: TaskPriority.MEDIUM,
  dueDate: new Date('2026-05-01T00:00:00Z'),
  createdAt: new Date('2026-04-22T00:00:00Z'),
  updatedAt: new Date('2026-04-22T00:00:00Z'),
  projectId: 'project-1',
  assigneeId: 'user-1',
};

describe('diffTask', () => {
  it('returns an empty object when nothing changed', () => {
    const changes = diffTask(baseTask, {});
    expect(changes).toEqual({});
  });

  it('ignores fields that are undefined in the update DTO', () => {
    const changes = diffTask(baseTask, { title: undefined });
    expect(changes).toEqual({});
  });

  it('records changed scalar fields with old/new values', () => {
    const changes = diffTask(baseTask, {
      title: 'New',
      status: TaskStatus.IN_PROGRESS,
    });
    expect(changes).toEqual({
      title: { old: 'Original', new: 'New' },
      status: { old: 'TODO', new: 'IN_PROGRESS' },
    });
  });

  it('treats equal dates as unchanged regardless of reference', () => {
    const changes = diffTask(baseTask, {
      dueDate: new Date('2026-05-01T00:00:00Z'),
    });
    expect(changes).toEqual({});
  });

  it('records date changes as ISO strings', () => {
    const changes = diffTask(baseTask, {
      dueDate: new Date('2026-06-01T00:00:00Z'),
    });
    expect(changes).toEqual({
      dueDate: {
        old: '2026-05-01T00:00:00.000Z',
        new: '2026-06-01T00:00:00.000Z',
      },
    });
  });

  it('records assignee removal', () => {
    const changes = diffTask(baseTask, { assigneeId: null });
    expect(changes).toEqual({
      assigneeId: { old: 'user-1', new: null },
    });
  });

  it('records tag diffs as added/removed sets', () => {
    const changes = diffTask(baseTask, {}, ['tag-a', 'tag-b'], ['tag-b', 'tag-c']);
    expect(changes).toEqual({
      tags: { added: ['tag-c'], removed: ['tag-a'] },
    });
  });

  it('omits tags when the after set equals the before set', () => {
    const changes = diffTask(baseTask, {}, ['tag-a', 'tag-b'], ['tag-b', 'tag-a']);
    expect(changes).toEqual({});
  });

  it('omits tags entirely when tagIdsAfter is not provided', () => {
    const changes = diffTask(baseTask, { title: 'New' }, ['tag-a']);
    expect(changes).toEqual({ title: { old: 'Original', new: 'New' } });
  });
});

describe('buildCreatedChanges', () => {
  it('records all non-null fields with old=null', () => {
    const changes = buildCreatedChanges(baseTask, ['tag-a']);
    expect(changes).toMatchObject({
      title: { old: null, new: 'Original' },
      status: { old: null, new: 'TODO' },
      priority: { old: null, new: 'MEDIUM' },
      assigneeId: { old: null, new: 'user-1' },
      projectId: { old: null, new: 'project-1' },
      tags: { added: ['tag-a'], removed: [] },
    });
  });

  it('skips null fields and omits tags entry when none', () => {
    const changes = buildCreatedChanges(
      { ...baseTask, description: null, dueDate: null, assigneeId: null },
      [],
    );
    expect(changes).not.toHaveProperty('description');
    expect(changes).not.toHaveProperty('dueDate');
    expect(changes).not.toHaveProperty('assigneeId');
    expect(changes).not.toHaveProperty('tags');
  });
});

