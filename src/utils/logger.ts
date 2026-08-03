type DevGlobal = typeof globalThis & { __DEV__?: boolean };
const isDev = (globalThis as DevGlobal).__DEV__ === true;

export const logger = {
  debug: (...args: unknown[]) => {
    if (isDev) {
      // eslint-disable-next-line no-console
      console.debug(...(args as unknown[]));
    }
  },
  info: (...args: unknown[]) => {
    if (isDev) {
      // eslint-disable-next-line no-console
      console.info(...(args as unknown[]));
    }
  },
  warn: (...args: unknown[]) => {
    // eslint-disable-next-line no-console
    console.warn(...(args as unknown[]));
  },
  error: (...args: unknown[]) => {
    // eslint-disable-next-line no-console
    console.error(...(args as unknown[]));
  },
};

export default logger;
