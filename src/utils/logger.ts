const isDev = (globalThis as any).__DEV__ === true;

export const logger = {
  debug: (...args: any[]) => {
    if (isDev) {
      // eslint-disable-next-line no-console
      console.debug(...args);
    }
  },
  info: (...args: any[]) => {
    if (isDev) {
      // eslint-disable-next-line no-console
      console.info(...args);
    }
  },
  warn: (...args: any[]) => {
    // eslint-disable-next-line no-console
    console.warn(...args);
  },
  error: (...args: any[]) => {
    // eslint-disable-next-line no-console
    console.error(...args);
  },
};

export default logger;
