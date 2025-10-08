import { gmail_v1 } from 'googleapis';
import { htmlToText } from 'html-to-text';
import sanitizeHtml from 'sanitize-html';
import { Logger } from './Logger.js';
import { EmailMessage, AttachmentInfo } from '../services/GmailService.js';

export class EmailParser {
  private logger: Logger;
  private enableHtmlSanitization: boolean;

  constructor() {
    this.logger = new Logger('EmailParser');
    this.enableHtmlSanitization = process.env.ENABLE_HTML_SANITIZATION === 'true';
  }

  parseGmailMessage(message: gmail_v1.Schema$Message): EmailMessage {
    try {
      const headers = this.extractHeaders(message.payload?.headers || []);
      const body = this.extractBody(message.payload);
      const attachments = this.extractAttachments(message.payload);

      const email: EmailMessage = {
        id: message.id || '',
        threadId: message.threadId || '',
        labelIds: message.labelIds || [],
        snippet: message.snippet || '',
        subject: headers.subject || '',
        from: headers.from || '',
        to: this.parseEmailAddresses(headers.to || ''),
        cc: headers.cc ? this.parseEmailAddresses(headers.cc) : undefined,
        bcc: headers.bcc ? this.parseEmailAddresses(headers.bcc) : undefined,
        date: headers.date || '',
        body: body.text,
        bodyHtml: body.html,
        attachments: attachments.length > 0 ? attachments : undefined,
        isRead: !(message.labelIds || []).includes('UNREAD'),
        isImportant: (message.labelIds || []).includes('IMPORTANT'),
        isStarred: (message.labelIds || []).includes('STARRED'),
      };

      return email;

    } catch (error) {
      this.logger.error('Failed to parse Gmail message:', error);
      throw error;
    }
  }

  private extractHeaders(headers: gmail_v1.Schema$MessagePartHeader[]): Record<string, string> {
    const headerMap: Record<string, string> = {};
    
    for (const header of headers) {
      if (header.name && header.value) {
        headerMap[header.name.toLowerCase()] = header.value;
      }
    }

    return headerMap;
  }

  private extractBody(payload: gmail_v1.Schema$MessagePart | undefined): { text?: string; html?: string } {
    if (!payload) return {};

    const body: { text?: string; html?: string } = {};

    // Handle single part message
    if (payload.body?.data) {
      const content = this.decodeBase64(payload.body.data);
      
      if (payload.mimeType === 'text/plain') {
        body.text = content;
      } else if (payload.mimeType === 'text/html') {
        body.html = this.sanitizeHtml(content);
        body.text = this.htmlToPlainText(content);
      }
    }

    // Handle multipart message
    if (payload.parts && payload.parts.length > 0) {
      for (const part of payload.parts) {
        const partBody = this.extractBody(part);
        
        if (partBody.text && !body.text) {
          body.text = partBody.text;
        }
        if (partBody.html && !body.html) {
          body.html = partBody.html;
        }
      }
    }

    // If we have HTML but no text, convert HTML to text
    if (body.html && !body.text) {
      body.text = this.htmlToPlainText(body.html);
    }

    return body;
  }

  private extractAttachments(payload: gmail_v1.Schema$MessagePart | undefined): AttachmentInfo[] {
    if (!payload) return [];

    const attachments: AttachmentInfo[] = [];

    // Check current part
    if (payload.body?.attachmentId && payload.filename) {
      attachments.push({
        id: payload.body.attachmentId,
        filename: payload.filename,
        mimeType: payload.mimeType || 'application/octet-stream',
        size: payload.body.size || 0,
      });
    }

    // Check sub-parts
    if (payload.parts && payload.parts.length > 0) {
      for (const part of payload.parts) {
        const subAttachments = this.extractAttachments(part);
        attachments.push(...subAttachments);
      }
    }

    return attachments;
  }

  private decodeBase64(data: string): string {
    try {
      // Gmail uses URL-safe base64 encoding
      const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
      const buffer = Buffer.from(base64, 'base64');
      return buffer.toString('utf-8');
    } catch (error) {
      this.logger.warn('Failed to decode base64 content:', error);
      return '';
    }
  }

