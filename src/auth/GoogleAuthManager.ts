import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import http from 'http';
import { URL } from 'url';
import crypto from 'crypto';
import { Logger } from '../utils/Logger.js';

export interface AccountInfo {
  email: string;
  accountType: 'personal' | 'workspace';
  displayName?: string;
  picture?: string;
  authenticatedAt: string;
  lastUsed: string;
  scopes: string[];
}

export interface TokenData {
  access_token: string;
  refresh_token: string;
  scope: string;
  token_type: string;
  expiry_date: number;
}

export class GoogleAuthManager {
  private logger: Logger;
  private credentials: any;
  private tokensPath: string;
  private oauthClients: Map<string, OAuth2Client> = new Map();
  private pendingAuthUrls: Map<string, string> = new Map();
  private authServers: Map<string, http.Server> = new Map();

  // Gmail and Calendar scopes
  private readonly SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.labels',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ];

  constructor() {
    this.logger = new Logger('GoogleAuthManager');
    this.tokensPath = process.env.TOKENS_PATH || './tokens';
  }

  async initialize(): Promise<void> {
    try {
      // Ensure tokens directory exists
      await fs.mkdir(this.tokensPath, { recursive: true });

      // Load credentials
      const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json';
      const credentialsContent = await fs.readFile(credentialsPath, 'utf-8');
      this.credentials = JSON.parse(credentialsContent);

      if (this.credentials.web) {
        this.credentials = this.credentials.web;
      } else if (this.credentials.installed) {
        this.credentials = this.credentials.installed;
      }

      // Load existing accounts
      await this.loadExistingAccounts();

      this.logger.info('GoogleAuthManager initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize GoogleAuthManager:', error);
      throw error;
    }
  }

  private async loadExistingAccounts(): Promise<void> {
    try {
      const files = await fs.readdir(this.tokensPath);
      const tokenFiles = files.filter(f => f.endsWith('.json'));

      for (const file of tokenFiles) {
        const email = file.replace('.json', '');
        const tokenPath = path.join(this.tokensPath, file);
        
        try {
          const tokenContent = await fs.readFile(tokenPath, 'utf-8');
          const tokenData = JSON.parse(tokenContent);
          
          const oAuth2Client = await this.createOAuthClient();
          oAuth2Client.setCredentials(tokenData.tokens);
          
          this.oauthClients.set(email, oAuth2Client);
          this.logger.info(`Loaded existing account: ${email}`);
        } catch (error) {
          this.logger.error(`Failed to load account ${email}:`, error);
        }
      }
    } catch (error) {
      this.logger.error('Error loading existing accounts:', error);
    }
  }

  private async createOAuthClient(): Promise<OAuth2Client> {
    const redirectUri = `http://localhost:${process.env.OAUTH_CALLBACK_PORT || 3000}/oauth2callback`;
    
    return new OAuth2Client(
      this.credentials.client_id,
      this.credentials.client_secret,
      redirectUri
    );
  }

  async authenticate(email: string, accountType: 'personal' | 'workspace' = 'personal'): Promise<string | null> {
    try {
      // Check if already authenticated
      if (this.oauthClients.has(email)) {
        this.logger.info(`Account ${email} is already authenticated`);
        return null;
      }

      const oAuth2Client = await this.createOAuthClient();
      
      // Generate state for CSRF protection
      const state = crypto.randomBytes(32).toString('hex');
      
      // Generate auth URL with login_hint for the specific email
      const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: this.SCOPES,
        prompt: 'consent',
        login_hint: email,
        state: state,
      });

      // Store pending auth
      this.pendingAuthUrls.set(state, email);

      // Start local server to handle callback
      await this.startAuthServer(oAuth2Client, email, state);

