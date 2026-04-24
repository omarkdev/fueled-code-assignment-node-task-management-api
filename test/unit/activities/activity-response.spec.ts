import { ActivityAction } from '@prisma/client';
import {
  ActivityWithUser,
  toActivityResponse,
} from '../../../src/activities/dto/activity-response.dto';

const base: ActivityWithUser = {
  id: 'a1',
  taskId: 't1',
  taskTitle: 'Task title',
  userId: 'u1',
  action: ActivityAction.UPDATED,
  changes: { title: { old: 'A', new: 'B' } },
  createdAt: new Date('2026-04-23T12:00:00Z'),
  user: { id: 'u1', name: 'Alice' },
};

describe('toActivityResponse', () => {
  it('flattens user and lowercases action', () => {
    const res = toActivityResponse(base);
    expect(res).toEqual({
      id: 'a1',
      taskId: 't1',
      taskTitle: 'Task title',
      userId: 'u1',
      userName: 'Alice',
      action: 'updated',
      changes: { title: { old: 'A', new: 'B' } },
      createdAt: new Date('2026-04-23T12:00:00Z'),
    });
  });

  it('serializes CREATED and DELETED actions', () => {
    expect(toActivityResponse({ ...base, action: ActivityAction.CREATED }).action).toBe('created');
    expect(toActivityResponse({ ...base, action: ActivityAction.DELETED }).action).toBe('deleted');
  });
});
