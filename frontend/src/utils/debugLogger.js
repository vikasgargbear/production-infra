/**
 * Debug Logger Utility
 * Provides controlled logging that can be turned on/off
 */

// Debug flags - can be controlled via window object or environment
const DEBUG_FLAGS = {
  API_CALLS: false,
  CALCULATIONS: false,
  RENDERS: false,
  BACKEND_CONNECTION: false,
  GENERAL: false
};

// Enable debug flags in development
if (process.env.NODE_ENV === 'development') {
  // Check window object for debug flags
  Object.keys(DEBUG_FLAGS).forEach(flag => {
    if (window[`DEBUG_${flag}`]) {
      DEBUG_FLAGS[flag] = true;
    }
  });
}

const debugLogger = {
  /**
   * Log API calls and responses
   */
  api: (...args) => {
    if (DEBUG_FLAGS.API_CALLS) {
      console.log('🌐 API:', ...args);
    }
  },

  /**
   * Log calculation details
   */
  calculation: (...args) => {
    if (DEBUG_FLAGS.CALCULATIONS) {
      console.log('🧮 CALC:', ...args);
    }
  },

  /**
   * Log render information
   */
  render: (...args) => {
    if (DEBUG_FLAGS.RENDERS) {
      console.log('🎨 RENDER:', ...args);
    }
  },

  /**
   * Log backend connection info
   */
  backend: (...args) => {
    if (DEBUG_FLAGS.BACKEND_CONNECTION) {
      console.log('🔗 BACKEND:', ...args);
    }
  },

  /**
   * General purpose debug logging
   */
  debug: (...args) => {
    if (DEBUG_FLAGS.GENERAL || process.env.NODE_ENV === 'development') {
      console.log('🐛 DEBUG:', ...args);
    }
  },

  /**
   * Always log errors
   */
  error: (...args) => {
    console.error('❌ ERROR:', ...args);
  },

  /**
   * Always log warnings
   */
  warn: (...args) => {
    console.warn('⚠️ WARN:', ...args);
  },

  /**
   * Enable specific debug category
   */
  enable: (category) => {
    if (DEBUG_FLAGS.hasOwnProperty(category)) {
      DEBUG_FLAGS[category] = true;
      console.log(`🔧 Debug enabled for: ${category}`);
    } else {
      console.warn(`Unknown debug category: ${category}`);
    }
  },

  /**
   * Disable specific debug category
   */
  disable: (category) => {
    if (DEBUG_FLAGS.hasOwnProperty(category)) {
      DEBUG_FLAGS[category] = false;
      console.log(`🔧 Debug disabled for: ${category}`);
    }
  },

  /**
   * Show current debug status
   */
  status: () => {
    console.log('🔧 Debug Status:', DEBUG_FLAGS);
  }
};

// Make debug controls available globally in development
if (process.env.NODE_ENV === 'development') {
  window.debugLogger = debugLogger;
  
  // Convenience methods
  window.enableDebug = (category) => debugLogger.enable(category);
  window.disableDebug = (category) => debugLogger.disable(category);
  window.debugStatus = () => debugLogger.status();
  
  console.log('🔧 Debug logger available. Use debugLogger.status() to see options');
}

export default debugLogger;