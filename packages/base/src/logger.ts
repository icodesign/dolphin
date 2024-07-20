import chalk from 'chalk';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import stripAnsi from 'strip-ansi';
import winston from 'winston';
import 'winston-daily-rotate-file';

const onlyConsole = winston.format((info, opts) => {
  if (!info.console) {
    return false;
  }
  return info;
});

function createLogger() {
  let logDirectory: string;
  if (process.platform === 'darwin') {
    // macOS
    logDirectory = path.join(os.homedir(), 'Library/Logs/Dolphin/');
  } else {
    throw new Error(`Unsupported platform: ${process.platform}`);
  }
  // Create directory recursively if it doesn't exist
  if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory, { recursive: true });
  }
  const level = process.env.NODE_ENV === 'production' ? 'info' : 'debug';
  const format = winston.format.combine(
    winston.format.errors({ stack: true }),
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss Z',
    }),
  );
  // Store all logs in file
  const fileTransport = new winston.transports.DailyRotateFile({
    filename: 'dolphin-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    zippedArchive: false,
    maxSize: '20m',
    maxFiles: '7d',
    dirname: logDirectory,
    format: winston.format.combine(
      winston.format.printf((info) => {
        const { timestamp, level, message, stack } = info;
        var result = '';
        if (stack) {
          result += `${timestamp} [${level}]: ${stack}`;
        } else {
          result += `${timestamp} [${level}]: ${message}`;
        }
        return stripAnsi(result); // remove chalk colors
      }),
    ),
    handleExceptions: true,
  });
  // Display user friendly message in console
  const consoleTransport = new winston.transports.Console({
    format: winston.format.combine(
      onlyConsole(),
      winston.format.printf((info) => {
        const { message, stack } = info;
        var result = '';
        if (stack) {
          result += chalk.red(`${stack}`);
        } else {
          result += message;
        }
        return result;
      }),
    ),
    handleExceptions: true,
  });
  const logger = winston.createLogger({
    level: level,
    format,
    transports: [fileTransport, consoleTransport],
  });
  const consoleLogger = logger.child({ console: true });
  return {
    consoleLogger,
    logger,
    logDirectory,
  };
}

const l = createLogger();
export const consoleLogger = l.consoleLogger;
export const logger = l.logger;
export const logDirectory = l.logDirectory;
