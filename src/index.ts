#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  Tool,
  Resource,
  TextContent,
  ImageContent,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import { GoogleAuthManager } from './auth/GoogleAuthManager.js';
import { GmailService } from './services/GmailService.js';
import { CalendarService } from './services/CalendarService.js';
import { Logger } from './utils/Logger.js';
import { CacheManager } from './utils/CacheManager.js';
import { validateEnvironment } from './utils/Validator.js';
import * as tools from './tools/index.js';

dotenv.config();

class GmailCalendarMCPServer {
  private server: Server;
  private authManager: GoogleAuthManager;
  private gmailService: GmailService | null = null;
  private calendarService: CalendarService | null = null;
  private logger: Logger;
  private cache: CacheManager;
  private currentAccount: string | null = null;

  constructor() {
    this.logger = new Logger('GmailCalendarMCPServer');
    this.cache = new CacheManager();
    this.authManager = new GoogleAuthManager();
    
    this.server = new Server(
      {
        name: 'gmail-calendar-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.getAvailableTools(),
    }));

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: await this.getAvailableResources(),
    }));

    // Read resource content
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      return await this.handleReadResource(request.params.uri);
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return await this.handleToolCall(name, args);
    });
  }

  private getAvailableTools(): Tool[] {
    return [
      // Account Management Tools
      tools.authenticateTool,
      tools.listAccountsTool,
      tools.switchAccountTool,
      tools.removeAccountTool,
      tools.getCurrentAccountTool,

      // Email Tools
      tools.listEmailsTool,
      tools.readEmailTool,
      tools.sendEmailTool,
      tools.replyToEmailTool,
      tools.forwardEmailTool,
      tools.deleteEmailTool,
      tools.markAsReadTool,
      tools.markAsUnreadTool,
      tools.searchEmailsTool,
      tools.moveEmailTool,
      tools.labelEmailTool,
      tools.createLabelTool,
      tools.listLabelsTool,
      tools.batchEmailOperationsTool,

      // Attachment Tools
      tools.listAttachmentsTool,
      tools.downloadAttachmentTool,
      tools.uploadAttachmentTool,

      // Calendar Tools
      tools.listCalendarsTool,
      tools.listEventsTool,
      tools.getEventTool,
      tools.createEventTool,
      tools.updateEventTool,
      tools.deleteEventTool,
      tools.getAvailabilityTool,
      tools.respondToInvitationTool,
      tools.searchEventsTool,
      tools.quickAddEventTool,
      tools.getUpcomingEventsTool,

      // Template Tools
      tools.listEmailTemplatesTool,
      tools.renderEmailTemplateTool,
      tools.createCustomTemplateTool,
    ];
  }

  private async getAvailableResources(): Promise<Resource[]> {
    const resources: Resource[] = [];

    try {
      const accounts = await this.authManager.listAccounts();
      
      for (const account of accounts) {
        resources.push({
          uri: `gmail://account/${account.email}`,
          name: `Gmail: ${account.email}`,
          description: `Gmail account for ${account.email}`,
          mimeType: 'application/json',
        });

        resources.push({
          uri: `calendar://account/${account.email}`,
          name: `Calendar: ${account.email}`,
          description: `Google Calendar for ${account.email}`,
          mimeType: 'application/json',
        });
      }
    } catch (error) {
      this.logger.error('Error getting resources:', error);
    }

    return resources;
  }

  private async handleReadResource(uri: string): Promise<{ contents: Array<TextContent | ImageContent> }> {
    try {
      if (uri.startsWith('gmail://')) {
        return await this.handleGmailResource(uri);
      } else if (uri.startsWith('calendar://')) {
        return await this.handleCalendarResource(uri);
      } else {
        throw new McpError(ErrorCode.InvalidRequest, `Unknown resource URI: ${uri}`);
      }
    } catch (error) {
      this.logger.error('Error reading resource:', error);
      throw error;
    }
  }

  private async handleGmailResource(uri: string): Promise<{ contents: Array<TextContent | ImageContent> }> {
    const match = uri.match(/^gmail:\/\/account\/(.+)$/);
    if (!match) {
      throw new McpError(ErrorCode.InvalidRequest, `Invalid Gmail URI: ${uri}`);
    }

    const email = match[1];
    await this.ensureAuthenticated(email);

    const accountInfo = await this.gmailService!.getAccountInfo();
    const labels = await this.gmailService!.listLabels();
    const recentEmails = await this.gmailService!.listEmails({ maxResults: 10 });

    return {
      contents: [
        {
          type: 'text',
          text: JSON.stringify({
            account: accountInfo,
            labels: labels,
            recentEmails: recentEmails.emails,
          }, null, 2),
        },
      ],
    };
  }

  private async handleCalendarResource(uri: string): Promise<{ contents: Array<TextContent | ImageContent> }> {
    const match = uri.match(/^calendar:\/\/account\/(.+)$/);
    if (!match) {
      throw new McpError(ErrorCode.InvalidRequest, `Invalid Calendar URI: ${uri}`);
    }

    const email = match[1];
    await this.ensureAuthenticated(email);

    const calendars = await this.calendarService!.listCalendars();
    const upcomingEvents = await this.calendarService!.getUpcomingEvents({ maxResults: 10 });

    return {
      contents: [
        {
          type: 'text',
          text: JSON.stringify({
            calendars: calendars,
            upcomingEvents: upcomingEvents,
          }, null, 2),
        },
      ],
    };
  }

  private async handleToolCall(name: string, args: any): Promise<{ content: Array<TextContent | ImageContent> }> {
    try {
      this.logger.info(`Handling tool call: ${name}`, { args });

      // Account management tools
      if (name === 'authenticate') {
        return await this.handleAuthenticate(args);
      } else if (name === 'list_accounts') {
        return await this.handleListAccounts();
      } else if (name === 'switch_account') {
        return await this.handleSwitchAccount(args);
      } else if (name === 'remove_account') {
        return await this.handleRemoveAccount(args);
      } else if (name === 'get_current_account') {
        return await this.handleGetCurrentAccount();
      }

      // Ensure authenticated for other operations
      if (!this.currentAccount) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          'No account selected. Please authenticate or switch to an account first.'
        );
      }

      // Email tools
      if (name.startsWith('email_') || name.startsWith('gmail_')) {
        return await this.handleEmailTool(name, args);
      }

      // Calendar tools
      if (name.startsWith('calendar_') || name.startsWith('event_')) {
        return await this.handleCalendarTool(name, args);
      }

      // Template tools
      if (name.startsWith('template_')) {
        return await this.handleTemplateTool(name, args);
      }

      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    } catch (error) {
      this.logger.error(`Error handling tool call ${name}:`, error);
      throw error;
    }
  }

  private async handleAuthenticate(args: any): Promise<{ content: Array<TextContent> }> {
    const { email, accountType = 'personal' } = args;
    
    try {
      const authUrl = await this.authManager.authenticate(email, accountType);
      
      if (authUrl) {
        return {
          content: [
            {
              type: 'text',
              text: `Please visit this URL to authenticate:\n${authUrl}\n\nAfter authentication, the account will be available for use.`,
            },
          ],
        };
      }

      await this.initializeServices(email);
      this.currentAccount = email;

      return {
        content: [
          {
            type: 'text',
            text: `Successfully authenticated account: ${email}`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Authentication failed: ${error}`);
    }
  }

  private async handleListAccounts(): Promise<{ content: Array<TextContent> }> {
    const accounts = await this.authManager.listAccounts();
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            currentAccount: this.currentAccount,
            accounts: accounts,
          }, null, 2),
        },
      ],
    };
  }

  private async handleSwitchAccount(args: any): Promise<{ content: Array<TextContent> }> {
    const { email } = args;
    
    await this.ensureAuthenticated(email);
    this.currentAccount = email;

    return {
      content: [
        {
          type: 'text',
          text: `Switched to account: ${email}`,
        },
      ],
    };
  }

  private async handleRemoveAccount(args: any): Promise<{ content: Array<TextContent> }> {
    const { email } = args;
    
    await this.authManager.removeAccount(email);
    
    if (this.currentAccount === email) {
      this.currentAccount = null;
      this.gmailService = null;
      this.calendarService = null;
    }

    return {
      content: [
        {
          type: 'text',
          text: `Removed account: ${email}`,
        },
      ],
    };
  }

  private async handleGetCurrentAccount(): Promise<{ content: Array<TextContent> }> {
    if (!this.currentAccount) {
      return {
        content: [
          {
            type: 'text',
            text: 'No account currently selected',
          },
        ],
      };
    }

    const accountInfo = await this.gmailService!.getAccountInfo();
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(accountInfo, null, 2),
        },
      ],
    };
  }

  private async handleEmailTool(name: string, args: any): Promise<{ content: Array<TextContent | ImageContent> }> {
    await this.ensureServicesInitialized();

    switch (name) {
      case 'email_list':
      case 'gmail_list':
        return await this.gmailService!.handleListEmails(args);
      
      case 'email_read':
      case 'gmail_read':
        return await this.gmailService!.handleReadEmail(args);
      
      case 'email_send':
      case 'gmail_send':
        return await this.gmailService!.handleSendEmail(args);
      
      case 'email_reply':
      case 'gmail_reply':
        return await this.gmailService!.handleReplyToEmail(args);
      
      case 'email_forward':
      case 'gmail_forward':
        return await this.gmailService!.handleForwardEmail(args);
      
      case 'email_delete':
      case 'gmail_delete':
        return await this.gmailService!.handleDeleteEmail(args);
      
      case 'email_mark_read':
      case 'gmail_mark_read':
        return await this.gmailService!.handleMarkAsRead(args);
      
      case 'email_mark_unread':
      case 'gmail_mark_unread':
        return await this.gmailService!.handleMarkAsUnread(args);
      
      case 'email_search':
      case 'gmail_search':
        return await this.gmailService!.handleSearchEmails(args);
      
      case 'email_move':
      case 'gmail_move':
        return await this.gmailService!.handleMoveEmail(args);
      
      case 'email_label':
      case 'gmail_label':
        return await this.gmailService!.handleLabelEmail(args);
      
      case 'email_create_label':
      case 'gmail_create_label':
        return await this.gmailService!.handleCreateLabel(args);
      
      case 'email_list_labels':
      case 'gmail_list_labels':
        return await this.gmailService!.handleListLabels();
      
      case 'email_batch_operations':
      case 'gmail_batch_operations':
        return await this.gmailService!.handleBatchOperations(args);
      
      case 'email_list_attachments':
      case 'gmail_list_attachments':
        return await this.gmailService!.handleListAttachments(args);
      
      case 'email_download_attachment':
      case 'gmail_download_attachment':
        return await this.gmailService!.handleDownloadAttachment(args);
      
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown email tool: ${name}`);
    }
  }

  private async handleCalendarTool(name: string, args: any): Promise<{ content: Array<TextContent> }> {
    await this.ensureServicesInitialized();

    switch (name) {
      case 'calendar_list':
        return await this.calendarService!.handleListCalendars();
      
      case 'event_list':
      case 'calendar_list_events':
        return await this.calendarService!.handleListEvents(args);
      
      case 'event_get':
      case 'calendar_get_event':
        return await this.calendarService!.handleGetEvent(args);
      
      case 'event_create':
      case 'calendar_create_event':
        return await this.calendarService!.handleCreateEvent(args);
      
      case 'event_update':
      case 'calendar_update_event':
        return await this.calendarService!.handleUpdateEvent(args);
      
      case 'event_delete':
      case 'calendar_delete_event':
        return await this.calendarService!.handleDeleteEvent(args);
      
      case 'calendar_get_availability':
        return await this.calendarService!.handleGetAvailability(args);
      
      case 'event_respond':
      case 'calendar_respond_invitation':
        return await this.calendarService!.handleRespondToInvitation(args);
      
      case 'event_search':
      case 'calendar_search_events':
        return await this.calendarService!.handleSearchEvents(args);
      
      case 'event_quick_add':
      case 'calendar_quick_add':
        return await this.calendarService!.handleQuickAddEvent(args);
      
      case 'event_upcoming':
      case 'calendar_upcoming_events':
        return await this.calendarService!.handleGetUpcomingEvents(args);
      
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown calendar tool: ${name}`);
    }
  }

  private async handleTemplateTool(name: string, args: any): Promise<{ content: Array<TextContent> }> {
    await this.ensureServicesInitialized();

    switch (name) {
      case 'template_list':
        return await this.gmailService!.handleListTemplates();
      
      case 'template_render':
        return await this.gmailService!.handleRenderTemplate(args);
      
      case 'template_create':
        return await this.gmailService!.handleCreateTemplate(args);
      
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown template tool: ${name}`);
    }
  }

  private async ensureAuthenticated(email: string): Promise<void> {
    const accounts = await this.authManager.listAccounts();
    const account = accounts.find(a => a.email === email);
    
    if (!account) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Account ${email} not found. Please authenticate first.`
      );
    }

    await this.initializeServices(email);
  }

  private async ensureServicesInitialized(): Promise<void> {
    if (!this.gmailService || !this.calendarService) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Services not initialized. Please authenticate or switch to an account first.'
      );
    }
  }

  async start(): Promise<void> {
    try {
      // Validate environment
      validateEnvironment();

      // Initialize auth manager
      await this.authManager.initialize();

      // Start the server
      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      this.logger.info('Gmail Calendar MCP Server started successfully');
    } catch (error) {
      this.logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  private async initializeServices(email: string): Promise<void> {
    const auth = await this.authManager.getAuthClient(email);
    
    if (!auth) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Failed to get auth client for ${email}`
      );
    }

    this.gmailService = new GmailService(auth, this.cache);
    this.calendarService = new CalendarService(auth, this.cache);
    
    // Initialize template engine
    if (this.gmailService && this.gmailService.templateEngine) {
      await this.gmailService.templateEngine.initialize();
    }
  }
}

// Start the server
const server = new GmailCalendarMCPServer();
server.start().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});