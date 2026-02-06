// Simple in-memory logger for debugging
// Stores last N log entries for admin download

interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  source: string;
  message: string;
  details?: unknown;
}

const MAX_ENTRIES = 500;
const logs: LogEntry[] = [];

function addEntry(level: LogEntry["level"], source: string, message: string, details?: unknown) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    source,
    message,
    details: details instanceof Error
      ? { name: details.name, message: details.message, stack: details.stack }
      : details,
  };

  logs.push(entry);

  // Keep only last N entries
  if (logs.length > MAX_ENTRIES) {
    logs.shift();
  }

  // Also log to console
  const prefix = `[${entry.timestamp}] [${level.toUpperCase()}] [${source}]`;
  if (level === "error") {
    console.error(prefix, message, details || "");
  } else if (level === "warn") {
    console.warn(prefix, message, details || "");
  } else {
    console.log(prefix, message, details || "");
  }
}

export const logger = {
  info: (source: string, message: string, details?: unknown) =>
    addEntry("info", source, message, details),

  warn: (source: string, message: string, details?: unknown) =>
    addEntry("warn", source, message, details),

  error: (source: string, message: string, details?: unknown) =>
    addEntry("error", source, message, details),

  getLogs: (limit = 200, level?: LogEntry["level"]) => {
    let filtered = level ? logs.filter(l => l.level === level) : logs;
    return filtered.slice(-limit);
  },

  getLogsAsText: (limit = 200) => {
    const entries = logs.slice(-limit);
    return entries.map(e => {
      const details = e.details ? `\n  ${JSON.stringify(e.details, null, 2).replace(/\n/g, '\n  ')}` : '';
      return `[${e.timestamp}] [${e.level.toUpperCase()}] [${e.source}] ${e.message}${details}`;
    }).join('\n\n');
  },

  clear: () => {
    logs.length = 0;
  },
};
