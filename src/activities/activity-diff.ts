import { Task } from '@prisma/client';

export type FieldChange = { old: unknown; new: unknown };
export type TagsChange = { added: string[]; removed: string[] };

export type ActivityChanges = Record<string, FieldChange | TagsChange>;

const TRACKED_FIELDS = [
  'title',
  'description',
  'status',
  'priority',
  'dueDate',
  'assigneeId',
  'projectId',
] as const satisfies readonly (keyof Task)[];

type TrackedField = (typeof TRACKED_FIELDS)[number];

type TaskLike = Pick<Task, TrackedField>;

const normalize = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  return value ?? null;
};

const isEqual = (a: unknown, b: unknown): boolean => normalize(a) === normalize(b);

export const diffTask = (
  before: TaskLike,
  after: Partial<TaskLike>,
  tagIdsBefore?: string[],
  tagIdsAfter?: string[],
): ActivityChanges => {
  const changes: ActivityChanges = {};

  for (const field of TRACKED_FIELDS) {
    const incoming = after[field];
    if (incoming === undefined) continue;
    if (isEqual(before[field], incoming)) continue;
    changes[field] = {
      old: normalize(before[field]),
      new: normalize(incoming),
    };
  }

  if (tagIdsAfter !== undefined) {
    const beforeSet = new Set(tagIdsBefore ?? []);
    const afterSet = new Set(tagIdsAfter);
    const added = [...afterSet].filter((id) => !beforeSet.has(id));
    const removed = [...beforeSet].filter((id) => !afterSet.has(id));
    if (added.length || removed.length) {
      changes['tags'] = { added, removed };
    }
  }

  return changes;
};

export const buildCreatedChanges = (task: TaskLike, tagIds: string[]): ActivityChanges => {
  const changes: ActivityChanges = {};
  for (const field of TRACKED_FIELDS) {
    const value = task[field];
    if (value === null || value === undefined) continue;
    changes[field] = { old: null, new: normalize(value) };
  }
  if (tagIds.length) {
    changes['tags'] = { added: tagIds, removed: [] };
  }
  return changes;
};

