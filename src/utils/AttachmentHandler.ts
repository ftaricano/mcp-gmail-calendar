import fs from 'fs/promises';
import path from 'path';
import mime from 'mime-types';
import { Logger } from './Logger.js';
import { validateAttachmentSize, validateAttachmentType, sanitizeFilename } from './Validator.js';

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
    contentType?: string
  ): Promise<AttachmentMetadata> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download from URL: ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const detectedContentType = contentType || 
                                  response.headers.get('content-type') || 
                                  undefined;

      return this.saveAttachment(filename, buffer, detectedContentType);

    } catch (error) {
      this.logger.error(`Failed to create attachment from URL ${url}:`, error);
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