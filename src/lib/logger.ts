import winston from 'winston';
import 'winston-daily-rotate-file';

const { combine, timestamp, printf, colorize } = winston.format;

// Standard JSON format for rotating files (easily parsable by logstash/datadog/etc)
const fileFormat = combine(
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  printf(({ level, message, timestamp, ...metadata }) => {
    return JSON.stringify({ timestamp, level, message, ...metadata });
  })
);

// Colorized format for PM2 / Local Dev stdout
const consoleFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  printf(({ level, message, timestamp, ...metadata }) => {
    let msg = `[${timestamp}] ${level}: ${message}`;
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  })
);

// Configure the Winston Logger
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info', // Adjust default level if needed
  format: fileFormat,
  transports: [
    // 1. Daily Rolling File Transport
    new winston.transports.DailyRotateFile({
      filename: 'logs/api-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true, // Compress older logs
      maxSize: '20m',      // Rotate if file exceeds 20MB
      maxFiles: '14d',     // Keep logs for 14 days
    }),
    
    // 2. Standard Console output (for local tailing)
    new winston.transports.Console({
      format: consoleFormat,
    })
  ],
});
