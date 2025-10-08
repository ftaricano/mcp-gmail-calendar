# Gmail & Google Calendar MCP Server

Professional MCP (Model Context Protocol) server for Gmail and Google Calendar with comprehensive multi-account support, advanced email templates, and full calendar management capabilities.

## Features

### 🔐 Multi-Account Authentication
- **OAuth2 Integration**: Secure Google OAuth2 authentication
- **Multiple Accounts**: Support for personal Gmail and Google Workspace accounts
- **Account Management**: Easy switching between authenticated accounts
- **Token Management**: Automatic token refresh and secure storage

### 📧 Gmail Management
- **Email Operations**: List, read, send, reply, forward, delete emails
- **Advanced Search**: Full Gmail search query support
- **Label Management**: Create, apply, and manage Gmail labels
- **Batch Operations**: Perform operations on multiple emails
- **Smart Filtering**: Filter by labels, dates, senders, and more

### 🎨 Professional Email Templates
- **Built-in Themes**: Professional, Modern, Minimal, Corporate
- **Custom Templates**: Create and manage custom HTML templates
- **Handlebars Engine**: Dynamic content with template variables
- **CSS Inlining**: Automatic CSS inlining for email client compatibility
- **Responsive Design**: Mobile-friendly email layouts

### 📎 Attachment Handling
- **Upload/Download**: Full attachment management
- **Security Scanning**: Automatic file type and size validation
- **Base64 Support**: Direct base64 content handling
- **Storage Management**: Temporary attachment storage with cleanup

### 📅 Google Calendar Integration
- **Event Management**: Create, read, update, delete calendar events
- **Multi-Calendar**: Support for multiple calendars per account
- **Meeting Scheduling**: Conference call integration (Google Meet)
- **Availability Checking**: Free/busy time queries
- **Recurring Events**: Support for recurring event patterns
- **Invitation Responses**: Accept, decline, tentative responses

### ⚡ Advanced Features
- **Caching System**: Intelligent caching for better performance
- **Error Recovery**: Robust error handling and retry logic
- **Logging System**: Comprehensive logging with Winston
- **Input Validation**: Schema validation with Zod
- **Security First**: HTML sanitization and attachment scanning

## Installation

### Prerequisites
- Node.js 18+ and npm
- Google Cloud Project with Gmail API and Calendar API enabled
- OAuth2 credentials (Desktop application type)

### Setup Steps

1. **Clone and Install**:
```bash
git clone <repository-url>
cd mcp-gmail-calendar
npm install
```

2. **Create Google Cloud Project**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing one
   - Enable Gmail API and Google Calendar API
   - Create OAuth2 credentials (Desktop application type)
   - Download credentials JSON file

3. **Configure Environment**:
```bash
cp .env.example .env
```

Edit `.env` file:
```env
# Path to your Google OAuth2 credentials JSON file
GOOGLE_CREDENTIALS_PATH=./credentials.json

# OAuth callback port
OAUTH_CALLBACK_PORT=3000

# Storage paths
TOKENS_PATH=./tokens
TEMPLATE_PATH=./templates
LOG_FILE_PATH=./logs/mcp-gmail-calendar.log

# Limits
MAX_EMAIL_RESULTS=50
MAX_ATTACHMENT_SIZE=25000000
MAX_CALENDAR_EVENTS=100

# Default settings
DEFAULT_CALENDAR_TIMEZONE=America/New_York
DEFAULT_EMAIL_THEME=professional
LOG_LEVEL=info
```

4. **Place Credentials**:
   - Save your Google OAuth2 credentials as `credentials.json` in the project root
   - Or update `GOOGLE_CREDENTIALS_PATH` in your `.env` file

5. **Build and Start**:
```bash
npm run build
npm start
```

### Development Mode
```bash
npm run dev
```

## Configuration

### MCP Client Configuration

Add to your MCP client configuration (e.g., Claude Desktop):

```json
{
  "mcpServers": {
    "gmail-calendar": {
      "command": "node",
      "args": ["/path/to/mcp-gmail-calendar/dist/index.js"],
      "env": {
        "GOOGLE_CREDENTIALS_PATH": "/path/to/your/credentials.json"
      }
    }
  }
}
```

