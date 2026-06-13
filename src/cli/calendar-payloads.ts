import type { CalendarEvent, FreeBusyQuery } from '../services/CalendarService.js';
import { ValidationCliError } from './errors.js';
import { parseEmailList, parseStructuredJsonInput } from './parsers.js';

export interface CalendarEventOptions {
  json?: string;
  jsonFile?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: string;
  end?: string;
  attendee?: string[];
  meet?: boolean;
  timezone?: string;
}

export function buildConferencePreview(): NonNullable<CalendarEvent['conferenceData']> {
  return {
    createRequest: {
      conferenceSolutionKey: {
        type: 'hangoutsMeet',
      },
    },
  };
}

export function materializeConferenceRequest(
  conferenceData: CalendarEvent['conferenceData'],
  now: () => number,
): CalendarEvent['conferenceData'] {
  if (!conferenceData?.createRequest) return conferenceData;
  return {
    ...conferenceData,
    createRequest: {
      requestId: `conf_${now()}`,
      ...conferenceData.createRequest,
    },
  };
}

export async function buildCalendarEventPayload(
  options: CalendarEventOptions,
  defaultTimeZone: string,
  readStdin: () => Promise<string>,
): Promise<CalendarEvent> {
  const fromJson = (await parseStructuredJsonInput<Partial<CalendarEvent>>(
    {
      json: options.json,
      jsonFile: options.jsonFile,
      readStdin,
    },
    'event payload',
  )) ?? {};

  const event: CalendarEvent = {
    summary: fromJson.summary || '',
    description: fromJson.description,
    location: fromJson.location,
    start: fromJson.start ?? {},
    end: fromJson.end ?? {},
    attendees: fromJson.attendees,
    reminders: fromJson.reminders,
    recurrence: fromJson.recurrence,
    colorId: fromJson.colorId,
    visibility: fromJson.visibility,
    conferenceData: fromJson.conferenceData,
    attachments: fromJson.attachments,
  };

  if (options.summary !== undefined) event.summary = options.summary;
  if (options.description !== undefined) event.description = options.description;
  if (options.location !== undefined) event.location = options.location;
  if (options.start !== undefined) {
    event.start = {
      ...event.start,
      dateTime: options.start,
      timeZone: options.timezone ?? event.start.timeZone ?? defaultTimeZone,
    };
  }
  if (options.end !== undefined) {
    event.end = {
      ...event.end,
      dateTime: options.end,
      timeZone: options.timezone ?? event.end.timeZone ?? defaultTimeZone,
    };
  }

  const attendees = options.attendee?.flatMap((value) => parseEmailList(value)) ?? [];
  if (attendees.length > 0) {
    event.attendees = attendees.map((email) => ({ email }));
  }

  if (options.meet) {
    event.conferenceData = buildConferencePreview();
  }

  return event;
}

export function ensureCreatableEvent(event: CalendarEvent): void {
  if (!event.summary?.trim()) throw new ValidationCliError('Event summary is required.');
  if (!event.start?.dateTime && !event.start?.date) throw new ValidationCliError('Event start is required.');
  if (!event.end?.dateTime && !event.end?.date) throw new ValidationCliError('Event end is required.');
}

export function buildFreeBusyPayload(
  timeMin: string,
  timeMax: string,
  calendars: string[],
  timeZone: string,
): FreeBusyQuery {
  if (!timeMin || !timeMax) throw new ValidationCliError('Both --from and --to are required.');
  if (calendars.length === 0) throw new ValidationCliError('At least one --calendar is required.');

  return {
    timeMin,
    timeMax,
    timeZone,
    items: calendars.map((id) => ({ id })),
  };
}
