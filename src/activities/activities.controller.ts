import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ActivitiesService } from './activities.service';
import { ActivityFilterDto } from './dto/activity-filter.dto';

@ApiTags('activities')
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Get()
  findAll(@Query() filter: ActivityFilterDto) {
    return this.activitiesService.findAll(filter);
  }
}
