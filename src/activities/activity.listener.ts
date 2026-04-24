import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { buildCreatedChanges, diffTask } from './activity-diff';
import {
  TASK_CREATED,
  TASK_UPDATED,
  TaskCreatedEvent,
  TaskUpdatedEvent,
} from '../tasks/task.events';

@Injectable()
export class ActivityListener {
  @OnEvent(TASK_CREATED, { suppressErrors: false })
  async onTaskCreated({ tx, userId, task }: TaskCreatedEvent) {
    await tx.activity.create({
      data: {
        taskId: task.id,
        userId,
        action: 'CREATED',
        taskTitle: task.title,
        changes: buildCreatedChanges(task, task.tags.map((t) => t.id)) as Prisma.InputJsonValue,
      },
    });
  }

  @OnEvent(TASK_UPDATED, { suppressErrors: false })
  async onTaskUpdated({ tx, userId, before, after, dto }: TaskUpdatedEvent) {
    const hasTagsUpdate = dto.tagIds !== undefined;

    const changes = diffTask(
      before,
      {
        title: dto.title,
        description: dto.description,
        status: dto.status,
        priority: dto.priority,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : (dto.dueDate as null | undefined),
        assigneeId: dto.assigneeId,
      },
      before.tags.map((t) => t.id),
      hasTagsUpdate ? dto.tagIds : undefined,
    );

    if (Object.keys(changes).length === 0) return;

    await tx.activity.create({
      data: {
        taskId: after.id,
        userId,
        action: 'UPDATED',
        taskTitle: after.title,
        changes: changes as Prisma.InputJsonValue,
      },
    });
  }
}
