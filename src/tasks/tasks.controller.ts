import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskFilterDto } from './dto/task-filter.dto';
import { TaskActivityFilterDto } from '../activities/dto/activity-filter.dto';
import { UserRequiredGuard } from '../common/guards/user-required.guard';

@ApiTags('tasks')
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  findAll(@Query() filterDto: TaskFilterDto) {
    return this.tasksService.findAll(filterDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tasksService.findOne(id);
  }

  @Get(':id/activities')
  findActivities(
    @Param('id') id: string,
    @Query() filter: TaskActivityFilterDto,
  ) {
    return this.tasksService.findActivities(id, filter);
  }

  @Post()
  @UseGuards(UserRequiredGuard)
  @ApiSecurity('user-id')
  create(@Body() createTaskDto: CreateTaskDto) {
    return this.tasksService.create(createTaskDto);
  }

  @Put(':id')
  @UseGuards(UserRequiredGuard)
  @ApiSecurity('user-id')
  update(@Param('id') id: string, @Body() updateTaskDto: UpdateTaskDto) {
    return this.tasksService.update(id, updateTaskDto);
  }

  @Delete(':id')
  @UseGuards(UserRequiredGuard)
  @ApiSecurity('user-id')
  remove(@Param('id') id: string) {
    return this.tasksService.remove(id);
  }
}
