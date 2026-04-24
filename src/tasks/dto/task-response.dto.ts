import { TaskPriority, TaskStatus } from '@prisma/client';
import { TaskWithRelations } from '../tasks.repository';

export interface UserSummary { id: string; name: string; email: string }
export interface ProjectSummary { id: string; name: string }
export interface TagSummary { id: string; name: string }

export interface TaskResponse {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  assignee: UserSummary | null;
  project: ProjectSummary;
  tags: TagSummary[];
}

export const toTaskResponse = (task: TaskWithRelations): TaskResponse => ({
  id: task.id,
  title: task.title,
  description: task.description,
  status: task.status,
  priority: task.priority,
  dueDate: task.dueDate,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
  assignee: task.assignee
    ? { id: task.assignee.id, name: task.assignee.name, email: task.assignee.email }
    : null,
  project: { id: task.project.id, name: task.project.name },
  tags: task.tags.map((t) => ({ id: t.id, name: t.name })),
});
