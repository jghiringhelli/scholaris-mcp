/**
 * Minimal structured logger for scholaris-mcp.
 * Writes JSON lines to stderr (never stdout, which is reserved for MCP).
 */

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

interface LogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly service: string;
  readonly module: string;
  readonly message: string;
  readonly [key: string]: unknown;
}

function emit(level: LogLevel, module: string, message: string, extra: Record<string, unknown> = {}): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    service: "scholaris",
    module,
    message,
    ...extra,
  };
  process.stderr.write(JSON.stringify(entry) + "\n");
}

export const logger = {
  debug: (module: string, message: string, extra?: Record<string, unknown>) =>
    emit("DEBUG", module, message, extra),
  info: (module: string, message: string, extra?: Record<string, unknown>) =>
    emit("INFO", module, message, extra),
  warn: (module: string, message: string, extra?: Record<string, unknown>) =>
    emit("WARN", module, message, extra),
  error: (module: string, message: string, extra?: Record<string, unknown>) =>
    emit("ERROR", module, message, extra),
};
