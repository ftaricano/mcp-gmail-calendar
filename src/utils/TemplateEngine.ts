import Handlebars from 'handlebars';
import fs from 'fs/promises';
import path from 'path';
import juice from 'juice';
import { Logger } from './Logger.js';

export interface EmailTemplate {
  id: string;
  name: string;
  description?: string;
  category: 'business' | 'personal' | 'marketing' | 'system';
  theme: 'professional' | 'modern' | 'minimal' | 'corporate';
  htmlContent: string;
  textContent?: string;
  requiredVariables: string[];
  optionalVariables: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TemplateData {
  // Common variables
  recipientName?: string;
  senderName?: string;
  companyName?: string;
  logoUrl?: string;
  subject?: string;
  emailTitle?: string;
  signature?: string;
  unsubscribeUrl?: string;
  
  // Custom variables
  [key: string]: any;
}

export class TemplateEngine {
  private logger: Logger;
  private templatesPath: string;
  private compiledTemplates: Map<string, HandlebarsTemplateDelegate> = new Map();
  private templates: Map<string, EmailTemplate> = new Map();

  constructor() {
    this.logger = new Logger('TemplateEngine');
    this.templatesPath = process.env.TEMPLATE_PATH || './templates';
    this.setupHelpers();
  }

  async initialize(): Promise<void> {
    try {
      // Ensure templates directory exists
      await fs.mkdir(this.templatesPath, { recursive: true });
      
      // Create default templates if they don't exist
      await this.createDefaultTemplates();
      
      // Load existing templates
      await this.loadTemplates();
      
      this.logger.info('TemplateEngine initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize TemplateEngine:', error);
      throw error;
    }
  }

