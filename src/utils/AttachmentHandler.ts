import fs from 'fs/promises';
import path from 'path';
import dns from 'node:dns';
import net from 'node:net';
import mime from 'mime-types';
import { Agent } from 'undici';
import { Logger } from './Logger.js';
import {
  validateAttachmentSize,
  validateAttachmentType,
  sanitizeFilename,
  assertSafePublicUrl,
  isBlockedIp,
  UnsafeUrlError,
} from './Validator.js';

type DnsLookupAll = (
  hostname: string,
  options: { all: true },
) => Promise<Array<{ address: string; family: number }>>;

export interface SafeFetchOptions {
  maxRedirects?: number;
  // Injection points for testing; default to the real implementations.
  fetchImpl?: typeof fetch;
  lookupAll?: DnsLookupAll;
}

const defaultLookupAll: DnsLookupAll = (hostname, options) =>
  dns.promises.lookup(hostname, options);

// Build an undici Agent whose connect step re-validates the resolved IP at the
// moment of connection and pins the connection to that already-validated
// address. This closes the TOCTOU/DNS-rebinding window between validation and
// the actual TCP connect: the kernel-level lookup callback is the last code to
// run before connecting, and it both re-checks the IP against the block ranges
// and hands undici exactly the address(es) it validated.
function createPinnedAgent(): Agent {
  return new Agent({
    connect: {
      lookup: (
        hostname: string,
        _options: unknown,
        callback: (
          err: NodeJS.ErrnoException | null,
          address: string | Array<{ address: string; family: number }>,
          family?: number,
        ) => void,
      ): void => {
        // If undici already has an IP literal, validate it directly.
        const literalType = net.isIP(hostname);
        if (literalType !== 0) {
          if (isBlockedIp(hostname.toLowerCase())) {
            callback(
              new Error('SSRF guard: connection target is a blocked address') as NodeJS.ErrnoException,
              '',
            );
            return;
          }
          callback(null, hostname, literalType);
          return;
        }

        dns.lookup(hostname, { all: true }, (err, addresses) => {
          if (err) {
            callback(err, '');
            return;
          }
          if (!addresses || addresses.length === 0) {
            callback(
              new Error('SSRF guard: host did not resolve') as NodeJS.ErrnoException,
              '',
            );
            return;
          }
          for (const entry of addresses) {
            if (isBlockedIp(entry.address.toLowerCase())) {
              callback(
                new Error(
                  'SSRF guard: connection target resolved to a blocked address',
                ) as NodeJS.ErrnoException,
                '',
              );
              return;
            }
          }
          callback(null, addresses);
        });
      },
    },
  });
}

function resolveLocation(currentUrl: string, location: string): string {
  return new URL(location, currentUrl).toString();
}

/**
 * Fail-closed SSRF-aware fetch. Validates the initial URL (and every redirect
 * hop) with assertSafePublicUrl, disables automatic redirect following, and
 * pins each connection to an already-validated IP via a custom undici Agent.
 */
export async function safeFetch(
  url: string,
  options: SafeFetchOptions = {},
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? 5;
  const fetchImpl = options.fetchImpl ?? fetch;
  const lookupAll = options.lookupAll ?? defaultLookupAll;
  const agent = createPinnedAgent();

  try {
    let currentUrl = url;
    let remaining = maxRedirects;

    // Validate the initial target before any network activity.
    await assertSafePublicUrl(currentUrl, lookupAll);

    for (;;) {
      const response = await fetchImpl(currentUrl, {
        redirect: 'manual',
        // dispatcher is an undici extension to RequestInit; cast through unknown.
        ...({ dispatcher: agent } as Record<string, unknown>),
      } as RequestInit);

      const status = response.status;
      const isRedirect = status >= 300 && status < 400;
      if (!isRedirect) {
        return response;
      }

      const location = response.headers.get('location');
      if (!location) {
        // Redirect status without a target: nothing safe to follow.
        return response;
      }

      if (remaining <= 0) {
        throw new UnsafeUrlError('Too many redirects while fetching URL');
      }
      remaining -= 1;

      const nextUrl = resolveLocation(currentUrl, location);
      // Revalidate the redirect target before following it.
      await assertSafePublicUrl(nextUrl, lookupAll);
      currentUrl = nextUrl;
    }
  } finally {
    // Release sockets held by the pinned agent.
    await agent.close().catch(() => {});
  }
}

export interface Attachment {
  filename: string;
  content: Buffer;
  contentType: string;
  size: number;
}

