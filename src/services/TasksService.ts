import { google, tasks_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { TextContent, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { Logger } from '../utils/Logger.js';
import { CacheManager } from '../utils/CacheManager.js';

type TasksApiLike = Pick<tasks_v1.Tasks, 'tasklists' | 'tasks'>;

export interface ListTasksOptions {
  showCompleted?: boolean;
  showHidden?: boolean;
  maxResults?: number;
  pageToken?: string;
}

export interface CreateTaskInput {
  title: string;
  notes?: string;
  due?: string;
  parent?: string;
}

export interface UpdateTaskFields {
  title?: string;
  notes?: string;
  due?: string;
  status?: 'needsAction' | 'completed';
}

export interface MoveTaskOptions {
  parent?: string;
  previous?: string;
}

function ok(result: unknown): { content: Array<TextContent> } {
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

function parseArgs<T>(schema: z.ZodType<T>, args: unknown): T {
  const parsed = schema.safeParse(args ?? {});
  if (!parsed.success) {
    throw new McpError(ErrorCode.InvalidParams, parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '));
  }
  return parsed.data;
}

export class TasksService {
  private tasks: TasksApiLike;
  private logger: Logger;
  private cache: CacheManager;
  private accountEmail: string;

  constructor(
    auth: OAuth2Client,
    cache: CacheManager,
    accountEmail: string,
    tasksApi?: TasksApiLike,
  ) {
    this.tasks = tasksApi ?? google.tasks({ version: 'v1', auth });
    this.logger = new Logger('TasksService');
    this.cache = cache;
    this.accountEmail = accountEmail.trim().toLowerCase();
  }

  // ---- Task lists ----

  async listTaskLists(opts: { maxResults?: number; pageToken?: string } = {}): Promise<tasks_v1.Schema$TaskLists> {
    try {
      // Só cacheia a listagem completa (sem paginação) sob a chave fixa que
      // invalidateTaskLists() limpa; queries paginadas passam direto.
      const cacheable = opts.maxResults === undefined && opts.pageToken === undefined;
      if (cacheable) {
        const cached = this.cache.getAccountCache(this.accountEmail, 'tasks:lists');
        if (cached) return cached as tasks_v1.Schema$TaskLists;
      }

      const response = await this.tasks.tasklists.list({
        maxResults: opts.maxResults,
        pageToken: opts.pageToken,
      });
      if (cacheable) this.cache.setAccountCache(this.accountEmail, 'tasks:lists', response.data);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to list task lists:', error);
      throw error;
    }
  }

  private invalidateTaskLists(): void {
    this.cache.deleteAccountCache(this.accountEmail, 'tasks:lists');
  }

  async getTaskList(tasklistId: string): Promise<tasks_v1.Schema$TaskList> {
    try {
      const response = await this.tasks.tasklists.get({ tasklist: tasklistId });
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get task list ${tasklistId}:`, error);
      throw error;
    }
  }

  async createTaskList(title: string): Promise<tasks_v1.Schema$TaskList> {
    try {
      const response = await this.tasks.tasklists.insert({ requestBody: { title } });
      this.invalidateTaskLists();
      return response.data;
    } catch (error) {
      this.logger.error('Failed to create task list:', error);
      throw error;
    }
  }

  async updateTaskList(tasklistId: string, title: string): Promise<tasks_v1.Schema$TaskList> {
    try {
      const response = await this.tasks.tasklists.update({
        tasklist: tasklistId,
        requestBody: { id: tasklistId, title },
      });
      this.invalidateTaskLists();
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to update task list ${tasklistId}:`, error);
      throw error;
    }
  }

  async deleteTaskList(tasklistId: string): Promise<void> {
    try {
      await this.tasks.tasklists.delete({ tasklist: tasklistId });
      this.invalidateTaskLists();
    } catch (error) {
      this.logger.error(`Failed to delete task list ${tasklistId}:`, error);
      throw error;
    }
  }

  // ---- Tasks ----

  async listTasks(tasklistId: string, opts: ListTasksOptions = {}): Promise<tasks_v1.Schema$Tasks> {
    try {
      const response = await this.tasks.tasks.list({
        tasklist: tasklistId,
        showCompleted: opts.showCompleted,
        showHidden: opts.showHidden,
        maxResults: opts.maxResults,
        pageToken: opts.pageToken,
      });
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to list tasks for ${tasklistId}:`, error);
      throw error;
    }
  }

  async getTask(tasklistId: string, taskId: string): Promise<tasks_v1.Schema$Task> {
    try {
      const response = await this.tasks.tasks.get({ tasklist: tasklistId, task: taskId });
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get task ${taskId}:`, error);
      throw error;
    }
  }

  async createTask(tasklistId: string, input: CreateTaskInput): Promise<tasks_v1.Schema$Task> {
    try {
      const response = await this.tasks.tasks.insert({
        tasklist: tasklistId,
        parent: input.parent,
        requestBody: {
          title: input.title,
          notes: input.notes,
          due: input.due,
        },
      });
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to create task in ${tasklistId}:`, error);
      throw error;
    }
  }

  async updateTask(tasklistId: string, taskId: string, fields: UpdateTaskFields): Promise<tasks_v1.Schema$Task> {
    try {
      const response = await this.tasks.tasks.patch({
        tasklist: tasklistId,
        task: taskId,
        requestBody: {
          id: taskId,
          title: fields.title,
          notes: fields.notes,
          due: fields.due,
          status: fields.status,
        },
      });
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to update task ${taskId}:`, error);
      throw error;
    }
  }

  async completeTask(tasklistId: string, taskId: string): Promise<tasks_v1.Schema$Task> {
    return this.updateTask(tasklistId, taskId, { status: 'completed' });
  }

  async moveTask(tasklistId: string, taskId: string, opts: MoveTaskOptions = {}): Promise<tasks_v1.Schema$Task> {
    try {
      const response = await this.tasks.tasks.move({
        tasklist: tasklistId,
        task: taskId,
        parent: opts.parent,
        previous: opts.previous,
      });
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to move task ${taskId}:`, error);
      throw error;
    }
  }

  async deleteTask(tasklistId: string, taskId: string): Promise<void> {
    try {
      await this.tasks.tasks.delete({ tasklist: tasklistId, task: taskId });
    } catch (error) {
      this.logger.error(`Failed to delete task ${taskId}:`, error);
      throw error;
    }
  }

  // ---- MCP handlers ----

  async handleListTaskLists(args: any): Promise<{ content: Array<TextContent> }> {
    const input = parseArgs(
      z.object({ maxResults: z.number().int().positive().optional(), pageToken: z.string().optional() }),
      args,
    );
    return ok(await this.listTaskLists(input));
  }

  async handleGetTaskList(args: any): Promise<{ content: Array<TextContent> }> {
    const input = parseArgs(z.object({ tasklistId: z.string().min(1) }), args);
    return ok(await this.getTaskList(input.tasklistId));
  }

  async handleCreateTaskList(args: any): Promise<{ content: Array<TextContent> }> {
    const input = parseArgs(z.object({ title: z.string().min(1) }), args);
    return ok(await this.createTaskList(input.title));
  }

  async handleUpdateTaskList(args: any): Promise<{ content: Array<TextContent> }> {
    const input = parseArgs(z.object({ tasklistId: z.string().min(1), title: z.string().min(1) }), args);
    return ok(await this.updateTaskList(input.tasklistId, input.title));
  }

  async handleDeleteTaskList(args: any): Promise<{ content: Array<TextContent> }> {
    const input = parseArgs(z.object({ tasklistId: z.string().min(1) }), args);
    await this.deleteTaskList(input.tasklistId);
    return ok({ deleted: input.tasklistId });
  }

  async handleListTasks(args: any): Promise<{ content: Array<TextContent> }> {
    const input = parseArgs(
      z.object({
        tasklistId: z.string().min(1),
        showCompleted: z.boolean().optional(),
        showHidden: z.boolean().optional(),
        maxResults: z.number().int().positive().optional(),
        pageToken: z.string().optional(),
      }),
      args,
    );
    const { tasklistId, ...opts } = input;
    return ok(await this.listTasks(tasklistId, opts));
  }

  async handleGetTask(args: any): Promise<{ content: Array<TextContent> }> {
    const input = parseArgs(z.object({ tasklistId: z.string().min(1), taskId: z.string().min(1) }), args);
    return ok(await this.getTask(input.tasklistId, input.taskId));
  }

  async handleCreateTask(args: any): Promise<{ content: Array<TextContent> }> {
    const input = parseArgs(
      z.object({
        tasklistId: z.string().min(1),
        title: z.string().min(1),
        notes: z.string().optional(),
        due: z.string().optional(),
        parent: z.string().optional(),
      }),
      args,
    );
    const { tasklistId, ...rest } = input;
    return ok(await this.createTask(tasklistId, rest));
  }

  async handleUpdateTask(args: any): Promise<{ content: Array<TextContent> }> {
    const input = parseArgs(
      z.object({
        tasklistId: z.string().min(1),
        taskId: z.string().min(1),
        title: z.string().optional(),
        notes: z.string().optional(),
        due: z.string().optional(),
        status: z.enum(['needsAction', 'completed']).optional(),
      }),
      args,
    );
    const { tasklistId, taskId, ...fields } = input;
    return ok(await this.updateTask(tasklistId, taskId, fields));
  }

  async handleCompleteTask(args: any): Promise<{ content: Array<TextContent> }> {
    const input = parseArgs(z.object({ tasklistId: z.string().min(1), taskId: z.string().min(1) }), args);
    return ok(await this.completeTask(input.tasklistId, input.taskId));
  }

  async handleMoveTask(args: any): Promise<{ content: Array<TextContent> }> {
    const input = parseArgs(
      z.object({
        tasklistId: z.string().min(1),
        taskId: z.string().min(1),
        parent: z.string().optional(),
        previous: z.string().optional(),
      }),
      args,
    );
    const { tasklistId, taskId, ...opts } = input;
    return ok(await this.moveTask(tasklistId, taskId, opts));
  }

  async handleDeleteTask(args: any): Promise<{ content: Array<TextContent> }> {
    const input = parseArgs(z.object({ tasklistId: z.string().min(1), taskId: z.string().min(1) }), args);
    await this.deleteTask(input.tasklistId, input.taskId);
    return ok({ deleted: input.taskId });
  }
}
