/** App-wide logger instance. Import this — never create ad-hoc loggers. */
import { createLogger } from './logger';

export const logger = createLogger({ level: 'info' });
