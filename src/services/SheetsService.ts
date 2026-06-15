import { google, sheets_v4 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { TextContent, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { Logger } from '../utils/Logger.js';
import { CacheManager } from '../utils/CacheManager.js';

type SheetsApiLike = Pick<sheets_v4.Sheets, 'spreadsheets'>;

function parseArgs<T>(schema: z.ZodType<T>, args: unknown): T {
  const result = schema.safeParse(args ?? {});
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new McpError(ErrorCode.InvalidParams, `Invalid arguments: ${detail}`);
  }
  return result.data;
}

function ok(result: unknown): { content: Array<TextContent> } {
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

export class SheetsService {
  private sheets: SheetsApiLike;
  private logger: Logger;
  private cache: CacheManager;
  private accountEmail: string;

  constructor(
    auth: OAuth2Client,
    cache: CacheManager,
    accountEmail: string,
    sheetsApi?: SheetsApiLike,
  ) {
    this.sheets = sheetsApi ?? google.sheets({ version: 'v4', auth });
    this.logger = new Logger('SheetsService');
    this.cache = cache;
    this.accountEmail = accountEmail.trim().toLowerCase();
  }

  private invalidateSpreadsheet(spreadsheetId: string): void {
    this.cache.deleteAccountCache(this.accountEmail, `sheets:get:${spreadsheetId}`);
  }

  async getSpreadsheet(spreadsheetId: string): Promise<sheets_v4.Schema$Spreadsheet> {
    const cacheKey = `sheets:get:${spreadsheetId}`;
    const cached = this.cache.getAccountCache(this.accountEmail, cacheKey);
    if (cached) return cached as sheets_v4.Schema$Spreadsheet;

    const response = await this.sheets.spreadsheets.get({ spreadsheetId });
    this.cache.setAccountCache(this.accountEmail, cacheKey, response.data);
    return response.data;
  }

  async getValues(
    spreadsheetId: string,
    range: string,
  ): Promise<sheets_v4.Schema$ValueRange> {
    const response = await this.sheets.spreadsheets.values.get({ spreadsheetId, range });
    return response.data;
  }

  async updateValues(
    spreadsheetId: string,
    range: string,
    values: string[][],
    valueInputOption: 'RAW' | 'USER_ENTERED' = 'RAW',
  ): Promise<sheets_v4.Schema$UpdateValuesResponse> {
    const response = await this.sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption,
      requestBody: { values },
    });
    return response.data;
  }

  async appendValues(
    spreadsheetId: string,
    range: string,
    values: string[][],
    valueInputOption: 'RAW' | 'USER_ENTERED' = 'RAW',
  ): Promise<sheets_v4.Schema$AppendValuesResponse> {
    const response = await this.sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption,
      requestBody: { values },
    });
    return response.data;
  }

  // ----- batchUpdate-backed structural mutations -----

  async batchUpdate(
    spreadsheetId: string,
    requests: sheets_v4.Schema$Request[],
  ): Promise<sheets_v4.Schema$BatchUpdateSpreadsheetResponse> {
    try {
      const response = await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests },
      });
      this.invalidateSpreadsheet(spreadsheetId);
      return response.data;
    } catch (error) {
      this.logger.error(`batchUpdate failed for ${spreadsheetId}:`, error);
      throw error;
    }
  }

  async addSheet(
    spreadsheetId: string,
    title: string,
    opts: { rows?: number; columns?: number } = {},
  ): Promise<sheets_v4.Schema$BatchUpdateSpreadsheetResponse> {
    try {
      const properties: sheets_v4.Schema$SheetProperties = { title };
      if (opts.rows !== undefined || opts.columns !== undefined) {
        properties.gridProperties = {
          rowCount: opts.rows,
          columnCount: opts.columns,
        };
      }
      const response = await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties } }] },
      });
      this.invalidateSpreadsheet(spreadsheetId);
      return response.data;
    } catch (error) {
      this.logger.error(`addSheet failed for ${spreadsheetId}:`, error);
      throw error;
    }
  }

  async deleteSheet(
    spreadsheetId: string,
    sheetId: number,
  ): Promise<sheets_v4.Schema$BatchUpdateSpreadsheetResponse> {
    try {
      const response = await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ deleteSheet: { sheetId } }] },
      });
      this.invalidateSpreadsheet(spreadsheetId);
      return response.data;
    } catch (error) {
      this.logger.error(`deleteSheet failed for ${spreadsheetId}:`, error);
      throw error;
    }
  }

  async renameSheet(
    spreadsheetId: string,
    sheetId: number,
    title: string,
  ): Promise<sheets_v4.Schema$BatchUpdateSpreadsheetResponse> {
    try {
      const response = await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              updateSheetProperties: {
                properties: { sheetId, title },
                fields: 'title',
              },
            },
          ],
        },
      });
      this.invalidateSpreadsheet(spreadsheetId);
      return response.data;
    } catch (error) {
      this.logger.error(`renameSheet failed for ${spreadsheetId}:`, error);
      throw error;
    }
  }

  async clearValues(
    spreadsheetId: string,
    range: string,
  ): Promise<sheets_v4.Schema$ClearValuesResponse> {
    try {
      const response = await this.sheets.spreadsheets.values.clear({
        spreadsheetId,
        range,
      });
      return response.data;
    } catch (error) {
      this.logger.error(`clearValues failed for ${spreadsheetId}:`, error);
      throw error;
    }
  }

  // ----- MCP handlers -----

  async handleGetSpreadsheet(args: unknown): Promise<{ content: Array<TextContent> }> {
    const { spreadsheetId } = parseArgs(
      z.object({ spreadsheetId: z.string().min(1) }),
      args,
    );
    return ok(await this.getSpreadsheet(spreadsheetId));
  }

  async handleGetValues(args: unknown): Promise<{ content: Array<TextContent> }> {
    const { spreadsheetId, range } = parseArgs(
      z.object({ spreadsheetId: z.string().min(1), range: z.string().min(1) }),
      args,
    );
    return ok(await this.getValues(spreadsheetId, range));
  }

  async handleUpdateValues(args: unknown): Promise<{ content: Array<TextContent> }> {
    const { spreadsheetId, range, values, valueInputOption } = parseArgs(
      z.object({
        spreadsheetId: z.string().min(1),
        range: z.string().min(1),
        values: z.array(z.array(z.union([z.string(), z.number(), z.boolean()]))),
        valueInputOption: z.enum(['RAW', 'USER_ENTERED']).optional(),
      }),
      args,
    );
    const rows = values.map((row) => row.map((cell) => String(cell)));
    return ok(await this.updateValues(spreadsheetId, range, rows, valueInputOption));
  }

  async handleAppendValues(args: unknown): Promise<{ content: Array<TextContent> }> {
    const { spreadsheetId, range, values, valueInputOption } = parseArgs(
      z.object({
        spreadsheetId: z.string().min(1),
        range: z.string().min(1),
        values: z.array(z.array(z.union([z.string(), z.number(), z.boolean()]))),
        valueInputOption: z.enum(['RAW', 'USER_ENTERED']).optional(),
      }),
      args,
    );
    const rows = values.map((row) => row.map((cell) => String(cell)));
    return ok(await this.appendValues(spreadsheetId, range, rows, valueInputOption));
  }

  async handleBatchUpdate(args: unknown): Promise<{ content: Array<TextContent> }> {
    const { spreadsheetId, requests } = parseArgs(
      z.object({
        spreadsheetId: z.string().min(1),
        requests: z.array(z.record(z.unknown())).min(1),
      }),
      args,
    );
    return ok(await this.batchUpdate(spreadsheetId, requests as sheets_v4.Schema$Request[]));
  }

  async handleAddSheet(args: unknown): Promise<{ content: Array<TextContent> }> {
    const { spreadsheetId, title, rows, columns } = parseArgs(
      z.object({
        spreadsheetId: z.string().min(1),
        title: z.string().min(1),
        rows: z.number().int().positive().optional(),
        columns: z.number().int().positive().optional(),
      }),
      args,
    );
    return ok(await this.addSheet(spreadsheetId, title, { rows, columns }));
  }

  async handleDeleteSheet(args: unknown): Promise<{ content: Array<TextContent> }> {
    const { spreadsheetId, sheetId } = parseArgs(
      z.object({
        spreadsheetId: z.string().min(1),
        sheetId: z.number().int().nonnegative(),
      }),
      args,
    );
    return ok(await this.deleteSheet(spreadsheetId, sheetId));
  }

  async handleRenameSheet(args: unknown): Promise<{ content: Array<TextContent> }> {
    const { spreadsheetId, sheetId, title } = parseArgs(
      z.object({
        spreadsheetId: z.string().min(1),
        sheetId: z.number().int().nonnegative(),
        title: z.string().min(1),
      }),
      args,
    );
    return ok(await this.renameSheet(spreadsheetId, sheetId, title));
  }

  async handleClearValues(args: unknown): Promise<{ content: Array<TextContent> }> {
    const { spreadsheetId, range } = parseArgs(
      z.object({ spreadsheetId: z.string().min(1), range: z.string().min(1) }),
      args,
    );
    return ok(await this.clearValues(spreadsheetId, range));
  }
}
