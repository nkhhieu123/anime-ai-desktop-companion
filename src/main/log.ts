/**
 * Minimal structured logger. Stage 2 replaces the sink with a rotating file
 * logger with redaction; call sites stay the same.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';
type Fields = Record<string, string | number | boolean | null | undefined>;

function write(level: Level, message: string, fields?: Fields): void {
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}`;
  const suffix = fields ? ` ${JSON.stringify(fields)}` : '';
  if (level === 'error' || level === 'warn') console.error(line + suffix);
  else console.log(line + suffix);
}

export const log = {
  debug: (message: string, fields?: Fields) => write('debug', message, fields),
  info: (message: string, fields?: Fields) => write('info', message, fields),
  warn: (message: string, fields?: Fields) => write('warn', message, fields),
  error: (message: string, fields?: Fields) => write('error', message, fields),
};
