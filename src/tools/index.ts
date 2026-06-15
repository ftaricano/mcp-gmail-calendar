import { Tool } from '@modelcontextprotocol/sdk/types.js';

// Account Management Tools
export const authenticateTool: Tool = {
  name: 'authenticate',
  description: 'Authenticate a Gmail/Google Workspace account using OAuth2',
  inputSchema: {
    type: 'object',
    properties: {
      email: {
        type: 'string',
        format: 'email',
        description: 'Email address of the account to authenticate',
      },
      accountType: {
        type: 'string',
        enum: ['personal', 'workspace'],
        default: 'personal',
        description: 'Type of Google account (personal Gmail or Google Workspace)',
      },
    },
    required: ['email'],
  },
};

export const listAccountsTool: Tool = {
  name: 'list_accounts',
  description: 'List all authenticated accounts',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export const switchAccountTool: Tool = {
  name: 'switch_account',
  description: 'Switch to a different authenticated account',
  inputSchema: {
    type: 'object',
    properties: {
      email: {
        type: 'string',
        format: 'email',
        description: 'Email address of the account to switch to',
      },
    },
    required: ['email'],
  },
};

export const removeAccountTool: Tool = {
  name: 'remove_account',
  description: 'Remove an authenticated account',
  inputSchema: {
    type: 'object',
    properties: {
      email: {
        type: 'string',
        format: 'email',
        description: 'Email address of the account to remove',
      },
    },
    required: ['email'],
  },
};

export const getCurrentAccountTool: Tool = {
  name: 'get_current_account',
  description: 'Get information about the currently active account',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

// Gmail Email Tools
export const listEmailsTool: Tool = {
  name: 'email_list',
  description: 'List emails from Gmail with optional filtering',
  inputSchema: {
    type: 'object',
    properties: {
      maxResults: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        default: 50,
        description: 'Maximum number of emails to return',
      },
      pageToken: {
        type: 'string',
        description: 'Token for pagination',
      },
      labelIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of label IDs to filter by',
      },
      query: {
        type: 'string',
        description: 'Gmail search query (e.g., "from:example@gmail.com", "has:attachment")',
      },
      includeSpamTrash: {
        type: 'boolean',
        default: false,
        description: 'Include emails from spam and trash',
      },
    },
  },
};

export const readEmailTool: Tool = {
  name: 'email_read',
  description: 'Read a specific email by its ID',
  inputSchema: {
    type: 'object',
    properties: {
      messageId: {
        type: 'string',
        description: 'Gmail message ID',
      },
    },
    required: ['messageId'],
  },
};

export const sendEmailTool: Tool = {
  name: 'email_send',
  description: 'Send a new email with optional HTML templates and attachments',
  inputSchema: {
    type: 'object',
    properties: {
      to: {
        type: 'array',
        items: { type: 'string', format: 'email' },
        description: 'Recipient email address(es)',
      },
      subject: {
        type: 'string',
        minLength: 1,
        description: 'Email subject',
      },
      body: {
        type: 'string',
        description: 'Plain text email body',
      },
      bodyHtml: {
        type: 'string',
        description: 'HTML email body',
      },
      cc: {
        type: 'array',
        items: { type: 'string', format: 'email' },
        description: 'CC recipient email address(es)',
      },
      bcc: {
        type: 'array',
        items: { type: 'string', format: 'email' },
        description: 'BCC recipient email address(es)',
      },
      replyTo: {
        type: 'string',
        format: 'email',
        description: 'Reply-to email address',
      },
      attachments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            filename: { type: 'string' },
            content: { type: 'string', description: 'Base64 encoded content' },
            contentType: { type: 'string' },
          },
          required: ['filename', 'content'],
        },
        description: 'Email attachments',
      },
      templateId: {
        type: 'string',
        description: 'Template ID to use for HTML formatting',
      },
      templateData: {
        type: 'object',
        description: 'Data for template variables',
      },
      importance: {
        type: 'string',
        enum: ['low', 'normal', 'high'],
        default: 'normal',
        description: 'Email importance level',
      },
    },
    required: ['to', 'subject'],
  },
};

export const replyToEmailTool: Tool = {
  name: 'email_reply',
  description: 'Reply to an existing email',
  inputSchema: {
    type: 'object',
    properties: {
      messageId: {
        type: 'string',
        description: 'ID of the email to reply to',
      },
      body: {
        type: 'string',
        description: 'Reply body text',
      },
      bodyHtml: {
        type: 'string',
        description: 'Reply body HTML',
      },
      attachments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            filename: { type: 'string' },
            content: { type: 'string' },
            contentType: { type: 'string' },
          },
          required: ['filename', 'content'],
        },
      },
      templateId: {
        type: 'string',
        description: 'Template ID for HTML formatting',
      },
      templateData: {
        type: 'object',
        description: 'Template variables',
      },
    },
    required: ['messageId'],
  },
};