export interface AttachmentMetadata {
  id: string;
  filename: string;
  originalFilename: string;
  contentType: string;
  size: number;
  uploadedAt: string;
  downloadUrl?: string;
}

export class AttachmentHandler {
  private logger: Logger;
  private storageDir: string;
  private maxSize: number;

  constructor() {
    this.logger = new Logger('AttachmentHandler');
    this.storageDir = process.env.ATTACHMENT_STORAGE_DIR || './attachments';
    this.maxSize = parseInt(process.env.MAX_ATTACHMENT_SIZE || '25000000'); // 25MB default
  }

  async initialize(): Promise<void> {
    try {
      // Create storage directory if it doesn't exist
      await fs.mkdir(this.storageDir, { recursive: true });
      this.logger.info('AttachmentHandler initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize AttachmentHandler:', error);
      throw error;
    }
  }

  async saveAttachment(
    filename: string,
    content: Buffer,
    contentType?: string
  ): Promise<AttachmentMetadata> {
    try {
      // Validate attachment
      this.validateAttachment(filename, content);

      // Generate unique filename
      const sanitizedFilename = sanitizeFilename(filename);
      const extension = path.extname(sanitizedFilename);
      const baseName = path.basename(sanitizedFilename, extension);
      const uniqueId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const savedFilename = `${uniqueId}_${baseName}${extension}`;

      // Determine content type
      const detectedContentType = contentType || 
                                  mime.lookup(filename) || 
                                  'application/octet-stream';

      // Save file to disk
      const filePath = path.join(this.storageDir, savedFilename);
      await fs.writeFile(filePath, content);

      const metadata: AttachmentMetadata = {
        id: uniqueId,
        filename: savedFilename,
        originalFilename: filename,
        contentType: detectedContentType,
        size: content.length,
        uploadedAt: new Date().toISOString(),
      };

      // Save metadata
      await this.saveMetadata(uniqueId, metadata);

      this.logger.info(`Saved attachment: ${filename} (${content.length} bytes)`);
      return metadata;

    } catch (error) {
      this.logger.error(`Failed to save attachment ${filename}:`, error);
      throw error;
    }
  }

  async getAttachment(attachmentId: string): Promise<Attachment | null> {
    try {
      const metadata = await this.getMetadata(attachmentId);
      if (!metadata) {
        return null;
      }

      const filePath = path.join(this.storageDir, metadata.filename);
      const content = await fs.readFile(filePath);

      return {
        filename: metadata.originalFilename,
        content,
        contentType: metadata.contentType,
        size: metadata.size,
      };

    } catch (error) {
      this.logger.error(`Failed to get attachment ${attachmentId}:`, error);
      return null;
    }
  }

  async deleteAttachment(attachmentId: string): Promise<boolean> {
    try {
      const metadata = await this.getMetadata(attachmentId);
      if (!metadata) {
        return false;
      }

      // Delete file
      const filePath = path.join(this.storageDir, metadata.filename);
      await fs.unlink(filePath);

      // Delete metadata
      await this.deleteMetadata(attachmentId);

      this.logger.info(`Deleted attachment: ${attachmentId}`);
      return true;

    } catch (error) {
      this.logger.error(`Failed to delete attachment ${attachmentId}:`, error);
      return false;
    }
  }

  async listAttachments(): Promise<AttachmentMetadata[]> {
    try {
      const files = await fs.readdir(this.storageDir);
      const metadataFiles = files.filter(f => f.endsWith('.metadata.json'));
      
      const attachments: AttachmentMetadata[] = [];
      
      for (const metadataFile of metadataFiles) {
        try {
          const attachmentId = metadataFile.replace('.metadata.json', '');
          const metadata = await this.getMetadata(attachmentId);
          if (metadata) {
            attachments.push(metadata);
          }
        } catch (error) {
          this.logger.warn(`Failed to load metadata for ${metadataFile}:`, error);
        }
      }

      return attachments.sort((a, b) => 
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
      );

    } catch (error) {
      this.logger.error('Failed to list attachments:', error);
      return [];
    }
  }

  async cleanupOldAttachments(maxAgeHours: number = 24): Promise<number> {
    try {
      const attachments = await this.listAttachments();
      const cutoffDate = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
      
      let deletedCount = 0;
      
      for (const attachment of attachments) {
        const uploadDate = new Date(attachment.uploadedAt);
        if (uploadDate < cutoffDate) {
          const success = await this.deleteAttachment(attachment.id);
          if (success) {
            deletedCount++;
          }
        }
      }

      this.logger.info(`Cleaned up ${deletedCount} old attachments`);
      return deletedCount;

    } catch (error) {
      this.logger.error('Failed to cleanup old attachments:', error);
      return 0;
    }
  }

