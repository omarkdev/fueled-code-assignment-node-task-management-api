import { IsOptional, IsEnum, IsUUID, IsDateString } from 'class-validator';
import { TaskStatus, TaskPriority } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class TaskFilterDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsDateString()
  dueDateFrom?: string;

  @IsOptional()
  @IsDateString()
  dueDateTo?: string;
}
