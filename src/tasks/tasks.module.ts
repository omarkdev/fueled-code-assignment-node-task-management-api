import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TasksRepository } from './tasks.repository';
import { EmailModule } from '../email/email.module';
import { ActivitiesModule } from '../activities/activities.module';

@Module({
  imports: [EmailModule, ActivitiesModule],
  controllers: [TasksController],
  providers: [TasksService, TasksRepository],
})
export class TasksModule {}
