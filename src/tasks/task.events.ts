import { Prisma, Tag, Task } from '@prisma/client';
import { UpdateTaskDto } from './dto/update-task.dto';

export const TASK_CREATED = 'task.created';
export const TASK_UPDATED = 'task.updated';

export type TxClient = Prisma.TransactionClient;

type TaskWithTags = Task & { tags: Tag[] };

export interface TaskCreatedEvent {
  tx: TxClient;
  userId: string;
  task: TaskWithTags;
}

export interface TaskUpdatedEvent {
  tx: TxClient;
  userId: string;
  before: TaskWithTags;
  after: TaskWithTags;
  dto: UpdateTaskDto;
}
