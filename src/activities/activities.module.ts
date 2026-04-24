import { Module } from '@nestjs/common';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';
import { ActivityListener } from './activity.listener';

@Module({
  controllers: [ActivitiesController],
  providers: [ActivitiesService, ActivityListener],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
