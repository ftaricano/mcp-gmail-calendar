import { google, sheets_v4 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { Logger } from '../utils/Logger.js';
import { CacheManager } from '../utils/CacheManager.js';

type SheetsApiLike = Pick<sheets_v4.Sheets, 'spreadsheets'>;

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
}