export const forwardEmailTool: Tool = {
  name: 'email_forward',
  description: 'Forward an existing email',
  inputSchema: {
    type: 'object',
    properties: {
      messageId: {
        type: 'string',
        description: 'ID of the email to forward',
      },
      to: {
        type: 'array',
        items: { type: 'string', format: 'email' },
        description: 'Recipient email address(es)',
      },
      body: {
        type: 'string',
        description: 'Additional message to include',
      },
      bodyHtml: {
        type: 'string',
        description: 'Additional HTML message',
      },
      cc: {
        type: 'array',
        items: { type: 'string', format: 'email' },
      },
      bcc: {
        type: 'array',
        items: { type: 'string', format: 'email' },
      },
    },
    required: ['messageId', 'to'],
  },
};

export const deleteEmailTool: Tool = {
  name: 'email_delete',
  description: 'Delete an email by moving it to trash',
  inputSchema: {
    type: 'object',
    properties: {
      messageId: {
        type: 'string',
        description: 'ID of the email to delete',
      },
    },
    required: ['messageId'],
  },
};

export const archiveEmailTool: Tool = {
  name: 'email_archive',
  description: 'Archive an email by removing it from the inbox',
  inputSchema: {
    type: 'object',
    properties: {
      messageId: {
        type: 'string',
        description: 'ID of the email to archive',
      },
    },
    required: ['messageId'],
  },
};

// Draft Tools
export const listDraftsTool: Tool = {
  name: 'email_draft_list',
  description: 'List Gmail drafts',
  inputSchema: {
    type: 'object',
    properties: {
      maxResults: { type: 'integer', minimum: 1, maximum: 500, description: 'Maximum number of drafts to return' },
      pageToken: { type: 'string', description: 'Token for pagination' },
      query: { type: 'string', description: 'Gmail search query to filter drafts' },
    },
  },
};

export const getDraftTool: Tool = {
  name: 'email_draft_get',
  description: 'Get a specific Gmail draft by its ID',
  inputSchema: {
    type: 'object',
    properties: {
      draftId: { type: 'string', description: 'Draft ID' },
    },
    required: ['draftId'],
  },
};

export const createDraftTool: Tool = {
  name: 'email_draft_create',
  description: 'Create a new Gmail draft',
  inputSchema: {
    type: 'object',
    properties: {
      to: {
        type: 'array',
        items: { type: 'string', format: 'email' },
        description: 'Recipient email address(es)',
      },
      subject: { type: 'string', description: 'Draft subject' },
      body: { type: 'string', description: 'Plain text body' },
      bodyHtml: { type: 'string', description: 'HTML body' },
      cc: { type: 'array', items: { type: 'string', format: 'email' } },
      bcc: { type: 'array', items: { type: 'string', format: 'email' } },
      replyTo: { type: 'string', format: 'email' },
      threadId: { type: 'string', description: 'Thread ID to attach the draft to' },
      importance: { type: 'string', enum: ['low', 'normal', 'high'] },
    },
  },
};

export const updateDraftTool: Tool = {
  name: 'email_draft_update',
  description: 'Update an existing Gmail draft',
  inputSchema: {
    type: 'object',
    properties: {
      draftId: { type: 'string', description: 'Draft ID to update' },
      to: {
        type: 'array',
        items: { type: 'string', format: 'email' },
        description: 'Recipient email address(es)',
      },
      subject: { type: 'string', description: 'Draft subject' },
      body: { type: 'string', description: 'Plain text body' },
      bodyHtml: { type: 'string', description: 'HTML body' },
      cc: { type: 'array', items: { type: 'string', format: 'email' } },
      bcc: { type: 'array', items: { type: 'string', format: 'email' } },
      replyTo: { type: 'string', format: 'email' },
      threadId: { type: 'string', description: 'Thread ID to attach the draft to' },
      importance: { type: 'string', enum: ['low', 'normal', 'high'] },
    },
    required: ['draftId'],
  },
};

export const sendDraftTool: Tool = {
  name: 'email_draft_send',
  description: 'Send an existing Gmail draft',
  inputSchema: {
    type: 'object',
    properties: {
      draftId: { type: 'string', description: 'Draft ID to send' },
    },
    required: ['draftId'],
  },
};

export const deleteDraftTool: Tool = {
  name: 'email_draft_delete',
  description: 'Delete a Gmail draft',
  inputSchema: {
    type: 'object',
    properties: {
      draftId: { type: 'string', description: 'Draft ID to delete' },
    },
    required: ['draftId'],
  },
};

// Thread Tools
export const listThreadsTool: Tool = {
  name: 'email_thread_list',
  description: 'List Gmail threads with optional filtering',
  inputSchema: {
    type: 'object',
    properties: {
      maxResults: { type: 'integer', minimum: 1, maximum: 500, description: 'Maximum number of threads to return' },
      pageToken: { type: 'string', description: 'Token for pagination' },
      query: { type: 'string', description: 'Gmail search query' },
      labelIds: { type: 'array', items: { type: 'string' }, description: 'Label IDs to filter by' },
    },
  },
};

