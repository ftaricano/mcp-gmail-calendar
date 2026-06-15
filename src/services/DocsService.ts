import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { docs_v1, drive_v3, google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { TextContent, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
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

function parseArgs<T>(schema: z.ZodType<T>, args: unknown): T {
  const result = schema.safeParse(args ?? {});
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new McpError(ErrorCode.InvalidParams, `Invalid arguments: ${issues}`);
  }
  return result.data;
}

const getDocumentSchema = z.object({ documentId: z.string().min(1) });
const createDocumentSchema = z.object({ title: z.string().min(1), content: z.string().optional() });
const exportDocumentSchema = z.object({
  documentId: z.string().min(1),
  mimeType: z.string().min(1),
  outputPath: z.string().min(1),
});
const batchUpdateSchema = z.object({
  documentId: z.string().min(1),
  requests: z.array(z.record(z.unknown())),
});
const insertTextSchema = z.object({
  documentId: z.string().min(1),
  text: z.string(),
  index: z.number().int().optional(),
});
const replaceAllTextSchema = z.object({
  documentId: z.string().min(1),
  replacements: z
    .array(
      z.object({
        find: z.string().min(1),
        replace: z.string(),
        matchCase: z.boolean().optional(),
      }),
    )
    .min(1),
});
const insertTableSchema = z.object({
  documentId: z.string().min(1),
  rows: z.number().int().positive(),
  columns: z.number().int().positive(),
  index: z.number().int().optional(),
});
const insertImageSchema = z.object({
  documentId: z.string().min(1),
  uri: z.string().min(1),
  index: z.number().int().optional(),
});

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

  private ok(result: unknown): { content: Array<TextContent> } {
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }

  private invalidateDocumentCache(documentId: string): void {
    this.cache.deleteAccountCache(this.accountEmail, `docs:get:${documentId}`);
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

  async batchUpdate(
    documentId: string,
    requests: docs_v1.Schema$Request[],
  ): Promise<docs_v1.Schema$BatchUpdateDocumentResponse> {
    try {
      const response = await this.docs.documents.batchUpdate({
        documentId,
        requestBody: { requests },
      });
      this.invalidateDocumentCache(documentId);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to batch update document:', error);
      throw error;
    }
  }

  async insertText(
    documentId: string,
    text: string,
    index = 1,
  ): Promise<docs_v1.Schema$BatchUpdateDocumentResponse> {
    try {
      return await this.batchUpdate(documentId, [
        {
          insertText: {
            location: { index },
            text,
          },
        },
      ]);
    } catch (error) {
      this.logger.error('Failed to insert text:', error);
      throw error;
    }
  }

  async replaceAllText(
    documentId: string,
    replacements: Array<{ find: string; replace: string; matchCase?: boolean }>,
  ): Promise<docs_v1.Schema$BatchUpdateDocumentResponse> {
    try {
      const requests: docs_v1.Schema$Request[] = replacements.map((replacement) => ({
        replaceAllText: {
          containsText: {
            text: replacement.find,
            matchCase: replacement.matchCase ?? false,
          },
          replaceText: replacement.replace,
        },
      }));
      return await this.batchUpdate(documentId, requests);
    } catch (error) {
      this.logger.error('Failed to replace text:', error);
      throw error;
    }
  }

  async insertTable(
    documentId: string,
    rows: number,
    columns: number,
    index = 1,
  ): Promise<docs_v1.Schema$BatchUpdateDocumentResponse> {
    try {
      return await this.batchUpdate(documentId, [
        {
          insertTable: {
            location: { index },
            rows,
            columns,
          },
        },
      ]);
    } catch (error) {
      this.logger.error('Failed to insert table:', error);
      throw error;
    }
  }

  async insertImage(
    documentId: string,
    uri: string,
    index = 1,
  ): Promise<docs_v1.Schema$BatchUpdateDocumentResponse> {
    try {
      return await this.batchUpdate(documentId, [
        {
          insertInlineImage: {
            location: { index },
            uri,
          },
        },
      ]);
    } catch (error) {
      this.logger.error('Failed to insert image:', error);
      throw error;
    }
  }

  async handleGetDocument(args: unknown): Promise<{ content: Array<TextContent> }> {
    const { documentId } = parseArgs(getDocumentSchema, args);
    return this.ok(await this.getDocument(documentId));
  }

  async handleCreateDocument(args: unknown): Promise<{ content: Array<TextContent> }> {
    const { title, content } = parseArgs(createDocumentSchema, args);
    return this.ok(await this.createDocument(title, content));
  }

  async handleExportDocument(args: unknown): Promise<{ content: Array<TextContent> }> {
    const { documentId, mimeType, outputPath } = parseArgs(exportDocumentSchema, args);
    return this.ok(await this.exportDocument(documentId, mimeType, outputPath));
  }

  async handleBatchUpdate(args: unknown): Promise<{ content: Array<TextContent> }> {
    const { documentId, requests } = parseArgs(batchUpdateSchema, args);
    return this.ok(await this.batchUpdate(documentId, requests as docs_v1.Schema$Request[]));
  }

  async handleInsertText(args: unknown): Promise<{ content: Array<TextContent> }> {
    const { documentId, text, index } = parseArgs(insertTextSchema, args);
    return this.ok(await this.insertText(documentId, text, index));
  }

  async handleReplaceAllText(args: unknown): Promise<{ content: Array<TextContent> }> {
    const { documentId, replacements } = parseArgs(replaceAllTextSchema, args);
    return this.ok(await this.replaceAllText(documentId, replacements));
  }

  async handleInsertTable(args: unknown): Promise<{ content: Array<TextContent> }> {
    const { documentId, rows, columns, index } = parseArgs(insertTableSchema, args);
    return this.ok(await this.insertTable(documentId, rows, columns, index));
  }

  async handleInsertImage(args: unknown): Promise<{ content: Array<TextContent> }> {
    const { documentId, uri, index } = parseArgs(insertImageSchema, args);
    return this.ok(await this.insertImage(documentId, uri, index));
  }
}
