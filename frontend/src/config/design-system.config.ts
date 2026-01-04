/**
 * Global Design System Configuration
 * Ensures consistent sizing, spacing, and styling across all modules
 */

// Type definitions
export interface DesignTokens {
    header: {
        height: Record<string, string>;
        padding: Record<string, string>;
        icon: Record<string, { container: string; icon: string; rounded: string }>;
        typography: {
            title: Record<string, string>;
            subtitle: Record<string, string>;
        };
    };
    spacing: Record<string, string>;
    container: Record<string, string>;
    card: {
        padding: Record<string, string>;
        header: { padding: string; background: string; border: string };
        rounded: string;
        shadow: string;
        border: string;
    };
    colors: {
        primary: { gradient: string; solid: string; light: string; text: string };
        background: { page: string; card: string; header: string };
        border: { default: string; light: string };
    };
}

export interface HeaderVariant {
    size: 'compact' | 'tall';
    icon: 'compact' | 'standard' | 'large';
    padding: 'compact' | 'standard' | 'tall';
    showShadow: boolean;
}

export interface LayoutVariant {
    container: 'compact' | 'standard' | 'wide';
    spacing: 'section' | 'card';
    header: 'compact' | 'standard' | 'hero';
}

export const DESIGN_TOKENS: DesignTokens = {
    header: {
        height: {
            compact: 'h-12',
            standard: 'h-14',
            tall: 'h-16'
        },
        padding: {
            compact: 'py-2',
            standard: 'py-3',
            tall: 'py-4'
        },
        icon: {
            compact: {
                container: 'w-6 h-6',
                icon: 'w-3 h-3',
                rounded: 'rounded-md'
            },
            standard: {
                container: 'w-8 h-8',
                icon: 'w-4 h-4',
                rounded: 'rounded-lg'
            },
            large: {
                container: 'w-10 h-10',
                icon: 'w-5 h-5',
                rounded: 'rounded-xl'
            }
        },
        typography: {
            title: {
                compact: 'text-lg font-semibold',
                standard: 'text-xl font-bold',
                large: 'text-2xl font-bold'
            },
            subtitle: {
                compact: 'text-xs text-gray-500',
                standard: 'text-sm text-gray-500',
                large: 'text-base text-gray-600'
            }
        }
    },

    spacing: {
        section: 'space-y-6',
        card: 'space-y-4',
        form: 'space-y-4',
        tight: 'space-y-2'
    },

    container: {
        compact: 'max-w-4xl mx-auto px-4 py-4',
        standard: 'max-w-6xl mx-auto px-6 py-6',
        wide: 'max-w-7xl mx-auto px-8 py-8'
    },

    card: {
        padding: {
            compact: 'p-4',
            standard: 'p-6',
            spacious: 'p-8'
        },
        header: {
            padding: 'px-6 py-4',
            background: 'bg-gray-50',
            border: 'border-b border-gray-200'
        },
        rounded: 'rounded-xl',
        shadow: 'shadow-sm',
        border: 'border border-gray-200'
    },

    colors: {
        primary: {
            gradient: 'bg-gradient-to-br from-blue-500 to-blue-600',
            solid: 'bg-blue-600',
            light: 'bg-blue-100',
            text: 'text-blue-600'
        },
        background: {
            page: 'bg-gray-50',
            card: 'bg-white',
            header: 'bg-white'
        },
        border: {
            default: 'border-gray-200',
            light: 'border-gray-100'
        }
    }
};

export const MODULE_HEADER_VARIANTS: Record<string, HeaderVariant> = {
    standard: {
        size: 'compact',
        icon: 'compact',
        padding: 'standard',
        showShadow: true
    },
    compact: {
        size: 'compact',
        icon: 'compact',
        padding: 'compact',
        showShadow: false
    },
    hero: {
        size: 'tall',
        icon: 'large',
        padding: 'tall',
        showShadow: true
    }
};

export const LAYOUT_VARIANTS: Record<string, LayoutVariant> = {
    module: {
        container: 'standard',
        spacing: 'section',
        header: 'standard'
    },
    compact: {
        container: 'compact',
        spacing: 'card',
        header: 'compact'
    },
    dashboard: {
        container: 'wide',
        spacing: 'section',
        header: 'hero'
    }
};

export interface HeaderClasses {
    container: string;
    inner: string;
    content: string;
    iconContainer: string;
    icon: string;
    title: string;
    subtitle: string;
}

export const getHeaderClasses = (variant: string = 'standard'): HeaderClasses => {
    const config = MODULE_HEADER_VARIANTS[variant] || MODULE_HEADER_VARIANTS.standard;
    const tokens = DESIGN_TOKENS;

    return {
        container: `${tokens.colors.background.header} ${tokens.colors.border.default} border-b ${config.showShadow ? 'shadow-sm' : ''}`,
        inner: `${tokens.container[config.size === 'compact' ? 'compact' : 'standard']}`,
        content: `flex items-center justify-between ${tokens.header.padding[config.padding]}`,
        iconContainer: `${tokens.header.icon[config.icon].container} ${tokens.colors.primary.gradient} ${tokens.header.icon[config.icon].rounded} flex items-center justify-center shadow-sm`,
        icon: `${tokens.header.icon[config.icon].icon} text-white`,
        title: tokens.header.typography.title[config.size],
        subtitle: tokens.header.typography.subtitle[config.size]
    };
};

export interface CardClasses {
    container: string;
    header: string;
    content: string;
}

export const getCardClasses = (padding: 'compact' | 'standard' | 'spacious' = 'standard'): CardClasses => {
    const tokens = DESIGN_TOKENS;

    return {
        container: `${tokens.colors.background.card} ${tokens.card.rounded} ${tokens.card.border} ${tokens.card.shadow}`,
        header: `${tokens.card.header.padding} ${tokens.card.header.background} ${tokens.card.header.border} rounded-t-xl`,
        content: tokens.card.padding[padding]
    };
};

export default DESIGN_TOKENS;