export const getThreadTool: Tool = {
  name: 'email_thread_get',
  description: 'Get a specific Gmail thread by its ID',
  inputSchema: {
    type: 'object',
    properties: {
      threadId: { type: 'string', description: 'Thread ID' },
    },
    required: ['threadId'],
  },
};

export const modifyThreadTool: Tool = {
  name: 'email_thread_modify',
  description: 'Add or remove labels on a Gmail thread',
  inputSchema: {
    type: 'object',
    properties: {
      threadId: { type: 'string', description: 'Thread ID' },
      addLabelIds: { type: 'array', items: { type: 'string' }, description: 'Label IDs to add' },
      removeLabelIds: { type: 'array', items: { type: 'string' }, description: 'Label IDs to remove' },
    },
    required: ['threadId'],
  },
};

export const trashThreadTool: Tool = {
  name: 'email_thread_trash',
  description: 'Move a Gmail thread to trash',
  inputSchema: {
    type: 'object',
    properties: {
      threadId: { type: 'string', description: 'Thread ID to trash' },
    },
    required: ['threadId'],
  },
};

export const markAsReadTool: Tool = {
  name: 'email_mark_read',
  description: 'Mark an email as read',
  inputSchema: {
    type: 'object',
    properties: {
      messageId: {
        type: 'string',
        description: 'ID of the email to mark as read',
      },
    },
    required: ['messageId'],
  },
};

export const markAsUnreadTool: Tool = {
  name: 'email_mark_unread',
  description: 'Mark an email as unread',
  inputSchema: {
    type: 'object',
    properties: {
      messageId: {
        type: 'string',
        description: 'ID of the email to mark as unread',
      },
    },
    required: ['messageId'],
  },
};

export const searchEmailsTool: Tool = {
  name: 'email_search',
  description: 'Search emails using Gmail query syntax',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Gmail search query (e.g., "from:example@gmail.com subject:meeting")',
      },
      maxResults: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        default: 50,
        description: 'Maximum number of results',
      },
    },
    required: ['query'],
  },
};

export const moveEmailTool: Tool = {
  name: 'email_move',
  description: 'Move an email between labels/folders',
  inputSchema: {
    type: 'object',
    properties: {
      messageId: {
        type: 'string',
        description: 'ID of the email to move',
      },
      fromLabelId: {
        type: 'string',
        description: 'Source label ID',
      },
      toLabelId: {
        type: 'string',
        description: 'Destination label ID',
      },
    },
    required: ['messageId', 'toLabelId'],
  },
};

export const labelEmailTool: Tool = {
  name: 'email_label',
  description: 'Add a label to an email',
  inputSchema: {
    type: 'object',
    properties: {
      messageId: {
        type: 'string',
        description: 'ID of the email',
      },
      labelId: {
        type: 'string',
        description: 'Label ID to add',
      },
    },
    required: ['messageId', 'labelId'],
  },
};

export const createLabelTool: Tool = {
  name: 'email_create_label',
  description: 'Create a new Gmail label',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Label name',
      },
      options: {
        type: 'object',
        properties: {
          backgroundColor: {
            type: 'string',
            description: 'Background color (hex)',
          },
          textColor: {
            type: 'string',
            description: 'Text color (hex)',
          },
        },
      },
    },
    required: ['name'],
  },
};

export const listLabelsTool: Tool = {
  name: 'email_list_labels',
  description: 'List all Gmail labels',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export const batchEmailOperationsTool: Tool = {
  name: 'email_batch_operations',
  description: 'Perform batch operations on multiple emails',
  inputSchema: {
    type: 'object',
    properties: {
      operations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['markAsRead', 'markAsUnread', 'delete', 'addLabel', 'removeLabel'],
            },
            messageId: { type: 'string' },
            labelId: { type: 'string' },
          },
          required: ['type', 'messageId'],
        },
        description: 'Array of operations to perform',
      },
    },
    required: ['operations'],
  },
};

// Attachment Tools
export const listAttachmentsTool: Tool = {
  name: 'email_list_attachments',
  description: 'List attachments in an email',
  inputSchema: {
    type: 'object',
    properties: {
      messageId: {
        type: 'string',
        description: 'Email message ID',
      },
    },
    required: ['messageId'],
  },
};

export const downloadAttachmentTool: Tool = {
  name: 'email_download_attachment',
  description: 'Download an email attachment. If savePath is provided, only the sanitized filename is used and the file is written inside the local attachment sandbox.',
  inputSchema: {
    type: 'object',
    properties: {
      messageId: {
        type: 'string',
        description: 'Email message ID',
      },
      attachmentId: {
        type: 'string',
        description: 'Attachment ID',
      },
      savePath: {
        type: 'string',
        description: 'Optional filename hint for saving inside the local attachment sandbox',
      },
    },
    required: ['messageId', 'attachmentId'],
  },
};

