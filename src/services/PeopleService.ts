import { google, people_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { TextContent, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { Logger } from '../utils/Logger.js';
import { CacheManager } from '../utils/CacheManager.js';

type PeopleApiLike = Pick<people_v1.People, 'people' | 'contactGroups'>;

const DEFAULT_PERSON_FIELDS = 'names,emailAddresses,phoneNumbers';
const DEFAULT_READ_MASK = 'names,emailAddresses,phoneNumbers';

export interface ListContactsOptions {
  pageSize?: number;
  pageToken?: string;
  personFields?: string;
}

export interface SearchContactsOptions {
  pageSize?: number;
  readMask?: string;
}

export interface ListContactGroupsOptions {
  pageSize?: number;
  pageToken?: string;
}

function ok(result: unknown): { content: Array<TextContent> } {
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

function parseArgs<T>(schema: z.ZodType<T>, args: unknown): T {
  const parsed = schema.safeParse(args ?? {});
  if (!parsed.success) {
    throw new McpError(ErrorCode.InvalidParams, parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '));
  }
  return parsed.data;
}

export class PeopleService {
  private people: PeopleApiLike;
  private logger: Logger;
  private cache: CacheManager;
  private accountEmail: string;

  constructor(
    auth: OAuth2Client,
    cache: CacheManager,
    accountEmail: string,
    peopleApi?: PeopleApiLike,
  ) {
    this.people = peopleApi ?? google.people({ version: 'v1', auth });
    this.logger = new Logger('PeopleService');
    this.cache = cache;
    this.accountEmail = accountEmail.trim().toLowerCase();
  }

  // ---- Contacts ----

  async listContacts(opts: ListContactsOptions = {}): Promise<people_v1.Schema$ListConnectionsResponse> {
    try {
      // Só cacheia a listagem completa (sem paginação) sob a chave fixa que
      // invalidateContacts() limpa; queries paginadas passam direto.
      const cacheable = opts.pageSize === undefined && opts.pageToken === undefined && opts.personFields === undefined;
      if (cacheable) {
        const cached = this.cache.getAccountCache(this.accountEmail, 'people:contacts');
        if (cached) return cached as people_v1.Schema$ListConnectionsResponse;
      }

      const response = await this.people.people.connections.list({
        resourceName: 'people/me',
        personFields: opts.personFields ?? DEFAULT_PERSON_FIELDS,
        pageSize: opts.pageSize,
        pageToken: opts.pageToken,
      });
      if (cacheable) this.cache.setAccountCache(this.accountEmail, 'people:contacts', response.data);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to list contacts:', error);
      throw error;
    }
  }

  private invalidateContacts(): void {
    this.cache.deleteAccountCache(this.accountEmail, 'people:contacts');
  }

  async searchContacts(query: string, opts: SearchContactsOptions = {}): Promise<people_v1.Schema$SearchResponse> {
    try {
      const response = await this.people.people.searchContacts({
        query,
        readMask: opts.readMask ?? DEFAULT_READ_MASK,
        pageSize: opts.pageSize,
      });
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to search contacts for "${query}":`, error);
      throw error;
    }
  }

  async getContact(resourceName: string, personFields?: string): Promise<people_v1.Schema$Person> {
    try {
      const response = await this.people.people.get({
        resourceName,
        personFields: personFields ?? DEFAULT_PERSON_FIELDS,
      });
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get contact ${resourceName}:`, error);
      throw error;
    }
  }

  async createContact(person: people_v1.Schema$Person): Promise<people_v1.Schema$Person> {
    try {
      const response = await this.people.people.createContact({ requestBody: person });
      this.invalidateContacts();
      return response.data;
    } catch (error) {
      this.logger.error('Failed to create contact:', error);
      throw error;
    }
  }

  async updateContact(
    resourceName: string,
    person: people_v1.Schema$Person,
    updatePersonFields: string,
  ): Promise<people_v1.Schema$Person> {
    try {
      // People API rejeita updateContact sem o etag corrente. Reusa o etag do
      // input quando vier; caso contrário busca o etag atual via people.get.
      let etag = person.etag ?? undefined;
      if (!etag) {
        const current = await this.people.people.get({ resourceName, personFields: 'metadata' });
        etag = current.data.etag ?? undefined;
      }

      const response = await this.people.people.updateContact({
        resourceName,
        updatePersonFields,
        requestBody: { ...person, etag },
      });
      this.invalidateContacts();
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to update contact ${resourceName}:`, error);
      throw error;
    }
  }

  async deleteContact(resourceName: string): Promise<void> {
    try {
      await this.people.people.deleteContact({ resourceName });
      this.invalidateContacts();
    } catch (error) {
      this.logger.error(`Failed to delete contact ${resourceName}:`, error);
      throw error;
    }
  }

  // ---- Contact groups ----

  async listContactGroups(opts: ListContactGroupsOptions = {}): Promise<people_v1.Schema$ListContactGroupsResponse> {
    try {
      const response = await this.people.contactGroups.list({
        pageSize: opts.pageSize,
        pageToken: opts.pageToken,
      });
      return response.data;
    } catch (error) {
      this.logger.error('Failed to list contact groups:', error);
      throw error;
    }
  }

  async getContactGroup(resourceName: string): Promise<people_v1.Schema$ContactGroup> {
    try {
      const response = await this.people.contactGroups.get({ resourceName });
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get contact group ${resourceName}:`, error);
      throw error;
    }
  }

  // ---- MCP handlers ----

  async handleListContacts(args: any): Promise<{ content: Array<TextContent> }> {
    const input = parseArgs(
      z.object({
        pageSize: z.number().int().positive().optional(),
        pageToken: z.string().optional(),
        personFields: z.string().optional(),
      }),
      args,
    );
    return ok(await this.listContacts(input));
  }

  async handleSearchContacts(args: any): Promise<{ content: Array<TextContent> }> {
    const input = parseArgs(
      z.object({
        query: z.string().min(1),
        pageSize: z.number().int().positive().optional(),
        readMask: z.string().optional(),
      }),
      args,
    );
    const { query, ...opts } = input;
    return ok(await this.searchContacts(query, opts));
  }

  async handleGetContact(args: any): Promise<{ content: Array<TextContent> }> {
    const input = parseArgs(
      z.object({ resourceName: z.string().min(1), personFields: z.string().optional() }),
      args,
    );
    return ok(await this.getContact(input.resourceName, input.personFields));
  }

  async handleCreateContact(args: any): Promise<{ content: Array<TextContent> }> {
    const input = parseArgs(
      z.object({ person: z.object({}).passthrough() }),
      args,
    );
    return ok(await this.createContact(input.person as people_v1.Schema$Person));
  }

  async handleUpdateContact(args: any): Promise<{ content: Array<TextContent> }> {
    const input = parseArgs(
      z.object({
        resourceName: z.string().min(1),
        person: z.object({}).passthrough(),
        updatePersonFields: z.string().min(1),
      }),
      args,
    );
    return ok(await this.updateContact(input.resourceName, input.person as people_v1.Schema$Person, input.updatePersonFields));
  }

  async handleDeleteContact(args: any): Promise<{ content: Array<TextContent> }> {
    const input = parseArgs(z.object({ resourceName: z.string().min(1) }), args);
    await this.deleteContact(input.resourceName);
    return ok({ deleted: input.resourceName });
  }

  async handleListContactGroups(args: any): Promise<{ content: Array<TextContent> }> {
    const input = parseArgs(
      z.object({ pageSize: z.number().int().positive().optional(), pageToken: z.string().optional() }),
      args,
    );
    return ok(await this.listContactGroups(input));
  }

  async handleGetContactGroup(args: any): Promise<{ content: Array<TextContent> }> {
    const input = parseArgs(z.object({ resourceName: z.string().min(1) }), args);
    return ok(await this.getContactGroup(input.resourceName));
  }
}
