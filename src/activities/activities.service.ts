import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityFilterDto, TaskActivityFilterDto } from './dto/activity-filter.dto';
import {
  ACTIVITY_INCLUDE,
  ActivityResponse,
  toActivityResponse,
} from './dto/activity-response.dto';
import { paginated, Paginated } from '../common/dto/paginated';

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filter: ActivityFilterDto): Promise<Paginated<ActivityResponse>> {
    const { page, perPage, dateFrom, dateTo, userId, action } = filter;

    const where: Prisma.ActivityWhereInput = {
      userId,
      action,
      createdAt: dateFrom || dateTo ? {
        gte: dateFrom ? new Date(dateFrom) : undefined,
        lte: dateTo ? new Date(dateTo) : undefined,
      } : undefined,
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.activity.findMany({
        where,
        include: ACTIVITY_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.activity.count({ where }),
    ]);

    return paginated(rows.map(toActivityResponse), total, page, perPage);
  }

  async findByTask(
    taskId: string,
    filter: TaskActivityFilterDto,
  ): Promise<Paginated<ActivityResponse>> {
    const { page, perPage } = filter;
    const where: Prisma.ActivityWhereInput = { taskId };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.activity.findMany({
        where,
        include: ACTIVITY_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.activity.count({ where }),
    ]);

    return paginated(rows.map(toActivityResponse), total, page, perPage);
  }
}