// Calendar Tools
export const listCalendarsTool: Tool = {
  name: 'calendar_list',
  description: 'List all Google Calendars for the current account',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export const listEventsTool: Tool = {
  name: 'event_list',
  description: 'List calendar events with optional filtering',
  inputSchema: {
    type: 'object',
    properties: {
      calendarId: {
        type: 'string',
        default: 'primary',
        description: 'Calendar ID (default: primary)',
      },
      maxResults: {
        type: 'integer',
        minimum: 1,
        maximum: 2500,
        default: 100,
        description: 'Maximum number of events to return',
      },
      pageToken: {
        type: 'string',
        description: 'Token for pagination',
      },
      timeMin: {
        type: 'string',
        format: 'date-time',
        description: 'Lower bound for events (RFC3339 timestamp)',
      },
      timeMax: {
        type: 'string',
        format: 'date-time',
        description: 'Upper bound for events (RFC3339 timestamp)',
      },
      showDeleted: {
        type: 'boolean',
        default: false,
        description: 'Include deleted events',
      },
      singleEvents: {
        type: 'boolean',
        default: true,
        description: 'Expand recurring events into individual instances',
      },
      orderBy: {
        type: 'string',
        enum: ['startTime', 'updated'],
        default: 'startTime',
        description: 'Order results by field',
      },
      q: {
        type: 'string',
        description: 'Free text search query',
      },
    },
  },
};

export const getEventTool: Tool = {
  name: 'event_get',
  description: 'Get a specific calendar event by ID',
  inputSchema: {
    type: 'object',
    properties: {
      calendarId: {
        type: 'string',
        default: 'primary',
        description: 'Calendar ID',
      },
      eventId: {
        type: 'string',
        description: 'Event ID',
      },
    },
    required: ['eventId'],
  },
};

export const createEventTool: Tool = {
  name: 'event_create',
  description: 'Create a new calendar event',
  inputSchema: {
    type: 'object',
    properties: {
      calendarId: {
        type: 'string',
        default: 'primary',
        description: 'Calendar ID',
      },
      event: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: 'Event title',
          },
          description: {
            type: 'string',
            description: 'Event description',
          },
          location: {
            type: 'string',
            description: 'Event location',
          },
          start: {
            type: 'object',
            properties: {
              dateTime: {
                type: 'string',
                format: 'date-time',
                description: 'Start date and time (RFC3339)',
              },
              date: {
                type: 'string',
                format: 'date',
                description: 'All-day event start date (YYYY-MM-DD)',
              },
              timeZone: {
                type: 'string',
                description: 'Time zone',
              },
            },
          },
          end: {
            type: 'object',
            properties: {
              dateTime: {
                type: 'string',
                format: 'date-time',
                description: 'End date and time (RFC3339)',
              },
              date: {
                type: 'string',
                format: 'date',
                description: 'All-day event end date (YYYY-MM-DD)',
              },
              timeZone: {
                type: 'string',
                description: 'Time zone',
              },
            },
          },
          attendees: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                email: { type: 'string', format: 'email' },
                displayName: { type: 'string' },
                optional: { type: 'boolean', default: false },
              },
              required: ['email'],
            },
            description: 'Event attendees',
          },
          reminders: {
            type: 'object',
            properties: {
              useDefault: { type: 'boolean', default: true },
              overrides: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    method: { type: 'string', enum: ['email', 'popup'] },
                    minutes: { type: 'integer', minimum: 0 },
                  },
                  required: ['method', 'minutes'],
                },
              },
            },
          },
          recurrence: {
            type: 'array',
            items: { type: 'string' },
            description: 'Recurrence rules (RRULE format)',
          },
          visibility: {
            type: 'string',
            enum: ['default', 'public', 'private', 'confidential'],
            default: 'default',
          },
          conferenceData: {
            type: 'object',
            description: 'Conference/meeting details',
          },
        },
        required: ['summary', 'start', 'end'],
      },
    },
    required: ['event'],
  },
};

export const updateEventTool: Tool = {
  name: 'event_update',
  description: 'Update an existing calendar event',
  inputSchema: {
    type: 'object',
    properties: {
      calendarId: {
        type: 'string',
        default: 'primary',
        description: 'Calendar ID',
      },
      eventId: {
        type: 'string',
        description: 'Event ID',
      },
      updates: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          description: { type: 'string' },
          location: { type: 'string' },
          start: {
            type: 'object',
            properties: {
              dateTime: { type: 'string', format: 'date-time' },
              date: { type: 'string', format: 'date' },
              timeZone: { type: 'string' },
            },
          },
          end: {
            type: 'object',
            properties: {
              dateTime: { type: 'string', format: 'date-time' },
              date: { type: 'string', format: 'date' },
              timeZone: { type: 'string' },
            },
          },
          attendees: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                email: { type: 'string', format: 'email' },
                displayName: { type: 'string' },
                optional: { type: 'boolean' },
              },
            },
          },
        },
        description: 'Fields to update',
      },
      sendNotifications: {
        type: 'boolean',
        default: true,
        description: 'Send notifications to attendees',
      },
    },
    required: ['eventId', 'updates'],
  },
};