### Google Cloud Console Setup

1. **Create Project**: [https://console.cloud.google.com/](https://console.cloud.google.com/)

2. **Enable APIs**:
   - Gmail API: [https://console.cloud.google.com/apis/library/gmail.googleapis.com](https://console.cloud.google.com/apis/library/gmail.googleapis.com)
   - Google Calendar API: [https://console.cloud.google.com/apis/library/calendar-json.googleapis.com](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com)

3. **Create OAuth2 Credentials**:
   - Go to "Credentials" → "Create Credentials" → "OAuth client ID"
   - Application type: "Desktop application"
   - Name: "MCP Gmail Calendar Server"
   - Download JSON file

4. **Configure OAuth Consent Screen**:
   - Add your email as a test user
   - Configure app information and scopes

## Usage

### Account Management

#### Authenticate Account
```json
{
  "name": "authenticate",
  "arguments": {
    "email": "user@gmail.com",
    "accountType": "personal"
  }
}
```

#### List Accounts
```json
{
  "name": "list_accounts",
  "arguments": {}
}
```

#### Switch Account
```json
{
  "name": "switch_account",
  "arguments": {
    "email": "work@company.com"
  }
}
```

### Email Operations

#### Send Email with Template
```json
{
  "name": "email_send",
  "arguments": {
    "to": ["recipient@example.com"],
    "subject": "Professional Email",
    "templateId": "professional_basic",
    "templateData": {
      "recipientName": "John Doe",
      "emailTitle": "Important Update",
      "content": "<h2>Hello!</h2><p>This is a professional email.</p>",
      "senderName": "Jane Smith",
      "companyName": "Acme Corp"
    }
  }
}
```

#### List Emails with Search
```json
{
  "name": "email_list",
  "arguments": {
    "maxResults": 20,
    "query": "from:important@company.com has:attachment"
  }
}
```

#### Reply to Email
```json
{
  "name": "email_reply",
  "arguments": {
    "messageId": "thread_abc123",
    "bodyHtml": "<p>Thank you for your message!</p>",
    "templateId": "minimal_personal"
  }
}
```

### Calendar Operations

#### Create Event
```json
{
  "name": "event_create",
  "arguments": {
    "event": {
      "summary": "Team Meeting",
      "description": "Weekly team sync",
      "location": "Conference Room A",
      "start": {
        "dateTime": "2024-01-15T10:00:00-05:00",
        "timeZone": "America/New_York"
      },
      "end": {
        "dateTime": "2024-01-15T11:00:00-05:00",
        "timeZone": "America/New_York"
      },
      "attendees": [
        {"email": "team@company.com"},
        {"email": "manager@company.com"}
      ],
      "reminders": {
        "useDefault": false,
        "overrides": [
          {"method": "popup", "minutes": 10},
          {"method": "email", "minutes": 60}
        ]
      }
    }
  }
}
```

#### Get Upcoming Events
```json
{
  "name": "event_upcoming",
  "arguments": {
    "maxResults": 10,
    "daysAhead": 7
  }
}
```

#### Check Availability
```json
{
  "name": "calendar_get_availability",
  "arguments": {
    "timeMin": "2024-01-15T09:00:00Z",
    "timeMax": "2024-01-15T17:00:00Z",
    "items": [
      {"id": "primary"},
      {"id": "work@company.com"}
    ]
  }
}
```

### Template Management

#### List Templates
```json
{
  "name": "template_list",
  "arguments": {}
}
```

#### Create Custom Template
```json
{
  "name": "template_create",
  "arguments": {
    "name": "Company Newsletter",
    "description": "Monthly company newsletter template",
    "category": "marketing",
    "theme": "modern",
    "content": "<html>...</html>"
  }
}
```

## Email Templates

### Built-in Templates

1. **Professional Basic** (`professional_basic`):
   - Clean business communication
   - Company branding support
   - Call-to-action buttons

2. **Modern Notification** (`modern_notification`):
   - Contemporary design
   - Alert/notification styling
   - Gradient backgrounds

3. **Minimal Personal** (`minimal_personal`):
   - Simple, clean design
   - Personal correspondence
   - Typography-focused

4. **Corporate Formal** (`corporate_formal`):
   - Formal business template
   - Company letterhead
   - Legal disclaimers

### Template Variables

Common variables available in all templates:
- `recipientName`: Recipient's name
- `senderName`: Sender's name
- `companyName`: Company/organization name
- `logoUrl`: Company logo URL
- `emailTitle`: Main email title
- `content`: Main email content (HTML)
- `signature`: Custom signature
- `actionUrl`: Call-to-action URL
- `actionText`: Call-to-action button text

### Custom Templates

Create custom templates using Handlebars syntax:

```html
<!DOCTYPE html>
<html>
<head>
    <title>{{emailTitle}}</title>
</head>
<body>
    <h1>{{emailTitle}}</h1>
    {{#if recipientName}}
    <p>Dear {{recipientName}},</p>
    {{/if}}
    
    {{{content}}}
    
    {{#if actionUrl}}
    <a href="{{actionUrl}}" style="...">
        {{default actionText "Learn More"}}
    </a>
    {{/if}}
    
    <p>Best regards,<br>{{senderName}}</p>
</body>
</html>
```

## API Reference

### Account Tools
- `authenticate` - Authenticate Google account
- `list_accounts` - List authenticated accounts
- `switch_account` - Switch active account
- `remove_account` - Remove account
- `get_current_account` - Get current account info

### Email Tools
- `email_list` - List emails
- `email_read` - Read email
- `email_send` - Send email
- `email_reply` - Reply to email
- `email_forward` - Forward email
- `email_delete` - Delete email
- `email_mark_read` - Mark as read
- `email_mark_unread` - Mark as unread
- `email_search` - Search emails
- `email_move` - Move email
- `email_label` - Add label
- `email_create_label` - Create label
- `email_list_labels` - List labels
- `email_batch_operations` - Batch operations

### Attachment Tools
- `email_list_attachments` - List attachments
- `email_download_attachment` - Download attachment
- `email_upload_attachment` - Upload attachment

### Calendar Tools
- `calendar_list` - List calendars
- `event_list` - List events
- `event_get` - Get event
- `event_create` - Create event
- `event_update` - Update event
- `event_delete` - Delete event
- `calendar_get_availability` - Get availability
- `event_respond` - Respond to invitation
- `event_search` - Search events
- `event_quick_add` - Quick add event
- `event_upcoming` - Get upcoming events

### Template Tools
- `template_list` - List templates
- `template_render` - Render template
- `template_create` - Create template

## Security

### Authentication Security
- OAuth2 flow with PKCE (recommended by Google)
- Secure token storage with refresh token rotation
- Account isolation and permission scoping

### Email Security
- HTML content sanitization
- Attachment type and size validation
- Executable file detection and blocking
- XSS protection in email content

### Data Protection
- No email content stored permanently
- Secure credential management
- Audit logging for all operations
- Rate limiting and quota management

## Troubleshooting

### Common Issues

#### Authentication Fails
- Verify credentials.json file is valid
- Check OAuth consent screen configuration
- Ensure APIs are enabled in Google Cloud Console
- Confirm redirect URI is `http://localhost:3000/oauth2callback`

#### Email Sending Fails
- Check Gmail API quota limits
- Verify email addresses are valid
- Ensure account has sending permissions
- Check for attachment size limits

#### Calendar Events Not Created
- Verify Calendar API is enabled
- Check calendar permissions
- Ensure date/time formats are valid (RFC3339)
- Confirm time zone settings

#### Template Rendering Issues
- Validate Handlebars syntax
- Check required template variables
- Verify HTML structure
- Test with minimal template first

### Debug Mode

Enable debug logging:
```env
LOG_LEVEL=debug
```

View logs:
```bash
tail -f ./logs/mcp-gmail-calendar.log
```

### Support

For issues and questions:
1. Check the troubleshooting section
2. Review Google API documentation
3. Enable debug logging
4. Check server logs for specific errors

## Contributing

1. Fork the repository
2. Create feature branch
3. Make changes with tests
4. Submit pull request

## License

MIT License - see LICENSE file for details.

## Changelog

### v1.0.0
- Initial release
- Multi-account OAuth2 authentication
- Complete Gmail email management
- Google Calendar integration
- Professional email templates
- Attachment handling
- Comprehensive error handling
- Security features