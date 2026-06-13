import fs from 'node:fs/promises';
import path from 'node:path';
import { docs_v1, drive_v3, google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { Logger } from '../utils/Logger.js';
import { CacheManager } from '../utils/CacheManager.js';

function responseDataToBuffer(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (typeof data === 'string') return Buffer.from(data);
  throw new TypeError('Expected Google API response data to be binary content.');
}

type DocsApiLike = Pick<docs_v1.Docs, 'documents'>;
type DriveApiLike = Pick<drive_v3.Drive, 'files'>;

export class DocsService {
  private docs: DocsApiLike;
  private drive: DriveApiLike;
  private logger: Logger;
  private cache: CacheManager;
  private accountEmail: string;

  constructor(
    auth: OAuth2Client,
    cache: CacheManager,
    accountEmail: string,
    docsApi?: DocsApiLike,
    driveApi?: DriveApiLike,
  ) {
    this.docs = docsApi ?? google.docs({ version: 'v1', auth });
    this.drive = driveApi ?? google.drive({ version: 'v3', auth });
    this.logger = new Logger('DocsService');
    this.cache = cache;
    this.accountEmail = accountEmail.trim().toLowerCase();
  }

  async getDocument(documentId: string): Promise<docs_v1.Schema$Document> {
    const cacheKey = `docs:get:${documentId}`;
    const cached = this.cache.getAccountCache(this.accountEmail, cacheKey);
    if (cached) return cached as docs_v1.Schema$Document;

    const response = await this.docs.documents.get({ documentId });
    this.cache.setAccountCache(this.accountEmail, cacheKey, response.data);
    return response.data;
  }

  async createDocument(title: string, content?: string): Promise<docs_v1.Schema$Document> {
    const response = await this.docs.documents.create({
      requestBody: { title },
    });

    if (content) {
      await this.docs.documents.batchUpdate({
        documentId: response.data.documentId!,
        requestBody: {
          requests: [
            {
              insertText: {
                location: { index: 1 },
                text: content,
              },
            },
          ],
        },
      });
    }

    return this.getDocument(response.data.documentId!);
  }

  async exportDocument(
    documentId: string,
    mimeType: string,
    outputPath: string,
  ): Promise<{ path: string; mimeType: string; size: number }> {
    const response = await this.drive.files.export(
      {
        fileId: documentId,
        mimeType,
      },
      { responseType: 'arraybuffer' as never },
    );

    const buffer = responseDataToBuffer(response.data);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, buffer);
    return { path: outputPath, mimeType, size: buffer.length };
  }
}