export const deleteEventTool: Tool = {
  name: 'event_delete',
  description: 'Delete a calendar event',
  inputSchema: {
    type: 'object',
    properties: {
      calendarId: {
        type: 'string',
        default: 'primary',
        description: 'Calendar ID',
      },
      eventId: {
        type: 'string',
        description: 'Event ID',
      },
      sendNotifications: {
        type: 'boolean',
        default: true,
        description: 'Send notifications to attendees',
      },
    },
    required: ['eventId'],
  },
};

export const getAvailabilityTool: Tool = {
  name: 'calendar_get_availability',
  description: 'Get free/busy information for calendars',
  inputSchema: {
    type: 'object',
    properties: {
      timeMin: {
        type: 'string',
        format: 'date-time',
        description: 'Start time (RFC3339)',
      },
      timeMax: {
        type: 'string',
        format: 'date-time',
        description: 'End time (RFC3339)',
      },
      timeZone: {
        type: 'string',
        description: 'Time zone',
      },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        description: 'Calendar IDs to check',
      },
    },
    required: ['timeMin', 'timeMax', 'items'],
  },
};

export const respondToInvitationTool: Tool = {
  name: 'event_respond',
  description: 'Respond to a calendar invitation',
  inputSchema: {
    type: 'object',
    properties: {
      calendarId: {
        type: 'string',
        default: 'primary',
        description: 'Calendar ID',
      },
      eventId: {
        type: 'string',
        description: 'Event ID',
      },
      response: {
        type: 'string',
        enum: ['accepted', 'declined', 'tentative', 'needsAction'],
        description: 'Response to the invitation',
      },
      comment: {
        type: 'string',
        description: 'Optional response comment',
      },
    },
    required: ['eventId', 'response'],
  },
};

export const getEventInstancesTool: Tool = {
  name: 'event_instances',
  description: 'List the individual instances (occurrences) of a recurring calendar event. Read-only. Use the returned instance id with event_update/event_delete to edit or remove a single occurrence.',
  inputSchema: {
    type: 'object',
    properties: {
      calendarId: {
        type: 'string',
        default: 'primary',
        description: 'Calendar ID',
      },
      eventId: {
        type: 'string',
        description: 'Recurring event ID',
      },
      timeMin: {
        type: 'string',
        format: 'date-time',
        description: 'Lower bound for instances (RFC3339 timestamp)',
      },
      timeMax: {
        type: 'string',
        format: 'date-time',
        description: 'Upper bound for instances (RFC3339 timestamp)',
      },
      maxResults: {
        type: 'integer',
        minimum: 1,
        maximum: 2500,
        description: 'Maximum number of instances to return',
      },
      pageToken: {
        type: 'string',
        description: 'Token for pagination',
      },
    },
    required: ['eventId'],
  },
};

export const createCalendarTool: Tool = {
  name: 'calendar_create',
  description: 'Create a new secondary calendar',
  inputSchema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'Calendar title',
      },
      description: {
        type: 'string',
        description: 'Calendar description',
      },
      timeZone: {
        type: 'string',
        description: 'Calendar time zone (IANA, e.g. America/Sao_Paulo)',
      },
    },
    required: ['summary'],
  },
};

export const deleteCalendarTool: Tool = {
  name: 'calendar_delete',
  description: 'Delete a secondary calendar. Destructive: removes the calendar and all its events.',
  inputSchema: {
    type: 'object',
    properties: {
      calendarId: {
        type: 'string',
        description: 'Calendar ID to delete',
      },
    },
    required: ['calendarId'],
  },
};

export const searchEventsTool: Tool = {
  name: 'event_search',
  description: 'Search calendar events',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query',
      },
      options: {
        type: 'object',
        properties: {
          calendarId: { type: 'string', default: 'primary' },
          maxResults: { type: 'integer', minimum: 1, maximum: 2500, default: 100 },
          timeMin: { type: 'string', format: 'date-time' },
          timeMax: { type: 'string', format: 'date-time' },
        },
      },
    },
    required: ['query'],
  },
};

export const quickAddEventTool: Tool = {
  name: 'event_quick_add',
  description: 'Create an event using natural language text',
  inputSchema: {
    type: 'object',
    properties: {
      calendarId: {
        type: 'string',
        default: 'primary',
        description: 'Calendar ID',
      },
      text: {
        type: 'string',
        description: 'Natural language event description (e.g., "Lunch with John tomorrow at 12pm")',
      },
    },
    required: ['text'],
  },
};

export const getUpcomingEventsTool: Tool = {
  name: 'event_upcoming',
  description: 'Get upcoming events for the next few days',
  inputSchema: {
    type: 'object',
    properties: {
      maxResults: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        default: 10,
        description: 'Maximum number of events',
      },
      daysAhead: {
        type: 'integer',
        minimum: 1,
        maximum: 30,
        default: 7,
        description: 'Number of days to look ahead',
      },
      calendarId: {
        type: 'string',
        default: 'primary',
        description: 'Calendar ID',
      },
    },
  },
};

