/**
 * Enterprise Debug Logger
 * 
 * Only logs in development mode or when explicitly enabled
 * Zero overhead in production
 */

const isDevelopment = process.env.NODE_ENV === 'development';
const isDebugEnabled = localStorage.getItem('DEBUG_MODE') === 'true';

class Logger {
  constructor() {
    this.enabled = isDevelopment && isDebugEnabled;
  }

  enable() {
    localStorage.setItem('DEBUG_MODE', 'true');
    this.enabled = true;
    console.log('✅ Debug logging enabled. Refresh page to see logs.');
  }

  disable() {
    localStorage.removeItem('DEBUG_MODE');
    this.enabled = false;
    console.log('🔇 Debug logging disabled. Console will be clean.');
  }

  status() {
    console.log(`
🔧 Debug Logger Status:
- Environment: ${process.env.NODE_ENV}
- Debug Mode: ${this.enabled ? '✅ Enabled' : '❌ Disabled'}
- To enable: logger.enable()
- To disable: logger.disable()
    `);
  }

  log(...args) {
    if (this.enabled) {
      console.log(...args);
    }
  }

  info(...args) {
    if (this.enabled) {
      console.info(...args);
    }
  }

  warn(...args) {
    // Always show warnings
    console.warn(...args);
  }

  error(...args) {
    // Always show errors
    console.error(...args);
  }

  time(label) {
    if (this.enabled) {
      console.time(label);
    }
  }

  timeEnd(label) {
    if (this.enabled) {
      console.timeEnd(label);
    }
  }

  group(label) {
    if (this.enabled) {
      console.group(label);
    }
  }

  groupEnd() {
    if (this.enabled) {
      console.groupEnd();
    }
  }
}

const logger = new Logger();

// Expose globally for easy access in console
if (typeof window !== 'undefined') {
  window.logger = logger;
}

export default logger;
