import winston from 'winston';
import path from 'path';

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
    this.logger.debug(message, meta);
  }

  info(message: string, meta?: any): void {
    this.logger.info(message, meta);
  }

  warn(message: string, meta?: any): void {
    this.logger.warn(message, meta);
  }

  error(message: string, error?: any): void {
    if (error instanceof Error) {
      this.logger.error(message, {
        error: error.message,
        stack: error.stack,
      });
    } else {
      this.logger.error(message, error);
    }
  }
}