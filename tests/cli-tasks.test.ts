import test from 'node:test';
import assert from 'node:assert/strict';
import { createProgram } from '../src/cli/program.js';
import type { TasksServiceLike } from '../src/cli/program.js';
import { runCli } from './cli-test-helpers.js';

function spyTasks(calls: string[]): TasksServiceLike {
  return {
    listTaskLists: async () => {
      calls.push('listTaskLists');
      return { items: [{ id: 'list-1', title: 'My Tasks' }] };
    },
    getTaskList: async (id: string) => {
      calls.push('getTaskList');
      return { id, title: 'My Tasks' };
    },
    createTaskList: async () => {
      calls.push('createTaskList');
      return { id: 'list-new' };
    },
    updateTaskList: async () => {
      calls.push('updateTaskList');
      return { id: 'list-1' };
    },
    deleteTaskList: async () => {
      calls.push('deleteTaskList');
    },
    listTasks: async () => {
      calls.push('listTasks');
      return { items: [{ id: 'task-1', title: 'Do thing' }] };
    },
    getTask: async () => {
      calls.push('getTask');
      return { id: 'task-1' };
    },
    createTask: async () => {
      calls.push('createTask');
      return { id: 'task-new' };
    },
    updateTask: async () => {
      calls.push('updateTask');
      return { id: 'task-1' };
    },
    completeTask: async () => {
      calls.push('completeTask');
      return { id: 'task-1', status: 'completed' };
    },
    moveTask: async () => {
      calls.push('moveTask');
      return { id: 'task-1' };
    },
    deleteTask: async () => {
      calls.push('deleteTask');
    },
  };
}

test('tasks lists create dry-run does not call the service', async () => {
  const calls: string[] = [];
  const result = await runCli(createProgram, [
    '--account', 'me@example.com', '--dry-run',
    'tasks', 'lists', 'create', '--title', 'Groceries',
  ], { services: { tasks: async () => spyTasks(calls) } });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    dryRun: true,
    would: { action: 'tasks.lists.create', title: 'Groceries' },
  });
  assert.deepEqual(calls, []);
});

test('tasks create dry-run builds payload and skips service', async () => {
  const calls: string[] = [];
  const result = await runCli(createProgram, [
    '--account', 'me@example.com', '--dry-run',
    'tasks', 'create', 'list-1', '--title', 'Buy milk', '--notes', 'whole', '--due', '2026-06-20T00:00:00Z',
  ], { services: { tasks: async () => spyTasks(calls) } });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    dryRun: true,
    would: {
      action: 'tasks.create',
      tasklistId: 'list-1',
      payload: { title: 'Buy milk', notes: 'whole', due: '2026-06-20T00:00:00Z' },
    },
  });
  assert.deepEqual(calls, []);
});

test('tasks complete dry-run does not call the service', async () => {
  const calls: string[] = [];
  const result = await runCli(createProgram, [
    '--account', 'me@example.com', '--dry-run',
    'tasks', 'complete', 'list-1', 'task-1',
  ], { services: { tasks: async () => spyTasks(calls) } });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    dryRun: true,
    would: { action: 'tasks.complete', tasklistId: 'list-1', taskId: 'task-1' },
  });
  assert.deepEqual(calls, []);
});

test('tasks list read happy path calls the service', async () => {
  const calls: string[] = [];
  const result = await runCli(createProgram, [
    '--account', 'me@example.com',
    'tasks', 'list', 'list-1',
  ], { services: { tasks: async () => spyTasks(calls) } });

  assert.equal(result.exitCode, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.account, 'me@example.com');
  assert.deepEqual(payload.result, { items: [{ id: 'task-1', title: 'Do thing' }] });
  assert.deepEqual(calls, ['listTasks']);
});
