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
import { DriveService } from './services/DriveService.js';
import { DocsService } from './services/DocsService.js';
import { SheetsService } from './services/SheetsService.js';
import { TasksService } from './services/TasksService.js';
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
  private driveService: DriveService | null = null;
  private docsService: DocsService | null = null;
  private sheetsService: SheetsService | null = null;
  private tasksService: TasksService | null = null;
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
      tools.archiveEmailTool,

      // Draft Tools
      tools.listDraftsTool,
      tools.getDraftTool,
      tools.createDraftTool,
      tools.updateDraftTool,
      tools.sendDraftTool,
      tools.deleteDraftTool,

      // Thread Tools
      tools.listThreadsTool,
      tools.getThreadTool,
      tools.modifyThreadTool,
      tools.trashThreadTool,

      // Attachment Tools
      tools.listAttachmentsTool,
      tools.downloadAttachmentTool,

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
      tools.getEventInstancesTool,
      tools.createCalendarTool,
      tools.deleteCalendarTool,

      // Drive Tools
      tools.driveListTool,
      tools.driveGetTool,
      tools.driveUploadTool,
      tools.driveDownloadTool,
      tools.driveMkdirTool,
      tools.driveShareTool,
      tools.driveTrashTool,
      tools.driveRestoreTool,
      tools.driveCopyTool,
      tools.driveBatchDeleteTool,
      tools.driveRevisionsTool,
      tools.driveSharedDrivesTool,
      tools.driveShortcutTool,

      // Template Tools
      tools.listEmailTemplatesTool,
      tools.renderEmailTemplateTool,
      tools.createCustomTemplateTool,

      // Google Docs Tools
      tools.docsGetTool,
      tools.docsCreateTool,
      tools.docsExportTool,
      tools.docsBatchUpdateTool,
      tools.docsInsertTextTool,
      tools.docsReplaceTextTool,
      tools.docsInsertTableTool,
      tools.docsInsertImageTool,
      // Google Sheets Tools
      tools.sheetsGetTool,
      tools.sheetsValuesGetTool,
      tools.sheetsValuesUpdateTool,
      tools.sheetsValuesAppendTool,
      tools.sheetsBatchUpdateTool,
      tools.sheetsAddSheetTool,
      tools.sheetsDeleteSheetTool,
      tools.sheetsRenameSheetTool,
      tools.sheetsClearTool,
      // Google Tasks Tools
      tools.listTaskListsTool,
      tools.getTaskListTool,
      tools.createTaskListTool,
      tools.updateTaskListTool,
      tools.deleteTaskListTool,
      tools.listTasksTool,
      tools.getTaskTool,
      tools.createTaskTool,
      tools.updateTaskTool,
      tools.completeTaskTool,
      tools.moveTaskTool,
      tools.deleteTaskTool,
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
      this.logger.info(`Handling tool call: ${name}`, this.summarizeToolArgs(args));

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

      // Drive tools
      if (name.startsWith('drive_')) {
        return await this.handleDriveTool(name, args);
      }

      // Template tools
      if (name.startsWith('template_')) {
        return await this.handleTemplateTool(name, args);
      }

      // Docs tools
      if (name.startsWith('docs_')) {
        return await this.handleDocsTool(name, args);
      }

      // Google Sheets tools
      if (name.startsWith('sheets_')) {
        return await this.handleSheetsTool(name, args);
      }

      // Google Tasks tools
      if (name.startsWith('tasks_')) {
        return await this.handleTasksTool(name, args);
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
      this.driveService = null;
      this.docsService = null;
      this.sheetsService = null;
      this.tasksService = null;
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
      
      case 'email_archive':
        return await this.gmailService!.handleArchiveEmail(args);

      case 'email_draft_list':
        return await this.gmailService!.handleListDrafts(args);

      case 'email_draft_get':
        return await this.gmailService!.handleGetDraft(args);

      case 'email_draft_create':
        return await this.gmailService!.handleCreateDraft(args);

      case 'email_draft_update':
        return await this.gmailService!.handleUpdateDraft(args);

      case 'email_draft_send':
        return await this.gmailService!.handleSendDraft(args);

      case 'email_draft_delete':
        return await this.gmailService!.handleDeleteDraft(args);

      case 'email_thread_list':
        return await this.gmailService!.handleListThreads(args);

      case 'email_thread_get':
        return await this.gmailService!.handleGetThread(args);

      case 'email_thread_modify':
        return await this.gmailService!.handleModifyThread(args);

      case 'email_thread_trash':
        return await this.gmailService!.handleTrashThread(args);

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

      case 'event_instances':
      case 'calendar_event_instances':
        return await this.calendarService!.handleGetEventInstances(args);

      case 'calendar_create':
        return await this.calendarService!.handleCreateCalendar(args);

      case 'calendar_delete':
        return await this.calendarService!.handleDeleteCalendar(args);

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown calendar tool: ${name}`);
    }
  }

  private async handleDriveTool(name: string, args: any): Promise<{ content: Array<TextContent | ImageContent> }> {
    await this.ensureServicesInitialized();

    switch (name) {
      case 'drive_list':
        return await this.driveService!.handleListFiles(args);

      case 'drive_get':
        return await this.driveService!.handleGetFile(args);

      case 'drive_upload':
        return await this.driveService!.handleUploadFile(args);

      case 'drive_download':
        return await this.driveService!.handleDownloadFile(args);

      case 'drive_mkdir':
        return await this.driveService!.handleCreateFolder(args);

      case 'drive_share':
        return await this.driveService!.handleShareFile(args);

      case 'drive_trash':
        return await this.driveService!.handleTrashFile(args);

      case 'drive_restore':
        return await this.driveService!.handleRestoreFile(args);

      case 'drive_copy':
        return await this.driveService!.handleCopyFile(args);

      case 'drive_batch_delete':
        return await this.driveService!.handleBatchDelete(args);

      case 'drive_revisions':
        return await this.driveService!.handleListRevisions(args);

      case 'drive_shared_drives':
        return await this.driveService!.handleListSharedDrives(args);

      case 'drive_shortcut':
        return await this.driveService!.handleCreateShortcut(args);

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown drive tool: ${name}`);
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

  private async handleDocsTool(name: string, args: any): Promise<{ content: Array<TextContent> }> {
    await this.ensureServicesInitialized();

    switch (name) {
      case 'docs_get':
        return await this.docsService!.handleGetDocument(args);

      case 'docs_create':
        return await this.docsService!.handleCreateDocument(args);

      case 'docs_export':
        return await this.docsService!.handleExportDocument(args);

      case 'docs_batch_update':
        return await this.docsService!.handleBatchUpdate(args);

      case 'docs_insert_text':
        return await this.docsService!.handleInsertText(args);

      case 'docs_replace_text':
        return await this.docsService!.handleReplaceAllText(args);

      case 'docs_insert_table':
        return await this.docsService!.handleInsertTable(args);

      case 'docs_insert_image':
        return await this.docsService!.handleInsertImage(args);

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown docs tool: ${name}`);
    }
  }

  private async handleSheetsTool(name: string, args: any): Promise<{ content: Array<TextContent> }> {
    await this.ensureServicesInitialized();

    switch (name) {
      case 'sheets_get':
        return await this.sheetsService!.handleGetSpreadsheet(args);

      case 'sheets_values_get':
        return await this.sheetsService!.handleGetValues(args);

      case 'sheets_values_update':
        return await this.sheetsService!.handleUpdateValues(args);

      case 'sheets_values_append':
        return await this.sheetsService!.handleAppendValues(args);

      case 'sheets_batch_update':
        return await this.sheetsService!.handleBatchUpdate(args);

      case 'sheets_add_sheet':
        return await this.sheetsService!.handleAddSheet(args);

      case 'sheets_delete_sheet':
        return await this.sheetsService!.handleDeleteSheet(args);

      case 'sheets_rename_sheet':
        return await this.sheetsService!.handleRenameSheet(args);

      case 'sheets_clear':
        return await this.sheetsService!.handleClearValues(args);

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown sheets tool: ${name}`);
    }
  }

  private async handleTasksTool(name: string, args: any): Promise<{ content: Array<TextContent> }> {
    await this.ensureServicesInitialized();

    switch (name) {
      case 'tasks_lists_list':
        return await this.tasksService!.handleListTaskLists(args);
      case 'tasks_lists_get':
        return await this.tasksService!.handleGetTaskList(args);
      case 'tasks_lists_create':
        return await this.tasksService!.handleCreateTaskList(args);
      case 'tasks_lists_update':
        return await this.tasksService!.handleUpdateTaskList(args);
      case 'tasks_lists_delete':
        return await this.tasksService!.handleDeleteTaskList(args);
      case 'tasks_list':
        return await this.tasksService!.handleListTasks(args);
      case 'tasks_get':
        return await this.tasksService!.handleGetTask(args);
      case 'tasks_create':
        return await this.tasksService!.handleCreateTask(args);
      case 'tasks_update':
        return await this.tasksService!.handleUpdateTask(args);
      case 'tasks_complete':
        return await this.tasksService!.handleCompleteTask(args);
      case 'tasks_move':
        return await this.tasksService!.handleMoveTask(args);
      case 'tasks_delete':
        return await this.tasksService!.handleDeleteTask(args);
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tasks tool: ${name}`);
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
    if (!this.gmailService || !this.calendarService || !this.driveService || !this.docsService || !this.sheetsService || !this.tasksService) {
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

      // Start the server
      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      // Initialize auth after stdio is connected so schema discovery works
      // even before local Google credentials are configured.
      try {
        await this.authManager.initialize();
      } catch (error) {
        this.logger.warn('Google auth is not initialized; auth-backed tool calls will fail until configured.', error);
      }

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

    this.gmailService = new GmailService(auth, this.cache, email);
    this.calendarService = new CalendarService(auth, this.cache, email);
    this.driveService = new DriveService(auth, this.cache, email);
    this.docsService = new DocsService(auth, this.cache, email);
    this.sheetsService = new SheetsService(auth, this.cache, email);
    this.tasksService = new TasksService(auth, this.cache, email);
    
    // Initialize template engine
    if (this.gmailService && this.gmailService.templateEngine) {
      await this.gmailService.templateEngine.initialize();
    }
  }

  private summarizeToolArgs(args: Record<string, unknown> | undefined): Record<string, unknown> {
    if (!args || typeof args !== 'object') {
      return { argKeys: [] };
    }

    const summary: Record<string, unknown> = {
      argKeys: Object.keys(args),
    };

    if (typeof args.email === 'string') {
      summary.email = args.email;
    }

    if (typeof args.messageId === 'string') {
      summary.messageId = args.messageId;
    }

    if (typeof args.attachmentId === 'string') {
      summary.attachmentId = args.attachmentId;
    }

    return summary;
  }
}

// Start the server
const server = new GmailCalendarMCPServer();
server.start().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
