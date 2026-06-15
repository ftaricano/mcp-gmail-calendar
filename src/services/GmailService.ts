import { gmail_v1, google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { TextContent, ImageContent, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../utils/Logger.js';
import { CacheManager } from '../utils/CacheManager.js';
import { TemplateEngine } from '../utils/TemplateEngine.js';
import { AttachmentHandler } from '../utils/AttachmentHandler.js';
import { EmailParser } from '../utils/EmailParser.js';
import fs from 'fs/promises';
import path from 'path';
import mime from 'mime-types';
import { sanitizeFilename } from '../utils/Validator.js';
import { z } from 'zod';

export interface EmailListOptions {
  maxResults?: number;
  pageToken?: string;
  labelIds?: string[];
  query?: string;
  includeSpamTrash?: boolean;
}

export interface EmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  subject: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  date: string;
  body?: string;
  bodyHtml?: string;
  attachments?: AttachmentInfo[];
  isRead: boolean;
  isImportant: boolean;
  isStarred: boolean;
}

export interface AttachmentInfo {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  body?: string;
  bodyHtml?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    contentType?: string;
  }>;
  templateId?: string;
  templateData?: Record<string, any>;
  importance?: 'low' | 'normal' | 'high';
  inReplyTo?: string;
  references?: string;
  threadId?: string;
}

export type DraftWriteOptions = Omit<SendEmailOptions, 'to' | 'subject'> & {
  to?: string | string[];
  subject?: string;
};

export interface DraftListOptions {
  maxResults?: number;
  pageToken?: string;
  query?: string;
}

export interface ThreadListOptions {
  maxResults?: number;
  pageToken?: string;
  query?: string;
  labelIds?: string[];
}

export type GmailApiLike = Pick<gmail_v1.Gmail, 'users'>;

const messageIdSchema = z.object({ messageId: z.string().min(1, 'messageId is required') });
const draftIdSchema = z.object({ draftId: z.string().min(1, 'draftId is required') });
const threadIdSchema = z.object({ threadId: z.string().min(1, 'threadId is required') });

// Shared compose field validators. A recipient/address field may be a single
// string or a non-empty array of strings; attachments must carry filename+content.
const addressField = z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]);
const attachmentSchema = z.object({
  filename: z.string().min(1, 'attachment.filename is required'),
  content: z.union([z.string(), z.instanceof(Buffer)]),
}).passthrough();
const composeFields = {
  cc: addressField.optional(),
  bcc: addressField.optional(),
  replyTo: z.string().min(1).optional(),
  attachments: z.array(attachmentSchema).optional(),
  importance: z.enum(['low', 'normal', 'high']).optional(),
};

const sendEmailSchema = z.object({
  to: addressField,
  subject: z.string().min(1, 'subject is required'),
  ...composeFields,
}).passthrough();
const draftWriteSchema = z.object({
  to: addressField.optional(),
  subject: z.string().optional(),
  ...composeFields,
}).passthrough();
const replyEmailSchema = z.object({
  messageId: z.string().min(1, 'messageId is required'),
  ...composeFields,
}).passthrough();
const threadModifySchema = z.object({
  threadId: z.string().min(1, 'threadId is required'),
  addLabelIds: z.array(z.string()).optional(),
  removeLabelIds: z.array(z.string()).optional(),
}).passthrough().refine(
  (val) => (val.addLabelIds?.length ?? 0) > 0 || (val.removeLabelIds?.length ?? 0) > 0,
  { message: 'at least one of addLabelIds or removeLabelIds must be a non-empty array', path: ['addLabelIds'] },
);
const deleteEmailSchema = z.object({
  messageId: z.string().min(1, 'messageId is required'),
  permanent: z.boolean().optional(),
}).passthrough();

function parseArgs<T>(schema: z.ZodType<T>, args: unknown): T {
  const result = schema.safeParse(args);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path?.length ? `${issue.path.join('.')}: ` : '';
    throw new McpError(ErrorCode.InvalidParams, `Invalid arguments. ${path}${issue?.message ?? 'validation failed'}`);
  }
  return result.data;
}

