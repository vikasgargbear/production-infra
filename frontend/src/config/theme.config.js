/**
 * Global Theme Configuration
 * Centralized theme settings for consistent UI across the application
 */

export const theme = {
  // Color Palette
  colors: {
    primary: {
      50: '#EFF6FF',
      100: '#DBEAFE',
      200: '#BFDBFE',
      300: '#93C5FD',
      400: '#60A5FA',
      500: '#3B82F6',
      600: '#2563EB',
      700: '#1D4ED8',
      800: '#1E40AF',
      900: '#1E3A8A',
      DEFAULT: '#3B82F6'
    },
    secondary: {
      50: '#ECFDF5',
      100: '#D1FAE5',
      200: '#A7F3D0',
      300: '#6EE7B7',
      400: '#34D399',
      500: '#10B981',
      600: '#059669',
      700: '#047857',
      800: '#065F46',
      900: '#064E3B',
      DEFAULT: '#10B981'
    },
    danger: {
      50: '#FEF2F2',
      100: '#FEE2E2',
      200: '#FECACA',
      300: '#FCA5A5',
      400: '#F87171',
      500: '#EF4444',
      600: '#DC2626',
      700: '#B91C1C',
      800: '#991B1B',
      900: '#7F1D1D',
      DEFAULT: '#EF4444'
    },
    warning: {
      50: '#FFFBEB',
      100: '#FEF3C7',
      200: '#FDE68A',
      300: '#FCD34D',
      400: '#FBBF24',
      500: '#F59E0B',
      600: '#D97706',
      700: '#B45309',
      800: '#92400E',
      900: '#78350F',
      DEFAULT: '#F59E0B'
    },
    gray: {
      50: '#F9FAFB',
      100: '#F3F4F6',
      200: '#E5E7EB',
      300: '#D1D5DB',
      400: '#9CA3AF',
      500: '#6B7280',
      600: '#4B5563',
      700: '#374151',
      800: '#1F2937',
      900: '#111827',
      DEFAULT: '#6B7280'
    },
    white: '#FFFFFF',
    black: '#000000',
    transparent: 'transparent'
  },

  // Typography
  typography: {
    fontFamily: {
      sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'Consolas', 'monospace']
    },
    fontSize: {
      xs: '0.75rem',    // 12px
      sm: '0.875rem',   // 14px
      base: '1rem',     // 16px
      lg: '1.125rem',   // 18px
      xl: '1.25rem',    // 20px
      '2xl': '1.5rem',  // 24px
      '3xl': '1.875rem',// 30px
      '4xl': '2.25rem', // 36px
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700
    },
    lineHeight: {
      tight: 1.25,
      normal: 1.5,
      relaxed: 1.75
    }
  },

  // Spacing Scale
  spacing: {
    0: '0',
    1: '0.25rem',  // 4px
    2: '0.5rem',   // 8px
    3: '0.75rem',  // 12px
    4: '1rem',     // 16px
    5: '1.25rem',  // 20px
    6: '1.5rem',   // 24px
    8: '2rem',     // 32px
    10: '2.5rem',  // 40px
    12: '3rem',    // 48px
    16: '4rem',    // 64px
    20: '5rem',    // 80px
    24: '6rem',    // 96px
  },

  // Border Radius
  borderRadius: {
    none: '0',
    sm: '0.125rem',   // 2px
    DEFAULT: '0.25rem', // 4px
    md: '0.375rem',   // 6px
    lg: '0.5rem',     // 8px
    xl: '0.75rem',    // 12px
    '2xl': '1rem',    // 16px
    '3xl': '1.5rem',  // 24px
    full: '9999px'
  },

  // Shadows
  shadows: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
    '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
    none: 'none'
  },

  // Transitions
  transitions: {
    duration: {
      fast: '150ms',
      base: '200ms',
      slow: '300ms',
      slower: '500ms'
    },
    timing: {
      ease: 'ease',
      easeIn: 'ease-in',
      easeOut: 'ease-out',
      easeInOut: 'ease-in-out',
      linear: 'linear'
    }
  },

  // Z-Index Scale
  zIndex: {
    0: 0,
    10: 10,
    20: 20,
    30: 30,
    40: 40,
    50: 50,
    dropdown: 100,
    modal: 200,
    tooltip: 300,
    notification: 400
  },

  // Breakpoints
  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px'
  },

  // Component Specific Styles
  components: {
    // Button styles
    button: {
      base: 'inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2',
      sizes: {
        sm: 'px-3 py-1.5 text-sm',
        md: 'px-5 py-2.5 text-sm',
        lg: 'px-6 py-3 text-base'
      },
      variants: {
        primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
        secondary: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 focus:ring-gray-500',
        danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
        success: 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500',
        warning: 'bg-amber-600 text-white hover:bg-amber-700 focus:ring-amber-500',
        ghost: 'text-gray-700 hover:bg-gray-100 focus:ring-gray-500',
        link: 'text-blue-600 hover:text-blue-700 underline-offset-4 hover:underline'
      }
    },

    // Input styles
    input: {
      base: 'block w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors',
      sizes: {
        sm: 'text-sm py-2',
        md: 'text-sm py-2.5',
        lg: 'text-base py-3'
      },
      states: {
        error: 'border-red-500 focus:ring-red-500',
        success: 'border-green-500 focus:ring-green-500',
        disabled: 'bg-gray-100 cursor-not-allowed opacity-60'
      }
    },

    // Card styles
    card: {
      base: 'bg-white rounded-xl border border-gray-200',
      padding: {
        sm: 'p-4',
        md: 'p-6',
        lg: 'p-8'
      },
      shadow: {
        none: '',
        sm: 'shadow-sm',
        md: 'shadow-md',
        lg: 'shadow-lg'
      }
    },

    // Badge styles
    badge: {
      base: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
      variants: {
        primary: 'bg-blue-100 text-blue-800 border border-blue-200',
        secondary: 'bg-gray-100 text-gray-800 border border-gray-200',
        success: 'bg-green-100 text-green-800 border border-green-200',
        danger: 'bg-red-100 text-red-800 border border-red-200',
        warning: 'bg-amber-100 text-amber-800 border border-amber-200'
      }
    },

    // Table styles
    table: {
      wrapper: 'overflow-x-auto',
      base: 'w-full',
      header: 'bg-gray-50 border-b border-gray-200',
      headerCell: 'px-6 py-4 text-left text-xs font-medium text-gray-600 uppercase tracking-wider',
      body: 'bg-white divide-y divide-gray-200',
      row: 'hover:bg-gray-50 transition-colors',
      cell: 'px-6 py-4 text-sm text-gray-900'
    }
  },

  // Animation keyframes
  animations: {
    spin: 'spin 1s linear infinite',
    pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
    fadeIn: 'fadeIn 0.3s ease-in-out',
    slideUp: 'slideUp 0.3s ease-out',
    slideDown: 'slideDown 0.3s ease-out'
  }
};

