import test from 'node:test';
import assert from 'node:assert/strict';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { TasksService } from '../src/services/TasksService.js';
import { CacheManager } from '../src/utils/CacheManager.js';

interface Captured {
  taskListInsert?: unknown;
  taskListUpdate?: unknown;
  taskListDelete?: unknown;
  taskInsert?: unknown;
  taskPatch?: unknown;
  taskMove?: unknown;
  taskDelete?: unknown;
}

function makeService(captured: Captured = {}): TasksService {
  return new TasksService({} as never, new CacheManager(), 'me@example.com', {
    tasklists: {
      list: async () => ({ data: { items: [{ id: 'list-1', title: 'My Tasks' }] } }),
      get: async (input: unknown) => ({ data: { id: (input as { tasklist: string }).tasklist, title: 'My Tasks' } }),
      insert: async (input: unknown) => {
        captured.taskListInsert = input;
        return { data: { id: 'list-new', title: 'New' } };
      },
      update: async (input: unknown) => {
        captured.taskListUpdate = input;
        return { data: { id: 'list-1', title: 'Renamed' } };
      },
      delete: async (input: unknown) => {
        captured.taskListDelete = input;
        return { data: {} };
      },
    } as never,
    tasks: {
      list: async () => ({ data: { items: [{ id: 'task-1', title: 'Do thing' }] } }),
      get: async (input: unknown) => ({ data: { id: (input as { task: string }).task, title: 'Do thing' } }),
      insert: async (input: unknown) => {
        captured.taskInsert = input;
        return { data: { id: 'task-new', title: 'Created' } };
      },
      patch: async (input: unknown) => {
        captured.taskPatch = input;
        return { data: { id: 'task-1', ...(input as { requestBody: object }).requestBody } };
      },
      move: async (input: unknown) => {
        captured.taskMove = input;
        return { data: { id: 'task-1', moved: true } };
      },
      delete: async (input: unknown) => {
        captured.taskDelete = input;
        return { data: {} };
      },
    } as never,
  });
}

test('createTaskList forwards title in requestBody', async () => {
  const captured: Captured = {};
  const service = makeService(captured);
  await service.createTaskList('Groceries');
  assert.deepEqual(captured.taskListInsert, { requestBody: { title: 'Groceries' } });
});

test('updateTaskList forwards tasklist id and title', async () => {
  const captured: Captured = {};
  const service = makeService(captured);
  await service.updateTaskList('list-1', 'Renamed');
  assert.deepEqual(captured.taskListUpdate, {
    tasklist: 'list-1',
    requestBody: { id: 'list-1', title: 'Renamed' },
  });
});

test('deleteTaskList forwards tasklist id', async () => {
  const captured: Captured = {};
  const service = makeService(captured);
  await service.deleteTaskList('list-1');
  assert.deepEqual(captured.taskListDelete, { tasklist: 'list-1' });
});

test('createTask forwards title, notes, due and parent', async () => {
  const captured: Captured = {};
  const service = makeService(captured);
  await service.createTask('list-1', { title: 'Buy milk', notes: 'whole', due: '2026-06-20T00:00:00Z', parent: 'task-0' });
  assert.deepEqual(captured.taskInsert, {
    tasklist: 'list-1',
    parent: 'task-0',
    requestBody: { title: 'Buy milk', notes: 'whole', due: '2026-06-20T00:00:00Z' },
  });
});

test('updateTask forwards patch requestBody', async () => {
  const captured: Captured = {};
  const service = makeService(captured);
  await service.updateTask('list-1', 'task-1', { title: 'New title', status: 'needsAction' });
  assert.deepEqual(captured.taskPatch, {
    tasklist: 'list-1',
    task: 'task-1',
    requestBody: { id: 'task-1', title: 'New title', notes: undefined, due: undefined, status: 'needsAction' },
  });
});

test('completeTask patches status to completed', async () => {
  const captured: Captured = {};
  const service = makeService(captured);
  await service.completeTask('list-1', 'task-1');
  const patch = captured.taskPatch as { requestBody: { status: string } };
  assert.equal(patch.requestBody.status, 'completed');
});

test('moveTask forwards parent and previous', async () => {
  const captured: Captured = {};
  const service = makeService(captured);
  await service.moveTask('list-1', 'task-1', { parent: 'task-0', previous: 'task-2' });
  assert.deepEqual(captured.taskMove, {
    tasklist: 'list-1',
    task: 'task-1',
    parent: 'task-0',
    previous: 'task-2',
  });
});

test('deleteTask forwards tasklist and task ids', async () => {
  const captured: Captured = {};
  const service = makeService(captured);
  await service.deleteTask('list-1', 'task-1');
  assert.deepEqual(captured.taskDelete, { tasklist: 'list-1', task: 'task-1' });
});

test('handleCreateTask rejects missing title with McpError', async () => {
  const service = makeService();
  await assert.rejects(
    () => service.handleCreateTask({ tasklistId: 'list-1' }),
    (err: unknown) => err instanceof McpError,
  );
});

test('handleCreateTask happy path returns json content', async () => {
  const captured: Captured = {};
  const service = makeService(captured);
  const result = await service.handleCreateTask({ tasklistId: 'list-1', title: 'Created' });
  assert.equal(result.content[0].type, 'text');
  const payload = JSON.parse(result.content[0].text);
  assert.equal(payload.id, 'task-new');
});

test('listTaskLists caches the unpaginated listing and invalidates on tasklist mutation', async () => {
  let listCalls = 0;
  const service = new TasksService({} as never, new CacheManager(), 'me@example.com', {
    tasklists: {
      list: async () => { listCalls += 1; return { data: { items: [{ id: 'l1' }] } }; },
      insert: async () => ({ data: { id: 'l2', title: 'X' } }),
    } as never,
    tasks: {} as never,
  });

  await service.listTaskLists();
  await service.listTaskLists();
  assert.equal(listCalls, 1, 'second call should be served from cache');

  await service.createTaskList('X'); // invalidates tasks:lists
  await service.listTaskLists();
  assert.equal(listCalls, 2, 'cache should be refreshed after a mutation');
});