export function buildAttachmentDownloadPath(
  accountEmail: string,
  savePath: string,
  attachmentFilename?: string
): { downloadRoot: string; accountDir: string; resolvedPath: string } {
  const downloadRoot = path.resolve(process.env.ATTACHMENT_DOWNLOAD_DIR || './attachments/downloads');
  const accountDir = path.join(downloadRoot, sanitizeFilename(accountEmail.trim().toLowerCase()));
  const requestedName = typeof savePath === 'string' ? savePath.trim() : '';
  const fallbackName = attachmentFilename || 'attachment.bin';
  const safeName = sanitizeFilename(path.basename(requestedName || fallbackName)) || 'attachment.bin';

  return {
    downloadRoot,
    accountDir,
    resolvedPath: path.join(accountDir, safeName),
  };
}

export class GmailService {
  private gmail: GmailApiLike;
  private logger: Logger;
  private cache: CacheManager;
  public templateEngine: TemplateEngine;
  private attachmentHandler: AttachmentHandler;
  private emailParser: EmailParser;
  private accountEmail: string;

  constructor(auth: OAuth2Client, cache: CacheManager, accountEmail: string, gmailApi?: GmailApiLike) {
    this.gmail = gmailApi ?? google.gmail({ version: 'v1', auth });
    this.logger = new Logger('GmailService');
    this.cache = cache;
    this.accountEmail = accountEmail.trim().toLowerCase();
    this.templateEngine = new TemplateEngine();
    this.attachmentHandler = new AttachmentHandler();
    this.emailParser = new EmailParser();
  }

  async getAccountInfo(): Promise<any> {
    try {
      const cacheKey = 'gmail:profile';
      const cached = this.cache.getAccountCache(this.accountEmail, cacheKey);
      if (cached) return cached;

      const response = await this.gmail.users.getProfile({ userId: 'me' });
      const profile = response.data;
      
      const result = {
        email: profile.emailAddress,
        messagesTotal: profile.messagesTotal,
        threadsTotal: profile.threadsTotal,
        historyId: profile.historyId,
      };

      this.cache.setAccountCache(this.accountEmail, cacheKey, result);
      return result;
    } catch (error) {
      this.logger.error('Failed to get account info:', error);
      throw error;
    }
  }

  async listLabels(): Promise<any[]> {
    try {
      const cacheKey = 'gmail:labels';
      const cached = this.cache.getAccountCache(this.accountEmail, cacheKey);
      if (cached) return cached;

      const response = await this.gmail.users.labels.list({ userId: 'me' });
      const labels = response.data.labels || [];
      
      this.cache.setAccountCache(this.accountEmail, cacheKey, labels);
      return labels;
    } catch (error) {
      this.logger.error('Failed to list labels:', error);
      throw error;
    }
  }

  async listEmails(options: EmailListOptions = {}): Promise<{ emails: EmailMessage[], nextPageToken?: string }> {
    try {
      const {
        maxResults = parseInt(process.env.MAX_EMAIL_RESULTS || '50'),
        pageToken,
        labelIds,
        query,
        includeSpamTrash = false,
      } = options;

      const response = await this.gmail.users.messages.list({
        userId: 'me',
        maxResults,
        pageToken,
        labelIds,
        q: query,
        includeSpamTrash,
      });

      const messages = response.data.messages || [];
      const emails: EmailMessage[] = [];

      // Fetch details for each message
      for (const message of messages) {
        try {
          const email = await this.getEmailById(message.id!);
          emails.push(email);
        } catch (error) {
          this.logger.warn(`Failed to fetch email ${message.id}:`, error);
        }
      }

      return {
        emails,
        nextPageToken: response.data.nextPageToken || undefined,
      };
    } catch (error) {
      this.logger.error('Failed to list emails:', error);
      throw error;
    }
  }

  async getEmailById(messageId: string): Promise<EmailMessage> {
    try {
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      const message = response.data;
      return this.emailParser.parseGmailMessage(message);
    } catch (error) {
      this.logger.error(`Failed to get email ${messageId}:`, error);
      throw error;
    }
  }

  /**
   * Resolves template/HTML content for an outgoing message before it is handed
   * to buildEmailMessage. Shared by sendEmail, createDraft and updateDraft so
   * that drafts honour templateId/templateData and default-template wrapping
   * identically to sends.
   */
  private async prepareSendContent<T extends DraftWriteOptions>(options: T): Promise<T> {
    let htmlContent = options.bodyHtml;

    // Apply template if specified
    if (options.templateId) {
      htmlContent = await this.templateEngine.render(
        options.templateId,
        options.templateData || {}
      );
    } else if (options.bodyHtml) {
      // Apply default template to HTML content
      htmlContent = await this.templateEngine.wrapInDefaultTemplate(
        options.bodyHtml,
        options.subject
      );
    }

    return {
      ...options,
      bodyHtml: htmlContent,
    };
  }

