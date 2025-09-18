import { pino, type Logger } from 'pino';
import { env } from './env.js';

export const logger: Logger = pino({
    mixin(_context, level) {
        return { label: logger.levels.labels[level] };
    },
    level: env.LOG_LEVEL || 'info',
    // Simple console output without pino-pretty
    formatters: {
        level: (label) => {
            return { level: label };
        }
    }
});

export const customLogger = (message: string, ...rest: string[]) => {
    logger.trace({ ...rest, originalMessage: message }, message);
};