// Drive Tools
export const driveListTool: Tool = {
  name: 'drive_list',
  description: 'List Google Drive files with an optional query',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: "Drive query string (e.g., \"mimeType != 'application/vnd.google-apps.folder'\")",
      },
      pageSize: {
        type: 'integer',
        minimum: 1,
        maximum: 1000,
        default: 50,
        description: 'Maximum number of files to return',
      },
      pageToken: {
        type: 'string',
        description: 'Token for pagination',
      },
    },
  },
};

export const driveGetTool: Tool = {
  name: 'drive_get',
  description: 'Get metadata for a Google Drive file by ID',
  inputSchema: {
    type: 'object',
    properties: {
      fileId: { type: 'string', description: 'Drive file ID' },
    },
    required: ['fileId'],
  },
};

export const driveUploadTool: Tool = {
  name: 'drive_upload',
  description: 'Upload a local file to Google Drive',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Local path of the file to upload' },
      name: { type: 'string', description: 'Optional name for the uploaded file' },
      mimeType: { type: 'string', description: 'Optional MIME type override' },
      parents: {
        type: 'array',
        items: { type: 'string' },
        description: 'Parent folder IDs',
      },
    },
    required: ['path'],
  },
};

export const driveDownloadTool: Tool = {
  name: 'drive_download',
  description: 'Download a Google Drive file to a local path',
  inputSchema: {
    type: 'object',
    properties: {
      fileId: { type: 'string', description: 'Drive file ID' },
      outputPath: { type: 'string', description: 'Local output path' },
    },
    required: ['fileId', 'outputPath'],
  },
};

export const driveMkdirTool: Tool = {
  name: 'drive_mkdir',
  description: 'Create a folder in Google Drive',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Folder name' },
      parentId: { type: 'string', description: 'Optional parent folder ID' },
    },
    required: ['name'],
  },
};

export const driveShareTool: Tool = {
  name: 'drive_share',
  description: 'Share a Google Drive file by creating a permission',
  inputSchema: {
    type: 'object',
    properties: {
      fileId: { type: 'string', description: 'Drive file ID' },
      role: {
        type: 'string',
        enum: ['reader', 'commenter', 'writer'],
        description: 'Permission role',
      },
      emailAddress: { type: 'string', description: 'Target email for user/group permissions' },
      type: {
        type: 'string',
        enum: ['user', 'group', 'domain', 'anyone'],
        default: 'user',
        description: 'Permission grantee type',
      },
    },
    required: ['fileId', 'role'],
  },
};

export const driveTrashTool: Tool = {
  name: 'drive_trash',
  description: 'Move a Google Drive file to the trash (recoverable)',
  inputSchema: {
    type: 'object',
    properties: {
      fileId: { type: 'string', description: 'Drive file ID' },
    },
    required: ['fileId'],
  },
};

export const driveRestoreTool: Tool = {
  name: 'drive_restore',
  description: 'Restore a Google Drive file from the trash',
  inputSchema: {
    type: 'object',
    properties: {
      fileId: { type: 'string', description: 'Drive file ID' },
    },
    required: ['fileId'],
  },
};

export const driveCopyTool: Tool = {
  name: 'drive_copy',
  description: 'Copy a Google Drive file',
  inputSchema: {
    type: 'object',
    properties: {
      fileId: { type: 'string', description: 'Source Drive file ID' },
      name: { type: 'string', description: 'Optional name for the copy' },
      parents: {
        type: 'array',
        items: { type: 'string' },
        description: 'Parent folder IDs for the copy',
      },
    },
    required: ['fileId'],
  },
};

export const driveBatchDeleteTool: Tool = {
  name: 'drive_batch_delete',
  description: 'Move multiple Google Drive files to the trash (recoverable, not a permanent delete). Continues past per-file errors.',
  inputSchema: {
    type: 'object',
    properties: {
      fileIds: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        description: 'Drive file IDs to trash',
      },
    },
    required: ['fileIds'],
  },
};

export const driveRevisionsTool: Tool = {
  name: 'drive_revisions',
  description: 'List revisions of a Google Drive file (read-only)',
  inputSchema: {
    type: 'object',
    properties: {
      fileId: { type: 'string', description: 'Drive file ID' },
    },
    required: ['fileId'],
  },
};

export const driveSharedDrivesTool: Tool = {
  name: 'drive_shared_drives',
  description: 'List shared drives for the current account (read-only)',
  inputSchema: {
    type: 'object',
    properties: {
      pageSize: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        default: 50,
        description: 'Maximum number of shared drives to return',
      },
      pageToken: {
        type: 'string',
        description: 'Token for pagination',
      },
    },
  },
};

