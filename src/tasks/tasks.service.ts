import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskFilterDto } from './dto/task-filter.dto';
import { TasksRepository, TaskWithRelations } from './tasks.repository';
import { toTaskResponse, TaskResponse } from './dto/task-response.dto';
import { paginated, Paginated } from '../common/dto/paginated';
import { CLS_USER_ID_KEY } from '../common/constants';
import { ActivitiesService } from '../activities/activities.service';
import { TaskActivityFilterDto } from '../activities/dto/activity-filter.dto';
import {
  TASK_CREATED,
  TASK_UPDATED,
  TaskCreatedEvent,
  TaskUpdatedEvent,
} from './task.events';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksRepository: TasksRepository,
    private readonly emailService: EmailService,
    private readonly activitiesService: ActivitiesService,
    private readonly events: EventEmitter2,
    private readonly cls: ClsService,
  ) {}

  private currentUserId(): string {
    const userId = this.cls.get<string>(CLS_USER_ID_KEY);
    if (!userId) {
      throw new Error('currentUserId() called without a user in CLS — guard invariant broken');
    }
    return userId;
  }

  async findAll(filter: TaskFilterDto): Promise<Paginated<TaskResponse>> {
    const [rows, total] = await this.tasksRepository.findAllPaginated(filter);
    return paginated(rows.map(toTaskResponse), total, filter.page, filter.perPage);
  }

  async findOne(id: string): Promise<TaskResponse> {
    return toTaskResponse(await this.loadOrThrow(id));
  }

  private async loadOrThrow(id: string): Promise<TaskWithRelations> {
    const task = await this.tasksRepository.findById(id);
    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
    return task;
  }

  async findActivities(taskId: string, filter: TaskActivityFilterDto) {
    await this.loadOrThrow(taskId);
    return this.activitiesService.findByTask(taskId, filter);
  }

  async create(dto: CreateTaskDto): Promise<TaskResponse> {
    const userId = this.currentUserId();

    const task = await this.prisma.$transaction(async (tx) => {
      const created = await this.tasksRepository.create(dto, tx);
      const event: TaskCreatedEvent = { tx, userId, task: created };
      await this.events.emitAsync(TASK_CREATED, event);
      return created;
    });

    if (task.assignee) {
      this.notifyAssignee(task.assignee.email, task.title);
    }

    return toTaskResponse(task);
  }

  async update(id: string, dto: UpdateTaskDto): Promise<TaskResponse> {
    const userId = this.currentUserId();
    const existingTask = await this.loadOrThrow(id);

    const task = await this.prisma.$transaction(async (tx) => {
      const updated = await this.tasksRepository.update(id, dto, tx);

      await this.events.emitAsync(TASK_UPDATED, {
        tx,
        userId,
        before: existingTask,
        after: updated,
        dto,
      } as TaskUpdatedEvent);

      return updated;
    });

    if (dto.assigneeId && dto.assigneeId !== existingTask.assigneeId) {
      this.notifyAssignee(task.assignee!.email, task.title);
    }

    return toTaskResponse(task);
  }

  async remove(id: string) {
    await this.loadOrThrow(id);
    await this.tasksRepository.delete(id);
    return { message: 'Task deleted successfully' };
  }

  private notifyAssignee(email: string, title: string): void {
    this.emailService
      .sendTaskAssignmentNotification(email, title)
      .catch((err: unknown) => {
        const reason = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to send task assignment notification to ${email}: ${reason}`);
      });
  }
}