  async sendEmail(options: SendEmailOptions): Promise<string> {
    try {
      const prepared = await this.prepareSendContent(options);

      // Build email message
      const message = await this.buildEmailMessage(prepared);

      // Send email
      const response = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: message,
          ...(options.threadId ? { threadId: options.threadId } : {}),
        },
      });

      return response.data.id || '';
    } catch (error) {
      this.logger.error('Failed to send email:', error);
      throw error;
    }
  }

  private async buildEmailMessage(options: DraftWriteOptions): Promise<string> {
    const boundary = `boundary_${Date.now()}`;
    const to = options.to ? (Array.isArray(options.to) ? options.to : [options.to]) : [];
    const cc = options.cc ? (Array.isArray(options.cc) ? options.cc : [options.cc]) : [];
    const bcc = options.bcc ? (Array.isArray(options.bcc) ? options.bcc : [options.bcc]) : [];

    let messageParts = [
      `To: ${to.join(', ')}`,
      `Subject: ${options.subject ?? ''}`,
      `MIME-Version: 1.0`,
    ];

    if (cc.length > 0) {
      messageParts.push(`Cc: ${cc.join(', ')}`);
    }
    if (bcc.length > 0) {
      messageParts.push(`Bcc: ${bcc.join(', ')}`);
    }
    if (options.replyTo) {
      messageParts.push(`Reply-To: ${options.replyTo}`);
    }
    if (options.inReplyTo) {
      messageParts.push(`In-Reply-To: ${options.inReplyTo}`);
    }
    if (options.references) {
      messageParts.push(`References: ${options.references}`);
    }
    if (options.importance) {
      const importanceMap = { low: '5', normal: '3', high: '1' };
      messageParts.push(`X-Priority: ${importanceMap[options.importance]}`);
      messageParts.push(`Importance: ${options.importance}`);
    }

    // Handle attachments
    if (options.attachments && options.attachments.length > 0) {
      messageParts.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
      messageParts.push('');
      messageParts.push(`--${boundary}`);
    }

    // Add body content
    if (options.bodyHtml && options.body) {
      const subBoundary = `sub_${boundary}`;
      messageParts.push(`Content-Type: multipart/alternative; boundary="${subBoundary}"`);
      messageParts.push('');
      
      // Text part
      messageParts.push(`--${subBoundary}`);
      messageParts.push('Content-Type: text/plain; charset=UTF-8');
      messageParts.push('Content-Transfer-Encoding: base64');
      messageParts.push('');
      messageParts.push(Buffer.from(options.body).toString('base64'));
      
      // HTML part
      messageParts.push(`--${subBoundary}`);
      messageParts.push('Content-Type: text/html; charset=UTF-8');
      messageParts.push('Content-Transfer-Encoding: base64');
      messageParts.push('');
      messageParts.push(Buffer.from(options.bodyHtml).toString('base64'));
      
      messageParts.push(`--${subBoundary}--`);
    } else if (options.bodyHtml) {
      messageParts.push('Content-Type: text/html; charset=UTF-8');
      messageParts.push('Content-Transfer-Encoding: base64');
      messageParts.push('');
      messageParts.push(Buffer.from(options.bodyHtml).toString('base64'));
    } else if (options.body) {
      messageParts.push('Content-Type: text/plain; charset=UTF-8');
      messageParts.push('Content-Transfer-Encoding: base64');
      messageParts.push('');
      messageParts.push(Buffer.from(options.body).toString('base64'));
    }

    // Add attachments
    if (options.attachments) {
      for (const attachment of options.attachments) {
        messageParts.push(`--${boundary}`);
        const contentType = attachment.contentType || mime.lookup(attachment.filename) || 'application/octet-stream';
        messageParts.push(`Content-Type: ${contentType}; name="${attachment.filename}"`);
        messageParts.push(`Content-Disposition: attachment; filename="${attachment.filename}"`);
        messageParts.push('Content-Transfer-Encoding: base64');
        messageParts.push('');
        
        const content = typeof attachment.content === 'string' 
          ? attachment.content 
          : attachment.content.toString('base64');
        messageParts.push(content);
      }
      messageParts.push(`--${boundary}--`);
    }

    const message = messageParts.join('\r\n');
    return Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async replyToEmail(messageId: string, options: Omit<SendEmailOptions, 'to'>): Promise<string> {
    try {
      const originalEmail = await this.getEmailById(messageId);
      
      const replyOptions: SendEmailOptions = {
        ...options,
        to: originalEmail.from,
        subject: originalEmail.subject.startsWith('Re:') 
          ? originalEmail.subject 
          : `Re: ${originalEmail.subject}`,
      };

      // Add In-Reply-To and References headers
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'metadata',
        metadataHeaders: ['Message-ID', 'References'],
      });

      const headers = response.data.payload?.headers || [];
      const messageIdHeader = headers.find((h) => h.name?.toLowerCase() === 'message-id')?.value;
      const origReferences = headers.find((h) => h.name?.toLowerCase() === 'references')?.value;

      if (messageIdHeader) {
        replyOptions.inReplyTo = messageIdHeader;
        replyOptions.references = (origReferences ? `${origReferences} ` : '') + messageIdHeader;
      }
      replyOptions.threadId = originalEmail.threadId;

      return await this.sendEmail(replyOptions);
    } catch (error) {
      this.logger.error('Failed to reply to email:', error);
      throw error;
    }
  }

  async forwardEmail(messageId: string, options: SendEmailOptions): Promise<string> {
    try {
      const originalEmail = await this.getEmailById(messageId);
      
      const forwardOptions: SendEmailOptions = {
        ...options,
        subject: originalEmail.subject.startsWith('Fwd:') 
          ? originalEmail.subject 
          : `Fwd: ${originalEmail.subject}`,
      };

      // Add original message content
      const originalContent = `
        <div style="border-left: 2px solid #ccc; padding-left: 10px; margin-top: 20px;">
          <p><strong>---------- Forwarded message ----------</strong></p>
          <p><strong>From:</strong> ${originalEmail.from}</p>
          <p><strong>Date:</strong> ${originalEmail.date}</p>
          <p><strong>Subject:</strong> ${originalEmail.subject}</p>
          <p><strong>To:</strong> ${originalEmail.to.join(', ')}</p>
          <br/>
          ${originalEmail.bodyHtml || originalEmail.body || ''}
        </div>
      `;

      if (forwardOptions.bodyHtml) {
        forwardOptions.bodyHtml += originalContent;
      } else {
        forwardOptions.bodyHtml = (forwardOptions.body || '') + originalContent;
      }

      return await this.sendEmail(forwardOptions);
    } catch (error) {
      this.logger.error('Failed to forward email:', error);
      throw error;
    }
  }

  async deleteEmail(messageId: string): Promise<void> {
    try {
      await this.gmail.users.messages.trash({
        userId: 'me',
        id: messageId,
      });
    } catch (error) {
      this.logger.error('Failed to delete email:', error);
      throw error;
    }
  }

  async archiveEmail(messageId: string): Promise<void> {
    try {
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: ['INBOX'],
        },
      });
    } catch (error) {
      this.logger.error('Failed to archive email:', error);
      throw error;
    }
  }

  async deleteEmailPermanently(messageId: string): Promise<void> {
    try {
      await this.gmail.users.messages.delete({
        userId: 'me',
        id: messageId,
      });
    } catch (error) {
      this.logger.error('Failed to permanently delete email:', error);
      throw error;
    }
  }

  // Drafts
  async listDrafts(options: DraftListOptions = {}): Promise<{ drafts: any[]; nextPageToken?: string }> {
    try {
      const response = await this.gmail.users.drafts.list({
        userId: 'me',
        maxResults: options.maxResults,
        pageToken: options.pageToken,
        q: options.query,
      });
      return {
        drafts: response.data.drafts || [],
        nextPageToken: response.data.nextPageToken || undefined,
      };
    } catch (error) {
      this.logger.error('Failed to list drafts:', error);
      throw error;
    }
  }

  async getDraft(draftId: string): Promise<any> {
    try {
      const response = await this.gmail.users.drafts.get({
        userId: 'me',
        id: draftId,
        format: 'full',
      });
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get draft ${draftId}:`, error);
      throw error;
    }
  }

  async createDraft(options: DraftWriteOptions): Promise<string> {
    try {
      const prepared = await this.prepareSendContent(options);
      const raw = await this.buildEmailMessage(prepared);
      const response = await this.gmail.users.drafts.create({
        userId: 'me',
        requestBody: {
          message: {
            raw,
            ...(options.threadId ? { threadId: options.threadId } : {}),
          },
        },
      });
      return response.data.id || '';
    } catch (error) {
      this.logger.error('Failed to create draft:', error);
      throw error;
    }
  }

  async updateDraft(draftId: string, options: DraftWriteOptions): Promise<string> {
    try {
      const prepared = await this.prepareSendContent(options);
      const raw = await this.buildEmailMessage(prepared);
      const response = await this.gmail.users.drafts.update({
        userId: 'me',
        id: draftId,
        requestBody: {
          message: {
            raw,
            ...(options.threadId ? { threadId: options.threadId } : {}),
          },
        },
      });
      return response.data.id || '';
    } catch (error) {
      this.logger.error(`Failed to update draft ${draftId}:`, error);
      throw error;
    }
  }

  async sendDraft(draftId: string): Promise<string> {
    try {
      const response = await this.gmail.users.drafts.send({
        userId: 'me',
        requestBody: { id: draftId },
      });
      return response.data.id || '';
    } catch (error) {
      this.logger.error(`Failed to send draft ${draftId}:`, error);
      throw error;
    }
  }

  async deleteDraft(draftId: string): Promise<void> {
    try {
      await this.gmail.users.drafts.delete({
        userId: 'me',
        id: draftId,
      });
    } catch (error) {
      this.logger.error(`Failed to delete draft ${draftId}:`, error);
      throw error;
    }
  }

  // Threads
  async listThreads(options: ThreadListOptions = {}): Promise<{ threads: any[]; nextPageToken?: string }> {
    try {
      const response = await this.gmail.users.threads.list({
        userId: 'me',
        maxResults: options.maxResults,
        pageToken: options.pageToken,
        q: options.query,
        labelIds: options.labelIds,
      });
      return {
        threads: response.data.threads || [],
        nextPageToken: response.data.nextPageToken || undefined,
      };
    } catch (error) {
      this.logger.error('Failed to list threads:', error);
      throw error;
    }
  }

  async getThread(threadId: string): Promise<any> {
    try {
      const response = await this.gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'full',
      });
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get thread ${threadId}:`, error);
      throw error;
    }
  }

  async modifyThread(
    threadId: string,
    options: { addLabelIds?: string[]; removeLabelIds?: string[] },
  ): Promise<any> {
    try {
      const response = await this.gmail.users.threads.modify({
        userId: 'me',
        id: threadId,
        requestBody: {
          addLabelIds: options.addLabelIds,
          removeLabelIds: options.removeLabelIds,
        },
      });
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to modify thread ${threadId}:`, error);
      throw error;
    }
  }

  async trashThread(threadId: string): Promise<void> {
    try {
      await this.gmail.users.threads.trash({
        userId: 'me',
        id: threadId,
      });
    } catch (error) {
      this.logger.error(`Failed to trash thread ${threadId}:`, error);
      throw error;
    }
  }

  async deleteThread(threadId: string): Promise<void> {
    try {
      await this.gmail.users.threads.delete({
        userId: 'me',
        id: threadId,
      });
    } catch (error) {
      this.logger.error(`Failed to delete thread ${threadId}:`, error);
      throw error;
    }
  }

  async markAsRead(messageId: string): Promise<void> {
    try {
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: ['UNREAD'],
        },
      });
    } catch (error) {
      this.logger.error('Failed to mark email as read:', error);
      throw error;
    }
  }

  async markAsUnread(messageId: string): Promise<void> {
    try {
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          addLabelIds: ['UNREAD'],
        },
      });
    } catch (error) {
      this.logger.error('Failed to mark email as unread:', error);
      throw error;
    }
  }

  async searchEmails(query: string, maxResults: number = 50): Promise<EmailMessage[]> {
    try {
      const result = await this.listEmails({ query, maxResults });
      return result.emails;
    } catch (error) {
      this.logger.error('Failed to search emails:', error);
      throw error;
    }
  }

  async createLabel(name: string, options?: { backgroundColor?: string; textColor?: string }): Promise<string> {
    try {
      const response = await this.gmail.users.labels.create({
        userId: 'me',
        requestBody: {
          name,
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show',
          color: options ? {
            backgroundColor: options.backgroundColor,
            textColor: options.textColor,
          } : undefined,
        },
      });

      // Clear labels cache
      this.cache.deleteAccountCache(this.accountEmail, 'gmail:labels');
      
      return response.data.id || '';
    } catch (error) {
      this.logger.error('Failed to create label:', error);
      throw error;
    }
  }

  async addLabel(messageId: string, labelId: string): Promise<void> {
    try {
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          addLabelIds: [labelId],
        },
      });
    } catch (error) {
      this.logger.error('Failed to add label:', error);
      throw error;
    }
  }

  async removeLabel(messageId: string, labelId: string): Promise<void> {
    try {
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: [labelId],
        },
      });
    } catch (error) {
      this.logger.error('Failed to remove label:', error);
      throw error;
    }
  }

  async getAttachment(messageId: string, attachmentId: string): Promise<Buffer> {
    try {
      const response = await this.gmail.users.messages.attachments.get({
        userId: 'me',
        messageId,
        id: attachmentId,
      });

      const data = response.data.data || '';
      return Buffer.from(data, 'base64');
    } catch (error) {
      this.logger.error('Failed to get attachment:', error);
      throw error;
    }
  }

  async listAttachments(messageId: string): Promise<AttachmentInfo[]> {
    const email = await this.getEmailById(messageId);
    return email.attachments || [];
  }

  async downloadAttachment(
    messageId: string,
    attachmentId: string,
    savePath: string,
  ): Promise<{ path: string; filename?: string; size: number }> {
    const attachment = await this.getAttachment(messageId, attachmentId);
    const attachmentInfo = await this.getAttachmentInfo(messageId, attachmentId);
    const resolvedPath = await this.resolveAttachmentSavePath(savePath, attachmentInfo?.filename);
    await fs.writeFile(resolvedPath, attachment);
    return {
      path: resolvedPath,
      filename: attachmentInfo?.filename,
      size: attachment.length,
    };
  }

  // Handler methods for MCP tools
  async handleListEmails(args: any): Promise<{ content: Array<TextContent> }> {
    const emails = await this.listEmails(args);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(emails, null, 2),
      }],
    };
  }

  async handleReadEmail(args: any): Promise<{ content: Array<TextContent> }> {
    const email = await this.getEmailById(args.messageId);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(email, null, 2),
      }],
    };
  }

  async handleSendEmail(args: any): Promise<{ content: Array<TextContent> }> {
    parseArgs(sendEmailSchema, args);
    const messageId = await this.sendEmail(args);
    return {
      content: [{
        type: 'text',
        text: `Email sent successfully. Message ID: ${messageId}`,
      }],
    };
  }

  async handleReplyToEmail(args: any): Promise<{ content: Array<TextContent> }> {
    parseArgs(replyEmailSchema, args);
    const messageId = await this.replyToEmail(args.messageId, args);
    return {
      content: [{
        type: 'text',
        text: `Reply sent successfully. Message ID: ${messageId}`,
      }],
    };
  }

  async handleForwardEmail(args: any): Promise<{ content: Array<TextContent> }> {
    const messageId = await this.forwardEmail(args.messageId, args);
    return {
      content: [{
        type: 'text',
        text: `Email forwarded successfully. Message ID: ${messageId}`,
      }],
    };
  }

  async handleDeleteEmail(args: any): Promise<{ content: Array<TextContent> }> {
    const parsed = parseArgs(deleteEmailSchema, args);
    if (parsed.permanent) {
      await this.deleteEmailPermanently(parsed.messageId);
      return {
        content: [{
          type: 'text',
          text: `Email permanently deleted`,
        }],
      };
    }
    await this.deleteEmail(parsed.messageId);
    return {
      content: [{
        type: 'text',
        text: `Email deleted successfully`,
      }],
    };
  }

  async handleArchiveEmail(args: any): Promise<{ content: Array<TextContent> }> {
    const parsed = parseArgs(messageIdSchema, args);
    await this.archiveEmail(parsed.messageId);
    return {
      content: [{
        type: 'text',
        text: `Email archived successfully`,
      }],
    };
  }

  async handleListDrafts(args: any): Promise<{ content: Array<TextContent> }> {
    const drafts = await this.listDrafts(args || {});
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(drafts, null, 2),
      }],
    };
  }

  async handleGetDraft(args: any): Promise<{ content: Array<TextContent> }> {
    const parsed = parseArgs(draftIdSchema, args);
    const draft = await this.getDraft(parsed.draftId);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(draft, null, 2),
      }],
    };
  }

  async handleCreateDraft(args: any): Promise<{ content: Array<TextContent> }> {
    parseArgs(draftWriteSchema, args);
    const draftId = await this.createDraft(args);
    return {
      content: [{
        type: 'text',
        text: `Draft created successfully. Draft ID: ${draftId}`,
      }],
    };
  }

  async handleUpdateDraft(args: any): Promise<{ content: Array<TextContent> }> {
    const parsed = parseArgs(draftIdSchema, args);
    parseArgs(draftWriteSchema, args);
    const draftId = await this.updateDraft(parsed.draftId, args);
    return {
      content: [{
        type: 'text',
        text: `Draft updated successfully. Draft ID: ${draftId}`,
      }],
    };
  }

  async handleSendDraft(args: any): Promise<{ content: Array<TextContent> }> {
    const parsed = parseArgs(draftIdSchema, args);
    const messageId = await this.sendDraft(parsed.draftId);
    return {
      content: [{
        type: 'text',
        text: `Draft sent successfully. Message ID: ${messageId}`,
      }],
    };
  }

  async handleDeleteDraft(args: any): Promise<{ content: Array<TextContent> }> {
    const parsed = parseArgs(draftIdSchema, args);
    await this.deleteDraft(parsed.draftId);
    return {
      content: [{
        type: 'text',
        text: `Draft deleted successfully`,
      }],
    };
  }

  async handleListThreads(args: any): Promise<{ content: Array<TextContent> }> {
    const threads = await this.listThreads(args || {});
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(threads, null, 2),
      }],
    };
  }

  async handleGetThread(args: any): Promise<{ content: Array<TextContent> }> {
    const parsed = parseArgs(threadIdSchema, args);
    const thread = await this.getThread(parsed.threadId);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(thread, null, 2),
      }],
    };
  }

  async handleModifyThread(args: any): Promise<{ content: Array<TextContent> }> {
    const parsed = parseArgs(threadModifySchema, args);
    const thread = await this.modifyThread(parsed.threadId, {
      addLabelIds: parsed.addLabelIds,
      removeLabelIds: parsed.removeLabelIds,
    });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(thread, null, 2),
      }],
    };
  }

  async handleTrashThread(args: any): Promise<{ content: Array<TextContent> }> {
    const parsed = parseArgs(threadIdSchema, args);
    await this.trashThread(parsed.threadId);
    return {
      content: [{
        type: 'text',
        text: `Thread moved to trash`,
      }],
    };
  }

  async handleDeleteThread(args: any): Promise<{ content: Array<TextContent> }> {
    const parsed = parseArgs(threadIdSchema, args);
    await this.deleteThread(parsed.threadId);
    return {
      content: [{
        type: 'text',
        text: `Thread permanently deleted`,
      }],
    };
  }

  async handleMarkAsRead(args: any): Promise<{ content: Array<TextContent> }> {
    await this.markAsRead(args.messageId);
    return {
      content: [{
        type: 'text',
        text: `Email marked as read`,
      }],
    };
  }

  async handleMarkAsUnread(args: any): Promise<{ content: Array<TextContent> }> {
    await this.markAsUnread(args.messageId);
    return {
      content: [{
        type: 'text',
        text: `Email marked as unread`,
      }],
    };
  }

  async handleSearchEmails(args: any): Promise<{ content: Array<TextContent> }> {
    const emails = await this.searchEmails(args.query, args.maxResults);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(emails, null, 2),
      }],
    };
  }

  async handleMoveEmail(args: any): Promise<{ content: Array<TextContent> }> {
    // Implementation for moving emails between folders/labels
    await this.removeLabel(args.messageId, args.fromLabelId);
    await this.addLabel(args.messageId, args.toLabelId);
    return {
      content: [{
        type: 'text',
        text: `Email moved successfully`,
      }],
    };
  }

  async handleLabelEmail(args: any): Promise<{ content: Array<TextContent> }> {
    await this.addLabel(args.messageId, args.labelId);
    return {
      content: [{
        type: 'text',
        text: `Label added successfully`,
      }],
    };
  }

  async handleCreateLabel(args: any): Promise<{ content: Array<TextContent> }> {
    const labelId = await this.createLabel(args.name, args.options);
    return {
      content: [{
        type: 'text',
        text: `Label created successfully. ID: ${labelId}`,
      }],
    };
  }

  async handleListLabels(): Promise<{ content: Array<TextContent> }> {
    const labels = await this.listLabels();
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(labels, null, 2),
      }],
    };
  }

  async handleBatchOperations(args: any): Promise<{ content: Array<TextContent> }> {
    const results: any[] = [];
    
    for (const operation of args.operations) {
      try {
        switch (operation.type) {
          case 'markAsRead':
            await this.markAsRead(operation.messageId);
            results.push({ messageId: operation.messageId, status: 'success', action: 'markAsRead' });
            break;
          case 'markAsUnread':
            await this.markAsUnread(operation.messageId);
            results.push({ messageId: operation.messageId, status: 'success', action: 'markAsUnread' });
            break;
          case 'delete':
            await this.deleteEmail(operation.messageId);
            results.push({ messageId: operation.messageId, status: 'success', action: 'delete' });
            break;
          case 'addLabel':
            await this.addLabel(operation.messageId, operation.labelId);
            results.push({ messageId: operation.messageId, status: 'success', action: 'addLabel' });
            break;
          case 'removeLabel':
            await this.removeLabel(operation.messageId, operation.labelId);
            results.push({ messageId: operation.messageId, status: 'success', action: 'removeLabel' });
            break;
        }
      } catch (error) {
        results.push({ 
          messageId: operation.messageId, 
          status: 'error', 
          action: operation.type,
          error: (error as Error).message 
        });
      }
    }
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(results, null, 2),
      }],
    };
  }

  async handleListAttachments(args: any): Promise<{ content: Array<TextContent> }> {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(await this.listAttachments(args.messageId), null, 2),
      }],
    };
  }

  async handleDownloadAttachment(args: any): Promise<{ content: Array<TextContent | ImageContent> }> {
    if (args.savePath) {
      const downloaded = await this.downloadAttachment(args.messageId, args.attachmentId, args.savePath);
      return {
        content: [{
          type: 'text',
          text: `Attachment saved to sandbox path: ${downloaded.path}`,
        }],
      };
    }

    const attachment = await this.getAttachment(args.messageId, args.attachmentId);
    const attachmentInfo = await this.getAttachmentInfo(args.messageId, args.attachmentId);
    
    // Return base64 encoded content
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          attachmentId: args.attachmentId,
          filename: attachmentInfo?.filename,
          content: attachment.toString('base64'),
          size: attachment.length,
        }, null, 2),
      }],
    };
  }

  async handleListTemplates(): Promise<{ content: Array<TextContent> }> {
    const templates = await this.templateEngine.listTemplates();
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(templates, null, 2),
      }],
    };
  }

  async handleRenderTemplate(args: any): Promise<{ content: Array<TextContent> }> {
    const html = await this.templateEngine.render(args.templateId, args.data || {});
    return {
      content: [{
        type: 'text',
        text: html,
      }],
    };
  }

  async handleCreateTemplate(args: any): Promise<{ content: Array<TextContent> }> {
    await this.templateEngine.createTemplate(args.name, args.content, args.description);
    return {
      content: [{
        type: 'text',
        text: `Template '${args.name}' created successfully`,
      }],
    };
  }

  private async getAttachmentInfo(messageId: string, attachmentId: string): Promise<AttachmentInfo | undefined> {
    const email = await this.getEmailById(messageId);
    return email.attachments?.find((item) => item.id === attachmentId);
  }

  private async resolveAttachmentSavePath(savePath: string, attachmentFilename?: string): Promise<string> {
    const { accountDir, resolvedPath } = buildAttachmentDownloadPath(
      this.accountEmail,
      savePath,
      attachmentFilename
    );

    await fs.mkdir(accountDir, { recursive: true });

    return resolvedPath;
  }
}
