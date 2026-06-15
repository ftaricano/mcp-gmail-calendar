import { calendar_v3, google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { TextContent, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../utils/Logger.js';
import { CacheManager } from '../utils/CacheManager.js';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);
dayjs.extend(timezone);

export interface CalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted';
    optional?: boolean;
    organizer?: boolean;
    self?: boolean;
  }>;
  reminders?: {
    useDefault?: boolean;
    overrides?: Array<{
      method: 'email' | 'popup';
      minutes: number;
    }>;
  };
  recurrence?: string[];
  colorId?: string;
  visibility?: 'default' | 'public' | 'private' | 'confidential';
  conferenceData?: any;
  attachments?: Array<{
    fileUrl: string;
    title?: string;
    mimeType?: string;
  }>;
}

export interface ListEventsOptions {
  calendarId?: string;
  maxResults?: number;
  pageToken?: string;
  timeMin?: string;
  timeMax?: string;
  showDeleted?: boolean;
  singleEvents?: boolean;
  orderBy?: 'startTime' | 'updated';
  q?: string;
}

export interface FreeBusyQuery {
  timeMin: string;
  timeMax: string;
  timeZone?: string;
  items: Array<{ id: string }>;
}

type CalendarApiLike = Pick<calendar_v3.Calendar, 'events' | 'calendarList' | 'calendars' | 'freebusy'>;

export class CalendarService {
  private calendar: CalendarApiLike;
  private logger: Logger;
  private cache: CacheManager;
  private defaultTimeZone: string;
  private accountEmail: string;

  constructor(
    auth: OAuth2Client,
    cache: CacheManager,
    accountEmail: string,
    calendarApi?: CalendarApiLike,
  ) {
    this.calendar = calendarApi ?? google.calendar({ version: 'v3', auth });
    this.logger = new Logger('CalendarService');
    this.cache = cache;
    this.defaultTimeZone = process.env.DEFAULT_CALENDAR_TIMEZONE || 'America/New_York';
    this.accountEmail = accountEmail.trim().toLowerCase();
  }

  async listCalendars(): Promise<any[]> {
    try {
      const cacheKey = 'calendar:list';
      const cached = this.cache.getAccountCache(this.accountEmail, cacheKey);
      if (cached) return cached;

      const response = await this.calendar.calendarList.list();
      const calendars = response.data.items || [];
      
      this.cache.setAccountCache(this.accountEmail, cacheKey, calendars);
      return calendars;
    } catch (error) {
      this.logger.error('Failed to list calendars:', error);
      throw error;
    }
  }

  async listEvents(options: ListEventsOptions = {}): Promise<CalendarEvent[]> {
    try {
      const {
        calendarId = 'primary',
        maxResults = parseInt(process.env.MAX_CALENDAR_EVENTS || '100'),
        pageToken,
        timeMin = dayjs().startOf('day').toISOString(),
        timeMax,
        showDeleted = false,
        singleEvents = true,
        orderBy = 'startTime',
        q,
      } = options;

      const response = await this.calendar.events.list({
        calendarId,
        maxResults,
        pageToken,
        timeMin,
        timeMax,
        showDeleted,
        singleEvents,
        orderBy,
        q,
      });

      const events = response.data.items || [];
      return events.map(this.formatEvent);
    } catch (error) {
      this.logger.error('Failed to list events:', error);
      throw error;
    }
  }

  async getEvent(calendarId: string, eventId: string): Promise<CalendarEvent> {
    try {
      const response = await this.calendar.events.get({
        calendarId: calendarId || 'primary',
        eventId,
      });

      return this.formatEvent(response.data);
    } catch (error) {
      this.logger.error(`Failed to get event ${eventId}:`, error);
      throw error;
    }
  }

  async createEvent(event: CalendarEvent, calendarId: string = 'primary', sendNotifications: boolean = true): Promise<CalendarEvent> {
    try {
      // Set default reminders if not provided
      if (!event.reminders) {
        event.reminders = {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 10 },
            { method: 'email', minutes: 24 * 60 },
          ],
        };
      }

      // Add conference data if requested
      let conferenceDataVersion = 0;
      if (event.conferenceData) {
        conferenceDataVersion = 1;
      }