      return authUrl;
    } catch (error) {
      this.logger.error(`Authentication failed for ${email}:`, error);
      throw error;
    }
  }

  private async startAuthServer(oAuth2Client: OAuth2Client, email: string, state: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const port = parseInt(process.env.OAUTH_CALLBACK_PORT || '3000');
      
      const server = http.createServer(async (req, res) => {
        try {
          const url = new URL(req.url!, `http://localhost:${port}`);
          
          if (url.pathname === '/oauth2callback') {
            const code = url.searchParams.get('code');
            const receivedState = url.searchParams.get('state');
            
            if (!code || receivedState !== state) {
              res.writeHead(400, { 'Content-Type': 'text/html' });
              res.end('<h1>Authentication Failed</h1><p>Invalid or missing authorization code.</p>');
              server.close();
              reject(new Error('Invalid authorization code'));
              return;
            }

            // Exchange code for tokens
            const { tokens } = await oAuth2Client.getToken(code);
            oAuth2Client.setCredentials(tokens);

            // Get user info
            const oauth2 = google.oauth2({ version: 'v2', auth: oAuth2Client });
            const userInfo = await oauth2.userinfo.get();
            
            const actualEmail = userInfo.data.email || email;
            
            // Save tokens and account info
            await this.saveTokens(actualEmail, tokens, userInfo.data);
            
            // Store OAuth client
            this.oauthClients.set(actualEmail, oAuth2Client);
            
            // Clean up
            this.pendingAuthUrls.delete(state);
            this.authServers.delete(state);
            
            // Send success response
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <head>
                  <title>Authentication Successful</title>
                  <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                    h1 { color: #4CAF50; }
                    p { color: #666; }
                  </style>
                </head>
                <body>
                  <h1>✓ Authentication Successful!</h1>
                  <p>Account ${actualEmail} has been successfully authenticated.</p>
                  <p>You can now close this window and return to your application.</p>
                </body>
              </html>
            `);
            
            // Close server after response
            setTimeout(() => {
              server.close();
            }, 1000);
            
            resolve();
          }
        } catch (error) {
          this.logger.error('Error in auth callback:', error);
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end('<h1>Authentication Error</h1><p>An error occurred during authentication.</p>');
          server.close();
          reject(error);
        }
      });

      server.listen(port, () => {
        this.logger.info(`Auth server listening on port ${port} for ${email}`);
        this.authServers.set(state, server);
        resolve();
      });

      // Auto-close server after 5 minutes
      setTimeout(() => {
        if (this.authServers.has(state)) {
          server.close();
          this.authServers.delete(state);
          this.pendingAuthUrls.delete(state);
          this.logger.info(`Auth server timeout for ${email}`);
        }
      }, 5 * 60 * 1000);
    });
  }

  private async saveTokens(email: string, tokens: any, userInfo: any): Promise<void> {
    const accountInfo: AccountInfo = {
      email: email,
      accountType: email.includes('@gmail.com') ? 'personal' : 'workspace',
      displayName: userInfo.name,
      picture: userInfo.picture,
      authenticatedAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      scopes: tokens.scope ? tokens.scope.split(' ') : this.SCOPES,
    };

    const tokenData = {
      tokens: tokens,
      accountInfo: accountInfo,
    };

    const tokenPath = path.join(this.tokensPath, `${email}.json`);
    await fs.writeFile(tokenPath, JSON.stringify(tokenData, null, 2));
    
    this.logger.info(`Saved tokens for ${email}`);
  }

  async getAuthClient(email: string): Promise<OAuth2Client | null> {
    // Check if already in memory
    if (this.oauthClients.has(email)) {
      const client = this.oauthClients.get(email)!;
      await this.updateLastUsed(email);
      return client;
    }

    // Try to load from disk
    try {
      const tokenPath = path.join(this.tokensPath, `${email}.json`);
      const tokenContent = await fs.readFile(tokenPath, 'utf-8');
      const tokenData = JSON.parse(tokenContent);
      
      const oAuth2Client = await this.createOAuthClient();
      oAuth2Client.setCredentials(tokenData.tokens);
      
      // Check if token needs refresh
      if (this.isTokenExpired(tokenData.tokens)) {
        await this.refreshToken(oAuth2Client, email);
      }
      
      this.oauthClients.set(email, oAuth2Client);
      await this.updateLastUsed(email);
      
      return oAuth2Client;
    } catch (error) {
      this.logger.error(`Failed to get auth client for ${email}:`, error);
      return null;
    }
  }

  private isTokenExpired(tokens: any): boolean {
    if (!tokens.expiry_date) return false;
    return Date.now() >= tokens.expiry_date;
  }

  private async refreshToken(oAuth2Client: OAuth2Client, email: string): Promise<void> {
    try {
      const { credentials } = await oAuth2Client.refreshAccessToken();
      oAuth2Client.setCredentials(credentials);
      
      // Update saved tokens
      const tokenPath = path.join(this.tokensPath, `${email}.json`);
      const tokenContent = await fs.readFile(tokenPath, 'utf-8');
      const tokenData = JSON.parse(tokenContent);
      tokenData.tokens = credentials;
      await fs.writeFile(tokenPath, JSON.stringify(tokenData, null, 2));
      
      this.logger.info(`Refreshed token for ${email}`);
    } catch (error) {
      this.logger.error(`Failed to refresh token for ${email}:`, error);
      throw error;
    }
  }

  private async updateLastUsed(email: string): Promise<void> {
    try {
      const tokenPath = path.join(this.tokensPath, `${email}.json`);
      const tokenContent = await fs.readFile(tokenPath, 'utf-8');
      const tokenData = JSON.parse(tokenContent);
      tokenData.accountInfo.lastUsed = new Date().toISOString();
      await fs.writeFile(tokenPath, JSON.stringify(tokenData, null, 2));
    } catch (error) {
      this.logger.warn(`Failed to update last used for ${email}:`, error);
    }
  }

  async listAccounts(): Promise<AccountInfo[]> {
    const accounts: AccountInfo[] = [];
    
    try {
      const files = await fs.readdir(this.tokensPath);
      const tokenFiles = files.filter(f => f.endsWith('.json'));
      
      for (const file of tokenFiles) {
        try {
          const tokenPath = path.join(this.tokensPath, file);
          const tokenContent = await fs.readFile(tokenPath, 'utf-8');
          const tokenData = JSON.parse(tokenContent);
          accounts.push(tokenData.accountInfo);
        } catch (error) {
          this.logger.error(`Failed to read account info from ${file}:`, error);
        }
      }
    } catch (error) {
      this.logger.error('Failed to list accounts:', error);
    }
    
    return accounts;
  }

  async removeAccount(email: string): Promise<void> {
    try {
      // Remove from memory
      this.oauthClients.delete(email);
      
      // Remove from disk
      const tokenPath = path.join(this.tokensPath, `${email}.json`);
      await fs.unlink(tokenPath);
      
      this.logger.info(`Removed account: ${email}`);
    } catch (error) {
      this.logger.error(`Failed to remove account ${email}:`, error);
      throw error;
    }
  }

  async revokeToken(email: string): Promise<void> {
    try {
      const client = await this.getAuthClient(email);
      if (client) {
        await client.revokeCredentials();
        await this.removeAccount(email);
        this.logger.info(`Revoked token for ${email}`);
      }
    } catch (error) {
      this.logger.error(`Failed to revoke token for ${email}:`, error);
      throw error;
    }
  }
}