  private setupHelpers(): void {
    // Date formatting helper
    Handlebars.registerHelper('formatDate', (date: string | Date, format: string = 'YYYY-MM-DD') => {
      const d = new Date(date);
      // Basic date formatting - in production you might want to use a library like dayjs
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    });

    // Conditional helper
    Handlebars.registerHelper('if_eq', (a: any, b: any, options: any) => {
      return a === b ? options.fn(this) : options.inverse(this);
    });

    // URL helper
    Handlebars.registerHelper('url', (url: string) => {
      return url.startsWith('http') ? url : `https://${url}`;
    });

    // Default value helper
    Handlebars.registerHelper('default', (value: any, defaultValue: any) => {
      return value || defaultValue;
    });

    // Capitalize helper
    Handlebars.registerHelper('capitalize', (str: string) => {
      return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
    });

    // Currency helper
    Handlebars.registerHelper('currency', (amount: number, currency: string = 'USD') => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
      }).format(amount);
    });
  }

  private async createDefaultTemplates(): Promise<void> {
    const defaultTemplates = [
      {
        id: 'professional_basic',
        name: 'Professional Basic',
        description: 'Clean and professional email template for business communication',
        category: 'business' as const,
        theme: 'professional' as const,
        requiredVariables: ['emailTitle', 'content'],
        optionalVariables: ['senderName', 'companyName', 'logoUrl', 'signature'],
        htmlContent: await this.getProfessionalTemplate(),
      },
      {
        id: 'modern_notification',
        name: 'Modern Notification',
        description: 'Modern template for notifications and updates',
        category: 'system' as const,
        theme: 'modern' as const,
        requiredVariables: ['emailTitle', 'content'],
        optionalVariables: ['actionUrl', 'actionText', 'companyName'],
        htmlContent: await this.getModernTemplate(),
      },
      {
        id: 'minimal_personal',
        name: 'Minimal Personal',
        description: 'Clean minimal template for personal emails',
        category: 'personal' as const,
        theme: 'minimal' as const,
        requiredVariables: ['content'],
        optionalVariables: ['recipientName', 'senderName'],
        htmlContent: await this.getMinimalTemplate(),
      },
      {
        id: 'corporate_formal',
        name: 'Corporate Formal',
        description: 'Formal corporate template with company branding',
        category: 'business' as const,
        theme: 'corporate' as const,
        requiredVariables: ['emailTitle', 'content', 'companyName'],
        optionalVariables: ['logoUrl', 'senderName', 'signature', 'footerContent'],
        htmlContent: await this.getCorporateTemplate(),
      },
    ];

    for (const template of defaultTemplates) {
      const templatePath = path.join(this.templatesPath, `${template.id}.json`);
      
      try {
        await fs.access(templatePath);
        // Template already exists, skip
      } catch {
        // Template doesn't exist, create it
        const fullTemplate: EmailTemplate = {
          ...template,
          textContent: this.htmlToText(template.htmlContent),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        
        await fs.writeFile(templatePath, JSON.stringify(fullTemplate, null, 2));
        this.logger.info(`Created default template: ${template.name}`);
      }
    }
  }

  private async getProfessionalTemplate(): Promise<string> {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{emailTitle}}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #333333;
            margin: 0;
            padding: 0;
            background-color: #f4f4f4;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            padding: 0;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
            border-radius: 8px 8px 0 0;
        }
        {{#if logoUrl}}
        .logo {
            max-width: 200px;
            height: auto;
            margin-bottom: 20px;
        }
        {{/if}}
        .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 600;
        }
        .content {
            padding: 40px 30px;
        }
        .content h2 {
            color: #333;
            font-size: 20px;
            margin-bottom: 20px;
        }
        .content p {
            margin-bottom: 16px;
        }
        .cta-button {
            display: inline-block;
            padding: 12px 24px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            margin: 20px 0;
        }
        .footer {
            background-color: #f8f9fa;
            padding: 30px;
            text-align: center;
            border-radius: 0 0 8px 8px;
            border-top: 1px solid #e9ecef;
        }
        .signature {
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid #e9ecef;
            font-size: 14px;
            color: #666;
        }
        @media screen and (max-width: 600px) {
            .container {
                margin: 0;
                border-radius: 0;
            }
            .header, .content, .footer {
                padding: 20px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            {{#if logoUrl}}
            <img src="{{logoUrl}}" alt="{{default companyName 'Company Logo'}}" class="logo">
            {{/if}}
            <h1>{{emailTitle}}</h1>
        </div>
        
        <div class="content">
            {{#if recipientName}}
            <p>Dear {{recipientName}},</p>
            {{/if}}
            
            {{{content}}}
            
            {{#if actionUrl}}
            <p style="text-align: center;">
                <a href="{{actionUrl}}" class="cta-button">{{default actionText 'Learn More'}}</a>
            </p>
            {{/if}}
        </div>
        
        <div class="footer">
            {{#if signature}}
            <div class="signature">
                {{{signature}}}
            </div>
            {{else}}
            {{#if senderName}}
            <p>Best regards,<br>{{senderName}}</p>
            {{/if}}
            {{#if companyName}}
            <p><strong>{{companyName}}</strong></p>
            {{/if}}
            {{/if}}
        </div>
    </div>
</body>
</html>`;
  }

  private async getModernTemplate(): Promise<string> {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{emailTitle}}</title>
    <style>
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #1a202c;
            margin: 0;
            padding: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .container {
            max-width: 600px;
            margin: 40px auto;
            background-color: #ffffff;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        }
        .header {
            background: linear-gradient(135deg, #4c51bf 0%, #553c9a 100%);
            color: white;
            padding: 40px 30px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 700;
            letter-spacing: -0.025em;
        }
        .content {
            padding: 40px;
        }
        .alert {
            padding: 16px;
            border-radius: 12px;
            margin-bottom: 24px;
            background: linear-gradient(135deg, #fef3cd 0%, #fde68a 100%);
            border-left: 4px solid #f59e0b;
        }
        .cta-button {
            display: inline-block;
            padding: 16px 32px;
            background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
            color: white;
            text-decoration: none;
            border-radius: 12px;
            font-weight: 600;
            font-size: 16px;
            margin: 24px 0;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            transition: all 0.3s ease;
        }
        .footer {
            background-color: #f7fafc;
            padding: 30px;
            text-align: center;
            color: #718096;
            font-size: 14px;
        }
        @media screen and (max-width: 600px) {
            .container {
                margin: 20px;
                border-radius: 12px;
            }
            .header, .content, .footer {
                padding: 24px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{{emailTitle}}</h1>
        </div>
        
        <div class="content">
            {{#if isAlert}}
            <div class="alert">
                {{{content}}}
            </div>
            {{else}}
            {{{content}}}
            {{/if}}
            
            {{#if actionUrl}}
            <p style="text-align: center;">
                <a href="{{actionUrl}}" class="cta-button">{{default actionText 'Take Action'}}</a>
            </p>
            {{/if}}
        </div>
        
        <div class="footer">
            {{#if companyName}}
            <p>&copy; {{formatDate 'now' 'YYYY'}} {{companyName}}. All rights reserved.</p>
            {{/if}}
        </div>
    </div>
</body>
</html>`;
  }

  private async getMinimalTemplate(): Promise<string> {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Email</title>
    <style>
        body {
            font-family: Georgia, 'Times New Roman', serif;
            line-height: 1.8;
            color: #2d3748;
            margin: 0;
            padding: 40px 20px;
            background-color: #ffffff;
        }
        .container {
            max-width: 500px;
            margin: 0 auto;
        }
        h1, h2, h3 {
            color: #1a202c;
            font-weight: 400;
        }
        p {
            margin-bottom: 20px;
        }
        .signature {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
            font-style: italic;
            color: #718096;
        }
        a {
            color: #3182ce;
            text-decoration: underline;
        }
        @media screen and (max-width: 600px) {
            body {
                padding: 20px 10px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        {{#if recipientName}}
        <p>{{recipientName}},</p>
        {{/if}}
        
        {{{content}}}
        
        {{#if senderName}}
        <div class="signature">
            — {{senderName}}
        </div>
        {{/if}}
    </div>
</body>
</html>`;
  }

  private async getCorporateTemplate(): Promise<string> {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{emailTitle}}</title>
    <style>
        body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #333333;
            margin: 0;
            padding: 0;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 650px;
            margin: 20px auto;
            background-color: #ffffff;
            border: 1px solid #dddddd;
        }
        .header {
            background-color: #ffffff;
            padding: 30px;
            border-bottom: 3px solid #0066cc;
        }
        .logo {
            max-width: 250px;
            height: auto;
        }
        .company-info {
            margin-top: 20px;
            font-size: 14px;
            color: #666666;
        }
        .title-bar {
            background-color: #0066cc;
            color: white;
            padding: 20px 30px;
            font-size: 20px;
            font-weight: 600;
        }
        .content {
            padding: 40px 30px;
        }
        .content h2 {
            color: #0066cc;
            font-size: 18px;
            margin-bottom: 20px;
            font-weight: 600;
        }
        .highlight-box {
            background-color: #f8f9fa;
            border-left: 4px solid #0066cc;
            padding: 20px;
            margin: 20px 0;
        }
        .cta-section {
            text-align: center;
            margin: 30px 0;
        }
        .cta-button {
            display: inline-block;
            padding: 14px 28px;
            background-color: #0066cc;
            color: white;
            text-decoration: none;
            border-radius: 4px;
            font-weight: 600;
            font-size: 16px;
        }
        .footer {
            background-color: #f8f9fa;
            padding: 30px;
            border-top: 1px solid #dddddd;
            font-size: 12px;
            color: #666666;
        }
        .footer-content {
            text-align: center;
        }
        .disclaimer {
            margin-top: 20px;
            font-size: 11px;
            color: #999999;
            line-height: 1.4;
        }
        @media screen and (max-width: 600px) {
            .header, .content, .footer {
                padding: 20px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            {{#if logoUrl}}
            <img src="{{logoUrl}}" alt="{{companyName}}" class="logo">
            {{/if}}
            <div class="company-info">
                <strong>{{companyName}}</strong>
                {{#if companyAddress}}
                <br>{{companyAddress}}
                {{/if}}
                {{#if companyPhone}}
                <br>Tel: {{companyPhone}}
                {{/if}}
                {{#if companyWebsite}}
                <br>{{companyWebsite}}
                {{/if}}
            </div>
        </div>
        
        <div class="title-bar">
            {{emailTitle}}
        </div>
        
        <div class="content">
            {{#if recipientName}}
            <p>Dear {{recipientName}},</p>
            {{/if}}
            
            {{{content}}}
            
            {{#if highlightContent}}
            <div class="highlight-box">
                {{{highlightContent}}}
            </div>
            {{/if}}
            
            {{#if actionUrl}}
            <div class="cta-section">
                <a href="{{actionUrl}}" class="cta-button">{{default actionText 'View Details'}}</a>
            </div>
            {{/if}}
            
            {{#if signature}}
            <div style="margin-top: 30px;">
                {{{signature}}}
            </div>
            {{/if}}
        </div>
        
        <div class="footer">
            <div class="footer-content">
                {{#if footerContent}}
                {{{footerContent}}}
                {{else}}
                <p><strong>{{companyName}}</strong></p>
                <p>This email was sent to you as part of our business communication.</p>
                {{/if}}
                
                <div class="disclaimer">
                    <p>This email and any attachments are confidential and may be privileged. 
                    If you are not the intended recipient, please notify the sender immediately 
                    and delete this email from your system.</p>
                </div>
            </div>
        </div>
    </div>
</body>
</html>`;
  }

  private htmlToText(html: string): string {
    // Simple HTML to text conversion
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async loadTemplates(): Promise<void> {
    try {
      const files = await fs.readdir(this.templatesPath);
      const templateFiles = files.filter(f => f.endsWith('.json'));

      for (const file of templateFiles) {
        try {
          const templatePath = path.join(this.templatesPath, file);
          const templateContent = await fs.readFile(templatePath, 'utf-8');
          const template: EmailTemplate = JSON.parse(templateContent);
          
          this.templates.set(template.id, template);
          
          // Pre-compile the template
          const compiled = Handlebars.compile(template.htmlContent);
          this.compiledTemplates.set(template.id, compiled);
          
          this.logger.debug(`Loaded template: ${template.name}`);
        } catch (error) {
          this.logger.error(`Failed to load template ${file}:`, error);
        }
      }

      this.logger.info(`Loaded ${this.templates.size} templates`);
    } catch (error) {
      this.logger.error('Failed to load templates:', error);
    }
  }

  async listTemplates(): Promise<EmailTemplate[]> {
    return Array.from(this.templates.values());
  }

  async getTemplate(templateId: string): Promise<EmailTemplate | null> {
    return this.templates.get(templateId) || null;
  }

  async render(templateId: string, data: TemplateData): Promise<string> {
    const compiledTemplate = this.compiledTemplates.get(templateId);
    if (!compiledTemplate) {
      throw new Error(`Template not found: ${templateId}`);
    }

    try {
      const html = compiledTemplate(data);
      
      // Inline CSS for better email client compatibility
      const inlinedHtml = juice(html);
      
      return inlinedHtml;
    } catch (error) {
      this.logger.error(`Failed to render template ${templateId}:`, error);
      throw error;
    }
  }

  async wrapInDefaultTemplate(content: string, subject?: string): Promise<string> {
    const defaultTheme = process.env.DEFAULT_EMAIL_THEME || 'professional';
    const templateId = `${defaultTheme}_basic`;
    
    return this.render(templateId, {
      emailTitle: subject || 'Email',
      content: content,
    });
  }

  async createTemplate(
    name: string,
    htmlContent: string,
    description?: string,
    options?: Partial<EmailTemplate>
  ): Promise<string> {
    const templateId = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    
    const template: EmailTemplate = {
      id: templateId,
      name,
      description,
      category: options?.category || 'business',
      theme: options?.theme || 'professional',
      htmlContent,
      textContent: this.htmlToText(htmlContent),
      requiredVariables: options?.requiredVariables || ['content'],
      optionalVariables: options?.optionalVariables || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...options,
    };

    // Save to file
    const templatePath = path.join(this.templatesPath, `${templateId}.json`);
    await fs.writeFile(templatePath, JSON.stringify(template, null, 2));

    // Store in memory
    this.templates.set(templateId, template);
    
    // Compile template
    const compiled = Handlebars.compile(htmlContent);
    this.compiledTemplates.set(templateId, compiled);

    this.logger.info(`Created template: ${name}`);
    return templateId;
  }

  async updateTemplate(templateId: string, updates: Partial<EmailTemplate>): Promise<void> {
    const existingTemplate = this.templates.get(templateId);
    if (!existingTemplate) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const updatedTemplate: EmailTemplate = {
      ...existingTemplate,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    // Update text content if HTML content changed
    if (updates.htmlContent) {
      updatedTemplate.textContent = this.htmlToText(updates.htmlContent);
    }

    // Save to file
    const templatePath = path.join(this.templatesPath, `${templateId}.json`);
    await fs.writeFile(templatePath, JSON.stringify(updatedTemplate, null, 2));

    // Update in memory
    this.templates.set(templateId, updatedTemplate);
    
    // Re-compile template
    const compiled = Handlebars.compile(updatedTemplate.htmlContent);
    this.compiledTemplates.set(templateId, compiled);

    this.logger.info(`Updated template: ${templateId}`);
  }

  async deleteTemplate(templateId: string): Promise<void> {
    if (!this.templates.has(templateId)) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Remove from file system
    const templatePath = path.join(this.templatesPath, `${templateId}.json`);
    await fs.unlink(templatePath);

    // Remove from memory
    this.templates.delete(templateId);
    this.compiledTemplates.delete(templateId);

    this.logger.info(`Deleted template: ${templateId}`);
  }
}