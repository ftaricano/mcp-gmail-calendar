import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import mime from 'mime-types';
import { drive_v3, google } from 'googleapis';
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

export interface DriveFileRecord {
  id?: string;
  name?: string;
  mimeType?: string;
  webViewLink?: string;
  parents?: string[];
  modifiedTime?: string;
  size?: string;
}

export interface DriveListOptions {
  query?: string;
  pageSize?: number;
  pageToken?: string;
}

export interface DriveUploadOptions {
  path: string;
  name?: string;
  mimeType?: string;
  parents?: string[];
}

export interface DriveDownloadResult {
  path: string;
  size: number;
}

type DriveApiLike = Pick<drive_v3.Drive, 'files' | 'permissions'>;

function compactRecord<T extends Record<string, unknown>>(record: T): Partial<T> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as Partial<T>;
}

function driveFileRecord(file: drive_v3.Schema$File): DriveFileRecord {
  return compactRecord({
    id: file.id ?? undefined,
    name: file.name ?? undefined,
    mimeType: file.mimeType ?? undefined,
    webViewLink: file.webViewLink ?? undefined,
    parents: file.parents ?? undefined,
    modifiedTime: file.modifiedTime ?? undefined,
    size: file.size ?? undefined,
  }) as DriveFileRecord;
}

export class DriveService {
  private drive: DriveApiLike;
  private logger: Logger;
  private cache: CacheManager;
  private accountEmail: string;

  constructor(
    auth: OAuth2Client,
    cache: CacheManager,
    accountEmail: string,
    driveApi?: DriveApiLike,
  ) {
    this.drive = driveApi ?? google.drive({ version: 'v3', auth });
    this.logger = new Logger('DriveService');
    this.cache = cache;
    this.accountEmail = accountEmail.trim().toLowerCase();
  }

  async listFiles(options: DriveListOptions = {}): Promise<DriveFileRecord[]> {
    const cacheKey = `drive:list:${options.query || ''}:${options.pageSize || 50}:${options.pageToken || ''}`;
    const cached = this.cache.getAccountCache(this.accountEmail, cacheKey);
    if (cached) return cached as DriveFileRecord[];

    const response = await this.drive.files.list({
      q: options.query,
      pageSize: options.pageSize ?? 50,
      pageToken: options.pageToken,
      fields: 'files(id,name,mimeType,webViewLink,parents,modifiedTime,size)',
    });

    const files = (response.data.files || []).map(driveFileRecord);

    this.cache.setAccountCache(this.accountEmail, cacheKey, files);
    return files;
  }

  async getFile(fileId: string): Promise<DriveFileRecord> {
    const response = await this.drive.files.get({
      fileId,
      fields: 'id,name,mimeType,webViewLink,parents,modifiedTime,size',
    });

    return driveFileRecord(response.data);
  }

  async uploadFile(options: DriveUploadOptions): Promise<DriveFileRecord> {
    const response = await this.drive.files.create({
      requestBody: {
        name: options.name ?? path.basename(options.path),
        parents: options.parents,
        mimeType: options.mimeType ?? (mime.lookup(options.path) || 'application/octet-stream'),
      },
      media: {
        mimeType: options.mimeType ?? (mime.lookup(options.path) || 'application/octet-stream'),
        body: fs.createReadStream(options.path),
      },
      fields: 'id,name,mimeType,webViewLink,parents,modifiedTime,size',
    });

    return driveFileRecord(response.data);
  }

  async downloadFile(fileId: string, outputPath: string): Promise<DriveDownloadResult> {
    const response = await this.drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' as never },
    );

    const buffer = responseDataToBuffer(response.data);
    await fsPromises.mkdir(path.dirname(outputPath), { recursive: true });
    await fsPromises.writeFile(outputPath, buffer);
    return { path: outputPath, size: buffer.length };
  }

  async createFolder(name: string, parentId?: string): Promise<DriveFileRecord> {
    const response = await this.drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : undefined,
      },
      fields: 'id,name,mimeType,webViewLink,parents,modifiedTime,size',
    });

    return driveFileRecord(response.data);
  }

  async shareFile(
    fileId: string,
    role: 'reader' | 'commenter' | 'writer',
    emailAddress?: string,
    type: 'user' | 'group' | 'domain' | 'anyone' = 'user',
  ): Promise<{ id?: string; role: string; emailAddress?: string; type: string }> {
    const response = await this.drive.permissions.create({
      fileId,
      sendNotificationEmail: Boolean(emailAddress && type === 'user'),
      requestBody: {
        role,
        type,
        emailAddress,
      },
      fields: 'id,role,type,emailAddress',
    });

    return {
      id: response.data.id ?? undefined,
      role: response.data.role ?? role,
      emailAddress: response.data.emailAddress ?? emailAddress,
      type: response.data.type ?? type,
    };
  }
}
