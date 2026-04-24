import { Prisma } from '@prisma/client';

const ACTIVITY_INCLUDE = {
  user: { select: { id: true, name: true } },
} as const;

type ActivityWithUser = Prisma.ActivityGetPayload<{ include: typeof ACTIVITY_INCLUDE }>;

export { ACTIVITY_INCLUDE };
export type { ActivityWithUser };

export interface ActivityResponse {
  id: string;
  taskId: string;
  taskTitle: string;
  userId: string;
  userName: string;
  action: string;
  changes: Prisma.JsonValue;
  createdAt: Date;
}

export const toActivityResponse = (a: ActivityWithUser): ActivityResponse => ({
  id: a.id,
  taskId: a.taskId,
  taskTitle: a.taskTitle,
  userId: a.userId,
  userName: a.user.name,
  action: a.action.toLowerCase(),
  changes: a.changes,
  createdAt: a.createdAt,
});
