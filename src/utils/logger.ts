/**
 * Logging System
 * Centralized, configurable logging with multiple levels and outputs
 */

/**
 * Log levels in order of severity
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4, // Disable all logging
}

/**
 * Log entry structure
 */
export interface LogEntry {
  level: LogLevel;
  timestamp: number;
  component: string;
  message: string;
  data?: unknown;
  error?: Error;
}

/**
 * Log handler interface for custom output targets
 */
export interface LogHandler {
  (entry: LogEntry): void;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  /** Minimum log level to output (default: INFO) */
  level?: LogLevel;
  /** Enable timestamps in console output (default: true) */
  timestamps?: boolean;
  /** Enable component names in console output (default: true) */
  componentNames?: boolean;
  /** Custom log handlers (e.g., remote logging, file output) */
  handlers?: LogHandler[];
  /** Enable colored console output (default: true) */
  colors?: boolean;
}

const DEFAULT_CONFIG: Required<LoggerConfig> = {
  level: LogLevel.INFO,
  timestamps: true,
  componentNames: true,
  handlers: [],
  colors: true,
};

/**
 * Centralized Logger
 * Provides structured logging with configurable output
 */
export class Logger {
  private static config: Required<LoggerConfig> = { ...DEFAULT_CONFIG };
  private static enabled = true;

  /**
   * Configure global logger settings
   */
  static configure(config: LoggerConfig): void {
    Logger.config = { ...Logger.config, ...config };
  }

  /**
   * Get current configuration
   */
  static getConfig(): Required<LoggerConfig> {
    return { ...Logger.config };
  }

  /**
   * Enable logging
   */
  static enable(): void {
    Logger.enabled = true;
  }

  /**
   * Disable all logging
   */
  static disable(): void {
    Logger.enabled = false;
  }

  /**
   * Create a component-specific logger
   */
  static create(component: string): ComponentLogger {
    return new ComponentLogger(component);
  }

  /**
   * Log a message (internal use)
   */
  private static log(
    level: LogLevel,
    component: string,
    message: string,
    data?: unknown,
    error?: Error
  ): void {
    // Check if logging is enabled and level is high enough
    if (!Logger.enabled || level < Logger.config.level) {
      return;
    }

    const entry: LogEntry = {
      level,
      timestamp: Date.now(),
      component,
      message,
      data,
      error,
    };

    // Console output
    Logger.outputToConsole(entry);

    // Custom handlers
    for (const handler of Logger.config.handlers) {
      try {
        handler(entry);
      } catch (err) {
        // Don't let handler errors break logging
        console.error('[Logger] Handler error:', err);
      }
    }
  }

  /**
   * Output log entry to console
   */
  private static outputToConsole(entry: LogEntry): void {
    const parts: string[] = [];

    // Timestamp
    if (Logger.config.timestamps) {
      const date = new Date(entry.timestamp);
      const timestamp = date.toISOString().substring(11, 23); // HH:MM:SS.mmm
      parts.push(`[${timestamp}]`);
    }

    // Component name
    if (Logger.config.componentNames) {
      parts.push(`[${entry.component}]`);
    }

    // Message
    parts.push(entry.message);

    const prefix = parts.join(' ');

    // Choose console method and color based on level
    switch (entry.level) {
      case LogLevel.DEBUG:
        if (Logger.config.colors) {
          console.debug(`%c${prefix}`, 'color: gray', entry.data ?? '');
        } else {
          console.debug(prefix, entry.data ?? '');
        }
        break;

      case LogLevel.INFO:
        if (Logger.config.colors) {
          console.log(`%c${prefix}`, 'color: blue', entry.data ?? '');
        } else {
          console.log(prefix, entry.data ?? '');
        }
        break;

      case LogLevel.WARN:
        if (Logger.config.colors) {
          console.warn(`%c${prefix}`, 'color: orange', entry.data ?? '');
        } else {
          console.warn(prefix, entry.data ?? '');
        }
        break;

      case LogLevel.ERROR:
        console.error(prefix, entry.error ?? entry.data ?? '');
        if (entry.error?.stack) {
          console.error(entry.error.stack);
        }
        break;
    }
  }

  /**
   * Add a custom log handler
   */
  static addHandler(handler: LogHandler): void {
    Logger.config.handlers.push(handler);
  }

  /**
   * Remove a custom log handler
   */
  static removeHandler(handler: LogHandler): void {
    const index = Logger.config.handlers.indexOf(handler);
    if (index !== -1) {
      Logger.config.handlers.splice(index, 1);
    }
  }

  /**
   * Clear all custom handlers
   */
  static clearHandlers(): void {
    Logger.config.handlers = [];
  }
}

/**
 * Component-specific logger
 * Provides convenient logging methods for a specific component
 */
export class ComponentLogger {
  constructor(private component: string) {}

  /**
   * Log debug message
   */
  debug(message: string, data?: unknown): void {
    Logger['log'](LogLevel.DEBUG, this.component, message, data);
  }

  /**
   * Log info message
   */
  info(message: string, data?: unknown): void {
    Logger['log'](LogLevel.INFO, this.component, message, data);
  }

  /**
   * Log warning message
   */
  warn(message: string, data?: unknown): void {
    Logger['log'](LogLevel.WARN, this.component, message, data);
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error | unknown): void {
    if (error instanceof Error) {
      Logger['log'](LogLevel.ERROR, this.component, message, undefined, error);
    } else {
      Logger['log'](LogLevel.ERROR, this.component, message, error);
    }
  }

  /**
   * Create a sub-component logger
   */
  child(subcomponent: string): ComponentLogger {
    return new ComponentLogger(`${this.component}:${subcomponent}`);
  }
}

/**
 * Default logger instance (global)
 */
export const logger = Logger.create('AR');

/**
 * Performance-optimized logger for hot paths
 * Only evaluates expensive operations if logging is enabled at that level
 */
export class PerformanceLogger {
  private logger: ComponentLogger;
  private enabled: boolean;

  constructor(component: string, minLevel: LogLevel = LogLevel.DEBUG) {
    this.logger = Logger.create(component);
    this.enabled = minLevel >= Logger.getConfig().level;
  }

  /**
   * Log with lazy evaluation
   * Only evaluates messageFn if logging is enabled
   */
  log(level: LogLevel, messageFn: () => string, dataFn?: () => unknown): void {
    if (!this.enabled || level < Logger.getConfig().level) {
      return;
    }

    const message = messageFn();
    const data = dataFn?.();

    switch (level) {
      case LogLevel.DEBUG:
        this.logger.debug(message, data);
        break;
      case LogLevel.INFO:
        this.logger.info(message, data);
        break;
      case LogLevel.WARN:
        this.logger.warn(message, data);
        break;
      case LogLevel.ERROR:
        this.logger.error(message, data);
        break;
    }
  }
}