export const driveShortcutTool: Tool = {
  name: 'drive_shortcut',
  description: 'Create a shortcut to a Google Drive file or folder',
  inputSchema: {
    type: 'object',
    properties: {
      targetId: { type: 'string', description: 'ID of the target file or folder' },
      name: { type: 'string', description: 'Name for the shortcut' },
      parents: {
        type: 'array',
        items: { type: 'string' },
        description: 'Parent folder IDs for the shortcut',
      },
    },
    required: ['targetId', 'name'],
  },
};

// Template Tools
export const listEmailTemplatesTool: Tool = {
  name: 'template_list',
  description: 'List available email templates',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export const renderEmailTemplateTool: Tool = {
  name: 'template_render',
  description: 'Render an email template with data',
  inputSchema: {
    type: 'object',
    properties: {
      templateId: {
        type: 'string',
        description: 'Template ID',
      },
      data: {
        type: 'object',
        description: 'Template variables',
        properties: {
          recipientName: { type: 'string' },
          senderName: { type: 'string' },
          companyName: { type: 'string' },
          logoUrl: { type: 'string' },
          subject: { type: 'string' },
          emailTitle: { type: 'string' },
          content: { type: 'string' },
          signature: { type: 'string' },
          actionUrl: { type: 'string' },
          actionText: { type: 'string' },
        },
      },
    },
    required: ['templateId'],
  },
};

export const createCustomTemplateTool: Tool = {
  name: 'template_create',
  description: 'Create a custom email template',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Template name',
      },
      content: {
        type: 'string',
        description: 'HTML template content with Handlebars syntax',
      },
      description: {
        type: 'string',
        description: 'Template description',
      },
      category: {
        type: 'string',
        enum: ['business', 'personal', 'marketing', 'system'],
        default: 'business',
      },
      theme: {
        type: 'string',
        enum: ['professional', 'modern', 'minimal', 'corporate'],
        default: 'professional',
      },
    },
    required: ['name', 'content'],
  },
};

// Google Docs Tools
export const docsGetTool: Tool = {
  name: 'docs_get',
  description: 'Get a Google Doc by its document id',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Google Docs document id' },
    },
    required: ['documentId'],
  },
};

export const docsCreateTool: Tool = {
  name: 'docs_create',
  description: 'Create a new Google Doc with an optional initial body',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Document title' },
      content: { type: 'string', description: 'Optional initial body text' },
    },
    required: ['title'],
  },
};

export const docsExportTool: Tool = {
  name: 'docs_export',
  description: 'Export a Google Doc to a file using a MIME type',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Google Docs document id' },
      mimeType: { type: 'string', description: 'Export MIME type (e.g. application/pdf)' },
      outputPath: { type: 'string', description: 'Destination file path' },
    },
    required: ['documentId', 'mimeType', 'outputPath'],
  },
};

export const docsBatchUpdateTool: Tool = {
  name: 'docs_batch_update',
  description: 'Apply raw documents.batchUpdate requests to a Google Doc (formatting, tables, images, etc.)',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Google Docs document id' },
      requests: {
        type: 'array',
        description: 'Array of raw docs_v1 batchUpdate request objects',
        items: { type: 'object' },
      },
    },
    required: ['documentId', 'requests'],
  },
};

export const docsInsertTextTool: Tool = {
  name: 'docs_insert_text',
  description: 'Insert text into a Google Doc at an index (default 1)',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Google Docs document id' },
      text: { type: 'string', description: 'Text to insert' },
      index: { type: 'number', description: 'Insertion index (default 1)' },
    },
    required: ['documentId', 'text'],
  },
};

export const docsReplaceTextTool: Tool = {
  name: 'docs_replace_text',
  description: 'Replace all occurrences of text in a Google Doc',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Google Docs document id' },
      replacements: {
        type: 'array',
        description: 'List of find/replace pairs',
        items: {
          type: 'object',
          properties: {
            find: { type: 'string', description: 'Text to find' },
            replace: { type: 'string', description: 'Replacement text' },
            matchCase: { type: 'boolean', description: 'Case-sensitive match (default false)' },
          },
          required: ['find', 'replace'],
        },
      },
    },
    required: ['documentId', 'replacements'],
  },
};

export const docsInsertTableTool: Tool = {
  name: 'docs_insert_table',
  description: 'Insert a table into a Google Doc at an index (default 1)',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Google Docs document id' },
      rows: { type: 'number', description: 'Number of rows' },
      columns: { type: 'number', description: 'Number of columns' },
      index: { type: 'number', description: 'Insertion index (default 1)' },
    },
    required: ['documentId', 'rows', 'columns'],
  },
};

