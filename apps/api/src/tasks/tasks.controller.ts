import {
  Controller,
  Body,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUser as CurrentUserData } from '../auth/auth.types';
import { TaskQueryDto } from './dto/task-query.dto';
import { TaskCreateDto } from './dto/task-create.dto';
import { TasksService } from './tasks.service';

@Controller('tasks')
@UseGuards(AuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  create(
    @CurrentUser() currentUser: CurrentUserData,
    @Body() taskDto: TaskCreateDto,
  ) {
    return this.tasksService.create(currentUser, taskDto);
  }

  @Get()
  findAll(
    @CurrentUser() currentUser: CurrentUserData,
    @Query() query: TaskQueryDto,
  ) {
    return this.tasksService.findAll(currentUser, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() currentUser: CurrentUserData,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.tasksService.findOne(currentUser, id);
  }
}