// Helper function to get nested theme values
export const getThemeValue = (path) => {
  return path.split('.').reduce((obj, key) => obj?.[key], theme);
};

// Tailwind class helpers
export const classes = {
  // Layout
  pageContainer: 'min-h-screen bg-gray-50',
  contentWrapper: 'max-w-7xl mx-auto px-8 py-8',
  
  // Typography
  pageTitle: 'text-2xl font-bold text-gray-900',
  sectionTitle: 'text-lg font-semibold text-gray-900',
  label: 'text-sm font-medium text-gray-700',
  bodyText: 'text-sm text-gray-600',
  smallText: 'text-xs text-gray-500',
  
  // Forms
  formGroup: 'space-y-2',
  formLabel: 'block text-sm font-medium text-gray-700',
  formHelperText: 'text-xs text-gray-500 mt-1',
  formErrorText: 'text-xs text-red-600 mt-1',
  
  // Status
  statusSuccess: 'text-green-600 bg-green-50 border-green-200',
  statusError: 'text-red-600 bg-red-50 border-red-200',
  statusWarning: 'text-amber-600 bg-amber-50 border-amber-200',
  statusInfo: 'text-blue-600 bg-blue-50 border-blue-200',
  
  // Utility
  flexCenter: 'flex items-center justify-center',
  flexBetween: 'flex items-center justify-between',
  gridResponsive: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6',
  
  // Keyboard shortcuts
  keyboardShortcut: 'text-xs text-gray-400 font-mono'
};

export default theme;