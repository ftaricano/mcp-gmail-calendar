import test from 'node:test';
import assert from 'node:assert/strict';
import { CalendarService } from '../src/services/CalendarService.js';
import { CacheManager } from '../src/utils/CacheManager.js';

function makeFakeCalendarApi(rawEvent: unknown, capture: { patch?: unknown }) {
  return {
    events: {
      get: async () => ({ data: rawEvent }),
      patch: async (input: unknown) => {
        capture.patch = input;
        return { data: rawEvent };
      },
    },
    calendarList: {},
    calendars: {},
    freebusy: {},
  };
}

test('respondToInvitation changes responseStatus only on the self attendee (by self:true)', async () => {
  const capture: { patch?: any } = {};
  const rawEvent = {
    id: 'evt-1',
    summary: 'Team sync',
    start: {},
    end: {},
    attendees: [
      { email: 'me@example.com', self: true, responseStatus: 'needsAction' },
      { email: 'alice@example.com', responseStatus: 'accepted' },
      { email: 'bob@example.com', responseStatus: 'declined' },
    ],
  };
  const api = makeFakeCalendarApi(rawEvent, capture);
  const service = new CalendarService({} as never, new CacheManager(), 'me@example.com', api as never);

  await service.respondToInvitation('primary', 'evt-1', 'accepted', 'See you there');

  const attendees = capture.patch.requestBody.attendees as Array<Record<string, unknown>>;
  assert.equal(attendees.length, 3);
  // Self attendee changed
  assert.equal(attendees[0].email, 'me@example.com');
  assert.equal(attendees[0].responseStatus, 'accepted');
  assert.equal(attendees[0].comment, 'See you there');
  // Other attendees untouched
  assert.equal(attendees[1].email, 'alice@example.com');
  assert.equal(attendees[1].responseStatus, 'accepted');
  assert.equal(attendees[1].comment, undefined);
  assert.equal(attendees[2].email, 'bob@example.com');
  assert.equal(attendees[2].responseStatus, 'declined');
  assert.equal(attendees[2].comment, undefined);
});

test('respondToInvitation identifies self by matching account email when self flag is absent', async () => {
  const capture: { patch?: any } = {};
  const rawEvent = {
    id: 'evt-2',
    summary: 'Planning',
    start: {},
    end: {},
    attendees: [
      { email: 'other@example.com', responseStatus: 'accepted' },
      { email: 'ME@Example.com', responseStatus: 'needsAction' },
    ],
  };
  const api = makeFakeCalendarApi(rawEvent, capture);
  const service = new CalendarService({} as never, new CacheManager(), 'me@example.com', api as never);

  await service.respondToInvitation('primary', 'evt-2', 'declined');

  const attendees = capture.patch.requestBody.attendees as Array<Record<string, unknown>>;
  assert.equal(attendees[0].email, 'other@example.com');
  assert.equal(attendees[0].responseStatus, 'accepted');
  assert.equal(attendees[1].email, 'ME@Example.com');
  assert.equal(attendees[1].responseStatus, 'declined');
});

test('respondToInvitation throws when the account is not an attendee', async () => {
  const capture: { patch?: any } = {};
  const rawEvent = {
    id: 'evt-3',
    summary: 'Not mine',
    start: {},
    end: {},
    attendees: [
      { email: 'someone@example.com', responseStatus: 'accepted' },
    ],
  };
  const api = makeFakeCalendarApi(rawEvent, capture);
  const service = new CalendarService({} as never, new CacheManager(), 'me@example.com', api as never);

  await assert.rejects(
    () => service.respondToInvitation('primary', 'evt-3', 'accepted'),
    /not an attendee/,
  );
  assert.equal(capture.patch, undefined);
});

test('createCalendar forwards summary/description/timeZone to calendars.insert', async () => {
  let request: any;
  const api = {
    events: {},
    calendarList: {},
    calendars: {
      insert: async (input: unknown) => {
        request = input;
        return { data: { id: 'cal-9', summary: 'Project X' } };
      },
      delete: async () => ({}),
    },
    freebusy: {},
  };
  const service = new CalendarService({} as never, new CacheManager(), 'me@example.com', api as never);

  const result = await service.createCalendar('Project X', { description: 'desc', timeZone: 'America/Sao_Paulo' });
  assert.deepEqual(result, { id: 'cal-9', summary: 'Project X' });
  assert.deepEqual(request.requestBody, { summary: 'Project X', description: 'desc', timeZone: 'America/Sao_Paulo' });
});

test('getEventInstances maps instances through formatEvent', async () => {
  const api = {
    events: {
      instances: async () => ({
        data: {
          items: [
            { id: 'evt_20260101', summary: 'Daily', start: { dateTime: '2026-01-01T09:00:00Z' }, end: {} },
            { id: 'evt_20260102', summary: 'Daily', start: { dateTime: '2026-01-02T09:00:00Z' }, end: {} },
          ],
        },
      }),
    },
    calendarList: {},
    calendars: {},
    freebusy: {},
  };
  const service = new CalendarService({} as never, new CacheManager(), 'me@example.com', api as never);

  const instances = await service.getEventInstances('primary', 'evt', { maxResults: 10 });
  assert.equal(instances.length, 2);
  assert.equal(instances[0].id, 'evt_20260101');
  assert.equal(instances[1].id, 'evt_20260102');
});