export const docsInsertImageTool: Tool = {
  name: 'docs_insert_image',
  description: 'Insert an inline image into a Google Doc from a URI at an index (default 1)',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Google Docs document id' },
      uri: { type: 'string', description: 'Publicly accessible image URI' },
      index: { type: 'number', description: 'Insertion index (default 1)' },
    },
    required: ['documentId', 'uri'],
  },
};
// Google Sheets Tools
export const sheetsGetTool: Tool = {
  name: 'sheets_get',
  description: 'Get a Google Spreadsheet (metadata, sheets, properties)',
  inputSchema: {
    type: 'object',
    properties: {
      spreadsheetId: { type: 'string', description: 'Spreadsheet ID' },
    },
    required: ['spreadsheetId'],
  },
};

export const sheetsValuesGetTool: Tool = {
  name: 'sheets_values_get',
  description: 'Read values from an A1 range in a spreadsheet',
  inputSchema: {
    type: 'object',
    properties: {
      spreadsheetId: { type: 'string', description: 'Spreadsheet ID' },
      range: { type: 'string', description: 'A1 notation range (e.g., "Sheet1!A1:C10")' },
    },
    required: ['spreadsheetId', 'range'],
  },
};

export const sheetsValuesUpdateTool: Tool = {
  name: 'sheets_values_update',
  description: 'Write values to an A1 range. Use USER_ENTERED to evaluate formulas.',
  inputSchema: {
    type: 'object',
    properties: {
      spreadsheetId: { type: 'string', description: 'Spreadsheet ID' },
      range: { type: 'string', description: 'A1 notation range' },
      values: {
        type: 'array',
        items: { type: 'array', items: {} },
        description: 'Matrix of cell values (rows of columns)',
      },
      valueInputOption: {
        type: 'string',
        enum: ['RAW', 'USER_ENTERED'],
        default: 'RAW',
        description: 'RAW stores literal strings; USER_ENTERED parses numbers/formulas',
      },
    },
    required: ['spreadsheetId', 'range', 'values'],
  },
};

export const sheetsValuesAppendTool: Tool = {
  name: 'sheets_values_append',
  description: 'Append rows after the last row of a range. Use USER_ENTERED for formulas.',
  inputSchema: {
    type: 'object',
    properties: {
      spreadsheetId: { type: 'string', description: 'Spreadsheet ID' },
      range: { type: 'string', description: 'A1 notation range' },
      values: {
        type: 'array',
        items: { type: 'array', items: {} },
        description: 'Matrix of cell values to append',
      },
      valueInputOption: {
        type: 'string',
        enum: ['RAW', 'USER_ENTERED'],
        default: 'RAW',
      },
    },
    required: ['spreadsheetId', 'range', 'values'],
  },
};

export const sheetsBatchUpdateTool: Tool = {
  name: 'sheets_batch_update',
  description: 'Run raw spreadsheets.batchUpdate requests (formatting, data validation, conditional formatting, etc.)',
  inputSchema: {
    type: 'object',
    properties: {
      spreadsheetId: { type: 'string', description: 'Spreadsheet ID' },
      requests: {
        type: 'array',
        items: { type: 'object' },
        description: 'Array of Sheets API Request objects',
      },
    },
    required: ['spreadsheetId', 'requests'],
  },
};

export const sheetsAddSheetTool: Tool = {
  name: 'sheets_add_sheet',
  description: 'Add a new sheet (tab) to a spreadsheet',
  inputSchema: {
    type: 'object',
    properties: {
      spreadsheetId: { type: 'string', description: 'Spreadsheet ID' },
      title: { type: 'string', description: 'Title of the new sheet' },
      rows: { type: 'integer', minimum: 1, description: 'Optional row count' },
      columns: { type: 'integer', minimum: 1, description: 'Optional column count' },
    },
    required: ['spreadsheetId', 'title'],
  },
};

export const sheetsDeleteSheetTool: Tool = {
  name: 'sheets_delete_sheet',
  description: 'Delete a sheet (tab) from a spreadsheet. Destructive.',
  inputSchema: {
    type: 'object',
    properties: {
      spreadsheetId: { type: 'string', description: 'Spreadsheet ID' },
      sheetId: { type: 'integer', minimum: 0, description: 'Numeric sheet ID to delete' },
    },
    required: ['spreadsheetId', 'sheetId'],
  },
};

export const sheetsRenameSheetTool: Tool = {
  name: 'sheets_rename_sheet',
  description: 'Rename a sheet (tab) in a spreadsheet',
  inputSchema: {
    type: 'object',
    properties: {
      spreadsheetId: { type: 'string', description: 'Spreadsheet ID' },
      sheetId: { type: 'integer', minimum: 0, description: 'Numeric sheet ID to rename' },
      title: { type: 'string', description: 'New sheet title' },
    },
    required: ['spreadsheetId', 'sheetId', 'title'],
  },
};

export const sheetsClearTool: Tool = {
  name: 'sheets_clear',
  description: 'Clear values from an A1 range (keeps formatting)',
  inputSchema: {
    type: 'object',
    properties: {
      spreadsheetId: { type: 'string', description: 'Spreadsheet ID' },
      range: { type: 'string', description: 'A1 notation range to clear' },
    },
    required: ['spreadsheetId', 'range'],
  },
};
