import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskFilterDto } from './dto/task-filter.dto';

type TxOrBase = PrismaService | Prisma.TransactionClient;

export const TASK_INCLUDE = {
  assignee: true,
  project: true,
  tags: true,
} satisfies Prisma.TaskInclude;

export type TaskWithRelations = Prisma.TaskGetPayload<{ include: typeof TASK_INCLUDE }>;

const buildWhere = (filter: TaskFilterDto): Prisma.TaskWhereInput => {
  const { status, priority, assigneeId, projectId, dueDateFrom, dueDateTo } = filter;
  return {
    status,
    priority,
    assigneeId,
    projectId,
    dueDate: dueDateFrom || dueDateTo ? {
      gte: dueDateFrom ? new Date(dueDateFrom) : undefined,
      lte: dueDateTo ? new Date(dueDateTo) : undefined,
    } : undefined,
  };
};

const buildCreateData = (dto: CreateTaskDto): Prisma.TaskCreateInput => ({
  title: dto.title,
  description: dto.description,
  status: dto.status,
  priority: dto.priority,
  dueDate: dto.dueDate,
  project: { connect: { id: dto.projectId } },
  assignee: dto.assigneeId ? { connect: { id: dto.assigneeId } } : undefined,
  tags: dto.tagIds?.length
    ? { connect: dto.tagIds.map((id) => ({ id })) }
    : undefined,
});

const buildUpdateData = (dto: UpdateTaskDto): Prisma.TaskUpdateInput => ({
  title: dto.title,
  description: dto.description,
  status: dto.status,
  priority: dto.priority,
  dueDate: dto.dueDate,
  assignee: dto.assigneeId !== undefined
    ? dto.assigneeId
      ? { connect: { id: dto.assigneeId } }
      : { disconnect: true }
    : undefined,
  tags: dto.tagIds !== undefined
    ? { set: dto.tagIds.map((id) => ({ id })) }
    : undefined,
});

@Injectable()
export class TasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllPaginated(filter: TaskFilterDto) {
    const { page, perPage } = filter;
    const where = buildWhere(filter);

    return this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        include: TASK_INCLUDE,
        skip: (page - 1) * perPage,
        take: perPage,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.task.count({ where }),
    ]);
  }

  findById(id: string): Promise<TaskWithRelations | null> {
    return this.prisma.task.findUnique({
      where: { id },
      include: TASK_INCLUDE,
    });
  }

  create(dto: CreateTaskDto, client: TxOrBase = this.prisma): Promise<TaskWithRelations> {
    return client.task.create({
      data: buildCreateData(dto),
      include: TASK_INCLUDE,
    });
  }

  update(id: string, dto: UpdateTaskDto, client: TxOrBase = this.prisma): Promise<TaskWithRelations> {
    return client.task.update({
      where: { id },
      data: buildUpdateData(dto),
      include: TASK_INCLUDE,
    });
  }

  delete(id: string, client: TxOrBase = this.prisma): Promise<unknown> {
    return client.task.delete({ where: { id } });
  }
}