  private validateAttachment(filename: string, content: Buffer): void {
    // Validate size
    if (!validateAttachmentSize(content.length)) {
      throw new Error(`Attachment size exceeds maximum allowed size (${this.maxSize} bytes)`);
    }

    // Validate type
    if (!validateAttachmentType(filename)) {
      throw new Error(`Attachment type not allowed: ${path.extname(filename)}`);
    }

    // Additional security checks
    this.performSecurityChecks(filename, content);
  }

  private performSecurityChecks(filename: string, content: Buffer): void {
    // Check for dangerous file extensions
    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.pif', '.com', '.vbs', '.js'];
    const extension = path.extname(filename).toLowerCase();
    
    if (dangerousExtensions.includes(extension)) {
      throw new Error(`Potentially dangerous file type: ${extension}`);
    }

    // Check for executable signatures
    const executableSignatures = [
      Buffer.from([0x4D, 0x5A]), // PE executable
      Buffer.from([0x7F, 0x45, 0x4C, 0x46]), // ELF
      Buffer.from([0xCA, 0xFE, 0xBA, 0xBE]), // Java class
      Buffer.from([0xFE, 0xED, 0xFA, 0xCE]), // Mach-O
    ];

    for (const signature of executableSignatures) {
      if (content.subarray(0, signature.length).equals(signature)) {
        throw new Error('Executable files are not allowed');
      }
    }

    // Check content length vs declared size
    if (content.length === 0) {
      throw new Error('Empty file is not allowed');
    }

    if (content.length > this.maxSize) {
      throw new Error('File size exceeds maximum allowed size');
    }
  }

  private async saveMetadata(attachmentId: string, metadata: AttachmentMetadata): Promise<void> {
    const metadataPath = path.join(this.storageDir, `${attachmentId}.metadata.json`);
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  }

  private async getMetadata(attachmentId: string): Promise<AttachmentMetadata | null> {
    try {
      const metadataPath = path.join(this.storageDir, `${attachmentId}.metadata.json`);
      const content = await fs.readFile(metadataPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  private async deleteMetadata(attachmentId: string): Promise<void> {
    const metadataPath = path.join(this.storageDir, `${attachmentId}.metadata.json`);
    await fs.unlink(metadataPath);
  }

  // Utility methods for common attachment operations
  async createFromBase64(
    filename: string,
    base64Content: string,
    contentType?: string
  ): Promise<AttachmentMetadata> {
    const buffer = Buffer.from(base64Content, 'base64');
    return this.saveAttachment(filename, buffer, contentType);
  }

  async createFromUrl(
    filename: string,
    url: string,
    contentType?: string,
    safeFetchOptions: SafeFetchOptions = {}
  ): Promise<AttachmentMetadata> {
    try {
      // SSRF guard is fully enforced inside safeFetch: it validates the initial
      // URL and every redirect hop against blocked ranges, resolves DNS up
      // front, and pins each connection to an already-validated IP to close the
      // DNS-rebinding window. No automatic redirect following.
      const response = await safeFetch(url, safeFetchOptions);
      if (!response.ok) {
        throw new Error(`Failed to download from URL: ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const detectedContentType = contentType ||
                                  response.headers.get('content-type') ||
                                  undefined;

      return this.saveAttachment(filename, buffer, detectedContentType);

    } catch (error) {
      // Log without leaking query-string credentials: only the host is recorded.
      const safeUrl = (() => {
        try {
          return new URL(url).host;
        } catch {
          return '<invalid-url>';
        }
      })();
      this.logger.error(`Failed to create attachment from URL host ${safeUrl}:`, error);
      throw error;
    }
  }

  async getAttachmentAsBase64(attachmentId: string): Promise<string | null> {
    const attachment = await this.getAttachment(attachmentId);
    return attachment ? attachment.content.toString('base64') : null;
  }

  async getStorageInfo(): Promise<{ totalFiles: number; totalSize: number }> {
    try {
      const attachments = await this.listAttachments();
      return {
        totalFiles: attachments.length,
        totalSize: attachments.reduce((sum, att) => sum + att.size, 0),
      };
    } catch (error) {
      this.logger.error('Failed to get storage info:', error);
      return { totalFiles: 0, totalSize: 0 };
    }
  }
}