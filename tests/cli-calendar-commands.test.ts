import test from 'node:test';
import assert from 'node:assert/strict';
import { createProgram } from '../src/cli/program.js';
import { runCli } from './cli-test-helpers.js';

test('calendar create dry-run builds payload from flags and config timezone', async () => {
  const result = await runCli(createProgram, [
    '--account',
    'me@example.com',
    '--dry-run',
    'cal',
    'events',
    'create',
    '--summary',
    'Planning',
    '--start',
    '2026-05-01T10:00:00',
    '--end',
    '2026-05-01T11:00:00',
    '--attendee',
    'a@example.com',
    '--attendee',
    'b@example.com',
    '--meet',
  ], {
    config: { timezone: 'America/Sao_Paulo' },
  });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    dryRun: true,
    would: {
      action: 'calendar.events.create',
      calendarId: 'primary',
      payload: {
        summary: 'Planning',
        start: { dateTime: '2026-05-01T10:00:00', timeZone: 'America/Sao_Paulo' },
        end: { dateTime: '2026-05-01T11:00:00', timeZone: 'America/Sao_Paulo' },
        attendees: [{ email: 'a@example.com' }, { email: 'b@example.com' }],
        conferenceData: {
          createRequest: {
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      },
    },
  });
});

test('calendar freebusy uses repeated calendars and configured timezone', async () => {
  let query: unknown;
  const result = await runCli(createProgram, [
    '--account',
    'me@example.com',
    'cal',
    'freebusy',
    '--from',
    '2026-05-01T00:00:00Z',
    '--to',
    '2026-05-01T23:59:59Z',
    '--calendar',
    'primary',
    '--calendar',
    'team@example.com',
  ], {
    config: { timezone: 'UTC' },
    services: {
      calendar: async () => ({
        listCalendars: async () => [],
        listEvents: async () => [],
        getUpcomingEvents: async () => [],
        getEvent: async () => ({ summary: 'x', start: {}, end: {} }),
        createEvent: async (event) => event,
        updateEvent: async (_calendarId, eventId, updates) => ({ id: eventId, summary: 'u', start: {}, end: {}, ...updates }),
        deleteEvent: async () => undefined,
        getFreeBusy: async (input) => {
          query = input;
          return { calendars: {}, timeMin: input.timeMin, timeMax: input.timeMax };
        },
        respondToInvitation: async (_calendarId, eventId, response) => ({ id: eventId, summary: response, start: {}, end: {} }),
        quickAddEvent: async (_calendarId, text) => ({ summary: text, start: {}, end: {} }),
        searchEvents: async () => [],
        addConferenceToEvent: async (_calendarId, eventId) => ({ id: eventId, summary: 'Conference', start: {}, end: {} }),
        getEventInstances: async (_calendarId, eventId) => [{ id: `${eventId}_1`, summary: 'Instance', start: {}, end: {} }],
        createCalendar: async (summary) => ({ id: 'cal-1', summary }),
        deleteCalendar: async () => undefined,
      }),
    },
  });

  assert.deepEqual(query, {
    timeMin: '2026-05-01T00:00:00Z',
    timeMax: '2026-05-01T23:59:59Z',
    timeZone: 'UTC',
    items: [{ id: 'primary' }, { id: 'team@example.com' }],
  });
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    freeBusy: {
      calendars: {},
      timeMin: '2026-05-01T00:00:00Z',
      timeMax: '2026-05-01T23:59:59Z',
    },
  });
});


test('calendar respond dry-run validates response without calling service', async () => {
  let calls = 0;
  const result = await runCli(createProgram, [
    '--account',
    'me@example.com',
    '--dry-run',
    'cal',
    'events',
    'respond',
    'evt-1',
    '--response',
    'accepted',
    '--comment',
    'ok',
  ], {
    services: {
      calendar: async () => ({
        listCalendars: async () => [],
        listEvents: async () => [],
        getUpcomingEvents: async () => [],
        getEvent: async () => ({ summary: 'x', start: {}, end: {} }),
        createEvent: async (event) => event,
        updateEvent: async (_calendarId, eventId, updates) => ({ id: eventId, summary: 'u', start: {}, end: {}, ...updates }),
        deleteEvent: async () => undefined,
        getFreeBusy: async () => ({}),
        respondToInvitation: async () => {
          calls += 1;
          return { summary: 'called', start: {}, end: {} };
        },
        quickAddEvent: async (_calendarId, text) => ({ summary: text, start: {}, end: {} }),
        searchEvents: async () => [],
        addConferenceToEvent: async (_calendarId, eventId) => ({ id: eventId, summary: 'Conference', start: {}, end: {} }),
        getEventInstances: async (_calendarId, eventId) => [{ id: `${eventId}_1`, summary: 'Instance', start: {}, end: {} }],
        createCalendar: async (summary) => ({ id: 'cal-1', summary }),
        deleteCalendar: async () => undefined,
      }),
    },
  });

  assert.equal(calls, 0);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    dryRun: true,
    would: {
      action: 'calendar.events.respond',
      calendarId: 'primary',
      eventId: 'evt-1',
      response: 'accepted',
      comment: 'ok',
    },
  });
});

test('calendar search and conference commands are wired to calendar service', async () => {
  const calls: unknown[] = [];
  const services = {
    calendar: async () => ({
      listCalendars: async () => [],
      listEvents: async () => [],
      getUpcomingEvents: async () => [],
      getEvent: async () => ({ summary: 'x', start: {}, end: {} }),
      createEvent: async (event) => event,
      updateEvent: async (_calendarId: string, eventId: string, updates: object) => ({ id: eventId, summary: 'u', start: {}, end: {}, ...updates }),
      deleteEvent: async () => undefined,
      getFreeBusy: async () => ({}),
      respondToInvitation: async (_calendarId: string, eventId: string, response: 'accepted' | 'declined' | 'tentative' | 'needsAction') => ({ id: eventId, summary: response, start: {}, end: {} }),
      quickAddEvent: async (_calendarId: string, text: string) => ({ summary: text, start: {}, end: {} }),
      searchEvents: async (query: string, options: unknown) => {
        calls.push({ kind: 'search', query, options });
        return [{ id: 'evt-search', summary: query, start: {}, end: {} }];
      },
      addConferenceToEvent: async (calendarId: string, eventId: string, conferenceType: 'hangoutsMeet' | 'addOn') => {
        calls.push({ kind: 'conference', calendarId, eventId, conferenceType });
        return { id: eventId, summary: conferenceType, start: {}, end: {} };
      },
      getEventInstances: async (_calendarId: string, eventId: string) => [{ id: `${eventId}_1`, summary: 'Instance', start: {}, end: {} }],
      createCalendar: async (summary: string) => ({ id: 'cal-1', summary }),
      deleteCalendar: async () => undefined,
    }),
  };

  const search = await runCli(createProgram, ['--account', 'me@example.com', 'cal', 'events', 'search', 'planning', '--limit', '3'], { services });
  const conference = await runCli(createProgram, ['--account', 'me@example.com', 'cal', 'events', 'conference', 'evt-2', '--type', 'hangoutsMeet'], { services });

  assert.equal(search.exitCode, 0);
  assert.equal(conference.exitCode, 0);
  assert.deepEqual(calls, [
    { kind: 'search', query: 'planning', options: { calendarId: 'primary', maxResults: 3 } },
    { kind: 'conference', calendarId: 'primary', eventId: 'evt-2', conferenceType: 'hangoutsMeet' },
  ]);
});
