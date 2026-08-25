export type LogLevel = 'log' | 'warn' | 'error' | 'debug';

interface Logger {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

const noop = () => {};

const createLogger = (): Logger => {
  if (!__DEV__) {
    return {
      log: noop,
      warn: noop,
      // eslint-disable-next-line no-console
      error: console.error,
      debug: noop,
    };
  }

  return {
    // eslint-disable-next-line no-console
    log: (...args: unknown[]) => console.log(...args),
    // eslint-disable-next-line no-console
    warn: (...args: unknown[]) => console.warn(...args),
    // eslint-disable-next-line no-console
    error: (...args: unknown[]) => console.error(...args),
    // eslint-disable-next-line no-console
    debug: (...args: unknown[]) => console.log('[DEBUG]', ...args),
  };
};

export const logger = createLogger();

export const createScopedLogger = (scope: string): Logger => {
  const base = createLogger();
  const prefix = `[${scope}]`;

  return {
    log: (...args: unknown[]) => base.log(prefix, ...args),
    warn: (...args: unknown[]) => base.warn(prefix, ...args),
    error: (...args: unknown[]) => base.error(prefix, ...args),
    debug: (...args: unknown[]) => base.debug(prefix, ...args),
  };
};

export default logger;
