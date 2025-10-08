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
  description: 'Delete an email (move to trash)',
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
  description: 'Download an email attachment',
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
        description: 'Optional local path to save the attachment',
      },
    },
    required: ['messageId', 'attachmentId'],
  },
};

export const uploadAttachmentTool: Tool = {
  name: 'email_upload_attachment',
  description: 'Upload and prepare an attachment for email sending',
  inputSchema: {
    type: 'object',
    properties: {
      filename: {
        type: 'string',
        description: 'Attachment filename',
      },
      content: {
        type: 'string',
        description: 'Base64 encoded attachment content',
      },
      contentType: {
        type: 'string',
        description: 'MIME type of the attachment',
      },
    },
    required: ['filename', 'content'],
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
        enum: ['accepted', 'declined', 'tentative'],
        description: 'Response to the invitation',
      },
    },
    required: ['eventId', 'response'],
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