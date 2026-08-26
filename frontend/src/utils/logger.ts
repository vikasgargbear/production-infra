/**
 * Enterprise Debug Logger
 * 
 * Only logs in development mode or when explicitly enabled
 * Zero overhead in production
 */

const isDevelopment = process.env.NODE_ENV === 'development';

class Logger {
    enabled: boolean;

    constructor() {
        this.enabled = isDevelopment;
    }

    enable() {
        this.enabled = true;
        console.log('✅ Debug logging enabled for this page session.');
    }

    disable() {
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

    log(...args: any[]) {
        if (this.enabled) {
            console.log(...args);
        }
    }

    info(...args: any[]) {
        if (this.enabled) {
            console.info(...args);
        }
    }

    warn(...args: any[]) {
        // Always show warnings
        console.warn(...args);
    }

    error(...args: any[]) {
        // Always show errors
        console.error(...args);
    }

    time(label: string) {
        if (this.enabled) {
            console.time(label);
        }
    }

    timeEnd(label: string) {
        if (this.enabled) {
            console.timeEnd(label);
        }
    }

    group(label: string) {
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
declare global {
    interface Window {
        logger: Logger;
    }
}

if (typeof window !== 'undefined') {
    window.logger = logger;
}

export default logger;
