import winston from 'winston';
import path from 'path';

const redactedKeys = new Set([
  'accessToken',
  'access_token',
  'apiKey',
  'apikey',
  'args',
  'authorization',
  'bcc',
  'body',
  'bodyHtml',
  'clientSecret',
  'client_secret',
  'content',
  'cookie',
  'credentials',
  'html',
  'idToken',
  'id_token',
  'raw',
  'refreshToken',
  'refresh_token',
  'secret',
  'token',
]);

export function sanitizeLogMeta(meta: unknown): unknown {
  return redactLogValue(meta, new WeakSet<object>());
}

function redactLogValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactLogValue(item, seen));
  }

  if (value instanceof Error) {
    return {
      error: value.message,
      stack: value.stack,
    };
  }

  if (typeof value === 'object') {
    if (seen.has(value as object)) {
      return '[Circular]';
    }

    seen.add(value as object);

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => {
        if (redactedKeys.has(key)) {
          return [key, '[REDACTED]'];
        }

        return [key, redactLogValue(entryValue, seen)];
      })
    );
  }

  return value;
}

export class Logger {
  private logger: winston.Logger;

  constructor(module: string) {
    const logLevel = process.env.LOG_LEVEL || 'info';
    const logFilePath = process.env.LOG_FILE_PATH || './logs/mcp-gmail-calendar.log';

    // Create logs directory if it doesn't exist
    const logDir = path.dirname(logFilePath);

    const transports: winston.transport[] = [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta) : '';
            return `${timestamp} [${module}] ${level}: ${message} ${metaStr}`;
          })
        ),
      }),
    ];

    // Add file transport if log file path is provided
    if (logFilePath) {
      try {
        transports.push(
          new winston.transports.File({
            filename: logFilePath,
            format: winston.format.combine(
              winston.format.timestamp(),
              winston.format.json()
            ),
          })
        );
      } catch (error) {
        console.warn('Failed to create file logger:', error);
      }
    }

    this.logger = winston.createLogger({
      level: logLevel,
      transports,
      exceptionHandlers: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp(),
            winston.format.simple()
          ),
        }),
      ],
      rejectionHandlers: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp(),
            winston.format.simple()
          ),
        }),
      ],
    });
  }

  debug(message: string, meta?: any): void {
    this.logger.debug(message, this.sanitizeMeta(meta));
  }

  info(message: string, meta?: any): void {
    this.logger.info(message, this.sanitizeMeta(meta));
  }

  warn(message: string, meta?: any): void {
    this.logger.warn(message, this.sanitizeMeta(meta));
  }

  error(message: string, error?: any): void {
    if (error instanceof Error) {
      this.logger.error(message, {
        error: error.message,
        stack: error.stack,
      });
    } else {
      this.logger.error(message, this.sanitizeMeta(error));
    }
  }

  private sanitizeMeta(meta: unknown): unknown {
    return sanitizeLogMeta(meta);
  }
}
