import { IsOptional, IsEnum, IsUUID, IsDateString } from 'class-validator';
import { ActivityAction } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ActivityFilterDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsEnum(ActivityAction)
  action?: ActivityAction;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class TaskActivityFilterDto extends PaginationQueryDto {}
