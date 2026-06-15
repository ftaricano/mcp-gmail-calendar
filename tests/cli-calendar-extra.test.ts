import test from 'node:test';
import assert from 'node:assert/strict';
import { createProgram } from '../src/cli/program.js';
import { runCli } from './cli-test-helpers.js';

test('calendar create dry-run builds payload and does not call the service', async () => {
  let calls = 0;
  const result = await runCli(createProgram, [
    '--account',
    'me@example.com',
    '--dry-run',
    'cal',
    'calendars',
    'create',
    '--summary',
    'Project X',
    '--description',
    'Tracking',
    '--timezone',
    'America/Sao_Paulo',
  ], {
    services: {
      calendar: async () => ({
        ...baseFakeCalendar(),
        createCalendar: async () => {
          calls += 1;
          return { id: 'cal-1' };
        },
      }),
    },
  });

  assert.equal(calls, 0);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    dryRun: true,
    would: {
      action: 'calendar.calendars.create',
      payload: { summary: 'Project X', description: 'Tracking', timeZone: 'America/Sao_Paulo' },
    },
  });
});

test('calendar create wires summary/description/timezone to the service', async () => {
  let received: unknown;
  const result = await runCli(createProgram, [
    '--account',
    'me@example.com',
    'cal',
    'calendars',
    'create',
    '--summary',
    'Project X',
    '--timezone',
    'UTC',
  ], {
    services: {
      calendar: async () => ({
        ...baseFakeCalendar(),
        createCalendar: async (summary: string, opts?: { description?: string; timeZone?: string }) => {
          received = { summary, opts };
          return { id: 'cal-9', summary };
        },
      }),
    },
  });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(received, { summary: 'Project X', opts: { description: undefined, timeZone: 'UTC' } });
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    calendar: { id: 'cal-9', summary: 'Project X' },
  });
});

test('calendar delete dry-run does not call the service', async () => {
  let calls = 0;
  const result = await runCli(createProgram, [
    '--account',
    'me@example.com',
    '--dry-run',
    'cal',
    'calendars',
    'delete',
    'cal-to-remove',
  ], {
    services: {
      calendar: async () => ({
        ...baseFakeCalendar(),
        deleteCalendar: async () => {
          calls += 1;
        },
      }),
    },
  });

  assert.equal(calls, 0);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    dryRun: true,
    would: { action: 'calendar.calendars.delete', calendarId: 'cal-to-remove' },
  });
});

test('events instances lists occurrences of a recurring event', async () => {
  let received: unknown;
  const result = await runCli(createProgram, [
    '--account',
    'me@example.com',
    'cal',
    'events',
    'instances',
    'evt-recur',
    '--from',
    '2026-01-01T00:00:00Z',
    '--to',
    '2026-01-31T00:00:00Z',
    '--limit',
    '5',
  ], {
    services: {
      calendar: async () => ({
        ...baseFakeCalendar(),
        getEventInstances: async (calendarId: string, eventId: string, opts?: unknown) => {
          received = { calendarId, eventId, opts };
          return [{ id: `${eventId}_1`, summary: 'Occurrence', start: {}, end: {} }];
        },
      }),
    },
  });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(received, {
    calendarId: 'primary',
    eventId: 'evt-recur',
    opts: { timeMin: '2026-01-01T00:00:00Z', timeMax: '2026-01-31T00:00:00Z', maxResults: 5 },
  });
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    items: [{ id: 'evt-recur_1', summary: 'Occurrence', start: {}, end: {} }],
  });
});

function baseFakeCalendar() {
  return {
    listCalendars: async () => [],
    listEvents: async () => [],
    getUpcomingEvents: async () => [],
    getEvent: async () => ({ summary: 'x', start: {}, end: {} }),
    createEvent: async (event: unknown) => event,
    updateEvent: async (_calendarId: string, eventId: string, updates: object) => ({ id: eventId, summary: 'u', start: {}, end: {}, ...updates }),
    deleteEvent: async () => undefined,
    getFreeBusy: async () => ({}),
    respondToInvitation: async (_calendarId: string, eventId: string, response: string) => ({ id: eventId, summary: response, start: {}, end: {} }),
    quickAddEvent: async (_calendarId: string, text: string) => ({ summary: text, start: {}, end: {} }),
    searchEvents: async () => [],
    addConferenceToEvent: async (_calendarId: string, eventId: string) => ({ id: eventId, summary: 'Conference', start: {}, end: {} }),
    getEventInstances: async (_calendarId: string, eventId: string) => [{ id: `${eventId}_1`, summary: 'Instance', start: {}, end: {} }],
    createCalendar: async (summary: string) => ({ id: 'cal-1', summary }),
    deleteCalendar: async () => undefined,
  };
}