  private sanitizeHtml(html: string): string {
    if (!this.enableHtmlSanitization) {
      return html;
    }

    return sanitizeHtml(html, {
      allowedTags: [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'p', 'br', 'hr',
        'strong', 'b', 'em', 'i', 'u', 's', 'del',
        'ul', 'ol', 'li',
        'a', 'img',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'div', 'span', 'blockquote', 'pre', 'code',
      ],
      allowedAttributes: {
        'a': ['href', 'title', 'target'],
        'img': ['src', 'alt', 'title', 'width', 'height'],
        'div': ['style'],
        'span': ['style'],
        'p': ['style'],
        'table': ['border', 'cellpadding', 'cellspacing', 'width'],
        'td': ['colspan', 'rowspan', 'align', 'valign'],
        'th': ['colspan', 'rowspan', 'align', 'valign'],
      },
      allowedStyles: {
        '*': {
          'color': [/^#(0x)?[0-9a-f]+$/i, /^[a-z]+$/i],
          'background-color': [/^#(0x)?[0-9a-f]+$/i, /^[a-z]+$/i],
          'font-size': [/^\d+(?:px|em|rem|%)$/],
          'font-weight': [/^(?:bold|normal|\d+)$/],
          'text-align': [/^(?:left|right|center|justify)$/],
          'text-decoration': [/^(?:none|underline|line-through)$/],
          'margin': [/^\d+(?:px|em|rem|%)\s*(?:\d+(?:px|em|rem|%)\s*)*$/],
          'padding': [/^\d+(?:px|em|rem|%)\s*(?:\d+(?:px|em|rem|%)\s*)*$/],
        },
      },
      selfClosing: ['img', 'br', 'hr'],
      allowedSchemes: ['http', 'https', 'mailto', 'tel'],
      disallowedTagsMode: 'discard',
      allowedIframeDomains: [],
    });
  }

  private htmlToPlainText(html: string): string {
    try {
      return htmlToText(html, {
        wordwrap: 130,
        preserveNewlines: true,
        selectors: [ { selector: 'img', format: 'skip' } ],
      });
    } catch (error) {
      this.logger.warn('Failed to convert HTML to plain text:', error);
      return html.replace(/<[^>]*>/g, ''); // Simple tag removal as fallback
    }
  }

  private parseEmailAddresses(addressString: string): string[] {
    if (!addressString) return [];

    // Simple email address extraction
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = addressString.match(emailRegex) || [];
    
    return [...new Set(matches)]; // Remove duplicates
  }

  // Utility methods for email content processing
  extractUrls(text: string): string[] {
    const urlRegex = /https?:\/\/[^\s<>"\[\]{}|\\^`]+/g;
    return text.match(urlRegex) || [];
  }

  extractPhoneNumbers(text: string): string[] {
    const phoneRegex = /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
    return text.match(phoneRegex) || [];
  }

  extractEmailAddresses(text: string): string[] {
    return this.parseEmailAddresses(text);
  }

  isAutoReply(message: gmail_v1.Schema$Message): boolean {
    const headers = this.extractHeaders(message.payload?.headers || []);
    
    // Check for auto-reply indicators
    const autoReplyHeaders = [
      'x-auto-response-suppress',
      'x-autorespond',
      'auto-submitted',
    ];

    for (const header of autoReplyHeaders) {
      if (headers[header]) {
        return true;
      }
    }

    // Check subject for common auto-reply patterns
    const subject = headers.subject?.toLowerCase() || '';
    const autoReplySubjects = [
      'out of office',
      'automatic reply',
      'auto-reply',
      'vacation response',
      're: out of office',
    ];

    return autoReplySubjects.some(pattern => subject.includes(pattern));
  }

  isNewsletter(message: gmail_v1.Schema$Message): boolean {
    const headers = this.extractHeaders(message.payload?.headers || []);
    
    // Check for newsletter indicators
    const listHeaders = [
      'list-unsubscribe',
      'list-id',
      'mailing-list',
      'precedence',
    ];

    for (const header of listHeaders) {
      if (headers[header]) {
        return true;
      }
    }

    // Check if message has unsubscribe links
    const body = this.extractBody(message.payload);
    const content = (body.text || body.html || '').toLowerCase();
    
    return content.includes('unsubscribe') || 
           content.includes('newsletter') ||
           content.includes('mailing list');
  }

  getMessagePriority(message: gmail_v1.Schema$Message): 'high' | 'normal' | 'low' {
    const headers = this.extractHeaders(message.payload?.headers || []);
    
    const priority = headers['x-priority'] || headers['priority'] || headers['importance'];
    
    if (priority) {
      const priorityNum = parseInt(priority);
      if (priorityNum <= 2) return 'high';
      if (priorityNum >= 4) return 'low';
    }

    return 'normal';
  }

  extractMessageMetadata(message: gmail_v1.Schema$Message) {
    const headers = this.extractHeaders(message.payload?.headers || []);
    
    return {
      messageId: headers['message-id'],
      references: headers['references']?.split(/\s+/) || [],
      inReplyTo: headers['in-reply-to'],
      deliveredTo: headers['delivered-to'],
      returnPath: headers['return-path'],
      received: headers['received'],
      contentType: message.payload?.mimeType,
      isAutoReply: this.isAutoReply(message),
      isNewsletter: this.isNewsletter(message),
      priority: this.getMessagePriority(message),
    };
  }
}