      const response = await this.calendar.events.insert({
        calendarId,
        conferenceDataVersion,
        sendNotifications,
        requestBody: event as calendar_v3.Schema$Event,
      });

      // Clear cache
      this.cache.deleteAccountCache(this.accountEmail, `calendar:events:${calendarId}`);
      
      return this.formatEvent(response.data);
    } catch (error) {
      this.logger.error('Failed to create event:', error);
      throw error;
    }
  }

  async updateEvent(
    calendarId: string,
    eventId: string,
    updates: Partial<CalendarEvent>,
    sendNotifications: boolean = true
  ): Promise<CalendarEvent> {
    try {
      // Get existing event
      const existingEvent = await this.getEvent(calendarId, eventId);
      
      // Merge updates
      const updatedEvent = { ...existingEvent, ...updates };

      const response = await this.calendar.events.update({
        calendarId: calendarId || 'primary',
        eventId,
        sendNotifications,
        requestBody: updatedEvent as calendar_v3.Schema$Event,
      });

      // Clear cache
      this.cache.deleteAccountCache(this.accountEmail, `calendar:events:${calendarId}`);
      
      return this.formatEvent(response.data);
    } catch (error) {
      this.logger.error(`Failed to update event ${eventId}:`, error);
      throw error;
    }
  }

  async deleteEvent(calendarId: string, eventId: string, sendNotifications: boolean = true): Promise<void> {
    try {
      await this.calendar.events.delete({
        calendarId: calendarId || 'primary',
        eventId,
        sendNotifications,
      });

      // Clear cache
      this.cache.deleteAccountCache(this.accountEmail, `calendar:events:${calendarId}`);
    } catch (error) {
      this.logger.error(`Failed to delete event ${eventId}:`, error);
      throw error;
    }
  }

  async getFreeBusy(query: FreeBusyQuery): Promise<any> {
    try {
      const response = await this.calendar.freebusy.query({
        requestBody: {
          timeMin: query.timeMin,
          timeMax: query.timeMax,
          timeZone: query.timeZone || this.defaultTimeZone,
          items: query.items,
        },
      });

      return response.data;
    } catch (error) {
      this.logger.error('Failed to get free/busy information:', error);
      throw error;
    }
  }

  async respondToInvitation(
    calendarId: string,
    eventId: string,
    response: 'accepted' | 'declined' | 'tentative' | 'needsAction',
    comment?: string,
  ): Promise<CalendarEvent> {
    try {
      // Fetch the RAW event so attendee `self`/`email` fields survive (formatEvent may drop them).
      const existing = await this.calendar.events.get({
        calendarId: calendarId || 'primary',
        eventId,
      });
      const attendees = existing.data.attendees || [];

      const isSelf = (attendee: calendar_v3.Schema$EventAttendee): boolean =>
        attendee.self === true || (attendee.email?.trim().toLowerCase() === this.accountEmail);

      const selfAttendee = attendees.find(isSelf);
      if (!selfAttendee) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Authenticated account (${this.accountEmail}) is not an attendee of event ${eventId}.`,
        );
      }

      // Preserve every attendee untouched; only change the self attendee's responseStatus/comment.
      const updatedAttendees = attendees.map(attendee =>
        isSelf(attendee)
          ? {
              ...attendee,
              responseStatus: response,
              ...(comment ? { comment } : {}),
            }
          : attendee,
      );

      const updatedEvent = await this.calendar.events.patch({
        calendarId: calendarId || 'primary',
        eventId,
        sendNotifications: true,
        requestBody: {
          attendees: updatedAttendees,
        },
      });

      return this.formatEvent(updatedEvent.data);
    } catch (error) {
      this.logger.error(`Failed to respond to invitation ${eventId}:`, error);
      throw error;
    }
  }

  async quickAddEvent(calendarId: string, text: string): Promise<CalendarEvent> {
    try {
      const response = await this.calendar.events.quickAdd({
        calendarId: calendarId || 'primary',
        text,
        sendNotifications: true,
      });

      // Clear cache
      this.cache.deleteAccountCache(this.accountEmail, `calendar:events:${calendarId}`);
      
      return this.formatEvent(response.data);
    } catch (error) {
      this.logger.error('Failed to quick add event:', error);
      throw error;
    }
  }

  async searchEvents(query: string, options: ListEventsOptions = {}): Promise<CalendarEvent[]> {
    return this.listEvents({ ...options, q: query });
  }

  async getUpcomingEvents(options: { 
    maxResults?: number; 
    daysAhead?: number;
    calendarId?: string;
  } = {}): Promise<CalendarEvent[]> {
    const {
      maxResults = 10,
      daysAhead = 7,
      calendarId = 'primary',
    } = options;

    return this.listEvents({
      calendarId,
      maxResults,
      timeMin: dayjs().toISOString(),
      timeMax: dayjs().add(daysAhead, 'days').toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });
  }

  async createRecurringEvent(
    event: CalendarEvent,
    recurrenceRule: string,
    calendarId: string = 'primary'
  ): Promise<CalendarEvent> {
    event.recurrence = [recurrenceRule];
    return this.createEvent(event, calendarId);
  }

  async addConferenceToEvent(
    calendarId: string,
    eventId: string,
    conferenceType: 'hangoutsMeet' | 'addOn'
  ): Promise<CalendarEvent> {
    try {
      const conferenceData = {
        createRequest: {
          requestId: `conf_${Date.now()}`,
          conferenceSolutionKey: {
            type: conferenceType,
          },
        },
      };

      const response = await this.calendar.events.patch({
        calendarId: calendarId || 'primary',
        eventId,
        conferenceDataVersion: 1,
        requestBody: {
          conferenceData,
        },
      });

      return this.formatEvent(response.data);
    } catch (error) {
      this.logger.error(`Failed to add conference to event ${eventId}:`, error);
      throw error;
    }
  }

  async getEventInstances(
    calendarId: string,
    eventId: string,
    opts: { timeMin?: string; timeMax?: string; maxResults?: number; pageToken?: string } = {},
  ): Promise<CalendarEvent[]> {
    try {
      const response = await this.calendar.events.instances({
        calendarId: calendarId || 'primary',
        eventId,
        timeMin: opts.timeMin,
        timeMax: opts.timeMax,
        maxResults: opts.maxResults,
        pageToken: opts.pageToken,
      });

      const instances = response.data.items || [];
      return instances.map(this.formatEvent);
    } catch (error) {
      this.logger.error(`Failed to list instances for event ${eventId}:`, error);
      throw error;
    }
  }

  async createCalendar(
    summary: string,
    opts: { description?: string; timeZone?: string } = {},
  ): Promise<unknown> {
    try {
      const response = await this.calendar.calendars.insert({
        requestBody: {
          summary,
          description: opts.description,
          timeZone: opts.timeZone,
        },
      });

      // Invalidate the cached calendar list.
      this.cache.deleteAccountCache(this.accountEmail, 'calendar:list');

      return response.data;
    } catch (error) {
      this.logger.error('Failed to create calendar:', error);
      throw error;
    }
  }

  async deleteCalendar(calendarId: string): Promise<void> {
    try {
      await this.calendar.calendars.delete({ calendarId });

      // Invalidate the cached calendar list.
      this.cache.deleteAccountCache(this.accountEmail, 'calendar:list');
    } catch (error) {
      this.logger.error(`Failed to delete calendar ${calendarId}:`, error);
      throw error;
    }
  }

  private formatEvent(event: calendar_v3.Schema$Event): CalendarEvent {
    return {
      id: event.id || undefined,
      summary: event.summary || '',
      description: event.description ?? undefined,
      location: event.location ?? undefined,
      start: {
        dateTime: event.start?.dateTime ?? undefined,
        date: event.start?.date ?? undefined,
        timeZone: event.start?.timeZone ?? undefined,
      },
      end: {
        dateTime: event.end?.dateTime ?? undefined,
        date: event.end?.date ?? undefined,
        timeZone: event.end?.timeZone ?? undefined,
      },
      attendees: event.attendees?.map(a => ({
        email: a.email || '',
        displayName: a.displayName ?? undefined,
        responseStatus: (a.responseStatus as any) ?? undefined,
        optional: a.optional ?? undefined,
        organizer: a.organizer ?? undefined,
        self: a.self ?? undefined,
      })),
      reminders: event.reminders
        ? {
            useDefault: event.reminders.useDefault ?? undefined,
            overrides: event.reminders.overrides?.map(r => ({
              method: (r.method as 'email' | 'popup') ?? 'email',
              minutes: (r.minutes as number) || 0,
            })),
          }
        : undefined,
      recurrence: event.recurrence ?? undefined,
      colorId: event.colorId ?? undefined,
      visibility: (event.visibility as any) ?? undefined,
      conferenceData: event.conferenceData,
      attachments: event.attachments?.map(a => ({
        fileUrl: a.fileUrl || '',
        title: a.title ?? undefined,
        mimeType: a.mimeType ?? undefined,
      })),
    };
  }

  // Handler methods for MCP tools
  async handleListCalendars(): Promise<{ content: Array<TextContent> }> {
    const calendars = await this.listCalendars();
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(calendars, null, 2),
      }],
    };
  }

  async handleListEvents(args: any): Promise<{ content: Array<TextContent> }> {
    const events = await this.listEvents(args);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(events, null, 2),
      }],
    };
  }

  async handleGetEvent(args: any): Promise<{ content: Array<TextContent> }> {
    const event = await this.getEvent(args.calendarId, args.eventId);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(event, null, 2),
      }],
    };
  }

  async handleCreateEvent(args: any): Promise<{ content: Array<TextContent> }> {
    const event = await this.createEvent(args.event, args.calendarId);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(event, null, 2),
      }],
    };
  }

  async handleUpdateEvent(args: any): Promise<{ content: Array<TextContent> }> {
    const event = await this.updateEvent(
      args.calendarId,
      args.eventId,
      args.updates,
      args.sendNotifications
    );
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(event, null, 2),
      }],
    };
  }

  async handleDeleteEvent(args: any): Promise<{ content: Array<TextContent> }> {
    await this.deleteEvent(args.calendarId, args.eventId, args.sendNotifications);
    return {
      content: [{
        type: 'text',
        text: `Event deleted successfully`,
      }],
    };
  }

  async handleGetAvailability(args: any): Promise<{ content: Array<TextContent> }> {
    const availability = await this.getFreeBusy(args);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(availability, null, 2),
      }],
    };
  }

  async handleRespondToInvitation(args: any): Promise<{ content: Array<TextContent> }> {
    const schema = z.object({
      calendarId: z.string().optional(),
      eventId: z.string().min(1),
      response: z.enum(['accepted', 'declined', 'tentative', 'needsAction']),
      comment: z.string().optional(),
    });
    const input = schema.parse(args);
    const event = await this.respondToInvitation(
      input.calendarId ?? 'primary',
      input.eventId,
      input.response,
      input.comment,
    );
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(event, null, 2),
      }],
    };
  }

  async handleGetEventInstances(args: any): Promise<{ content: Array<TextContent> }> {
    const events = await this.getEventInstances(args.calendarId, args.eventId, {
      timeMin: args.timeMin,
      timeMax: args.timeMax,
      maxResults: args.maxResults,
      pageToken: args.pageToken,
    });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(events, null, 2),
      }],
    };
  }

  async handleCreateCalendar(args: any): Promise<{ content: Array<TextContent> }> {
    const schema = z.object({
      summary: z.string().min(1),
      description: z.string().optional(),
      timeZone: z.string().optional(),
    });
    const input = schema.parse(args);
    const calendar = await this.createCalendar(input.summary, {
      description: input.description,
      timeZone: input.timeZone,
    });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(calendar, null, 2),
      }],
    };
  }

  async handleDeleteCalendar(args: any): Promise<{ content: Array<TextContent> }> {
    const schema = z.object({
      calendarId: z.string().min(1),
    });
    const input = schema.parse(args);
    await this.deleteCalendar(input.calendarId);
    return {
      content: [{
        type: 'text',
        text: `Calendar ${input.calendarId} deleted successfully`,
      }],
    };
  }

  async handleSearchEvents(args: any): Promise<{ content: Array<TextContent> }> {
    const events = await this.searchEvents(args.query, args.options);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(events, null, 2),
      }],
    };
  }

  async handleQuickAddEvent(args: any): Promise<{ content: Array<TextContent> }> {
    const event = await this.quickAddEvent(args.calendarId, args.text);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(event, null, 2),
      }],
    };
  }

  async handleGetUpcomingEvents(args: any): Promise<{ content: Array<TextContent> }> {
    const events = await this.getUpcomingEvents(args);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(events, null, 2),
      }],
    };
  }
}
