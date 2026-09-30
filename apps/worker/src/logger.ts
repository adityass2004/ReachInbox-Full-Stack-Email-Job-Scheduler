export type LogLevel = "info" | "warn" | "error" | "debug";

export interface StructuredLogPayload {
  level: LogLevel;
  event: string;
  message: string;
  timestamp: string;
  service: string;
  data?: Record<string, unknown>;
}

class StructuredLogger {
  private serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  private log(
    level: LogLevel,
    event: string,
    message: string,
    data?: Record<string, unknown>,
  ): void {
    const entry: StructuredLogPayload = {
      level,
      event,
      message,
      timestamp: new Date().toISOString(),
      service: this.serviceName,
      data,
    };

    const formatted = `[${entry.timestamp}] [${level.toUpperCase()}] [${event}] ${message}${
      data ? " " + JSON.stringify(data) : ""
    }`;

    if (level === "error") {
      // eslint-disable-next-line no-console
      console.error(formatted);
    } else if (level === "warn") {
      // eslint-disable-next-line no-console
      console.warn(formatted);
    } else {
      // eslint-disable-next-line no-console
      console.log(formatted);
    }
  }

  info(event: string, message: string, data?: Record<string, unknown>): void {
    this.log("info", event, message, data);
  }

  warn(event: string, message: string, data?: Record<string, unknown>): void {
    this.log("warn", event, message, data);
  }

  error(event: string, message: string, data?: Record<string, unknown>): void {
    this.log("error", event, message, data);
  }
}

export const logger = new StructuredLogger("reachinbox-worker");
