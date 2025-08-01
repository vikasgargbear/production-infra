import React, { useState, useRef, useEffect } from 'react';

export interface Tab {
  key: string;
  label: React.ReactNode;
  content: React.ReactNode;
  disabled?: boolean;
  icon?: React.ReactNode;
}

export interface TabsProps {
  tabs: Tab[];
  activeKey?: string;
  defaultActiveKey?: string;
  onChange?: (key: string) => void;
  variant?: 'default' | 'pills' | 'underline';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  centered?: boolean;
  className?: string;
}

const variantStyles = {
  default: {
    container: 'border-b border-gray-200',
    tab: 'border-b-2 border-transparent hover:text-gray-700 hover:border-gray-300',
    activeTab: 'border-blue-600 text-blue-600',
  },
  pills: {
    container: 'bg-gray-100 p-1 rounded-lg',
    tab: 'rounded-md hover:bg-gray-200',
    activeTab: 'bg-white text-blue-600 shadow-sm',
  },
  underline: {
    container: '',
    tab: 'border-b-2 border-transparent hover:border-gray-300',
    activeTab: 'border-blue-600 text-blue-600',
  },
};

const sizeStyles = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
};

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeKey,
  defaultActiveKey,
  onChange,
  variant = 'default',
  size = 'md',
  fullWidth = false,
  centered = false,
  className = '',
}) => {
  const [localActiveKey, setLocalActiveKey] = useState(
    activeKey || defaultActiveKey || tabs[0]?.key || ''
  );
  const [indicatorStyle, setIndicatorStyle] = useState<React.CSSProperties>({});
  const tabRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
  
  const effectiveActiveKey = activeKey !== undefined ? activeKey : localActiveKey;
  const styles = variantStyles[variant];
  
  // Update indicator position for default variant
  useEffect(() => {
    if (variant === 'default' && tabRefs.current[effectiveActiveKey]) {
      const activeTab = tabRefs.current[effectiveActiveKey];
      if (activeTab) {
        setIndicatorStyle({
          width: activeTab.offsetWidth,
          transform: `translateX(${activeTab.offsetLeft}px)`,
        });
      }
    }
  }, [effectiveActiveKey, variant]);
  
  const handleTabClick = (key: string) => {
    if (tabs.find(tab => tab.key === key)?.disabled) return;
    
    setLocalActiveKey(key);
    onChange?.(key);
  };
  
  const activeTab = tabs.find(tab => tab.key === effectiveActiveKey);
  
  return (
    <div className={className}>
      {/* Tab List */}
      <div className={`relative ${styles.container}`}>
        <div
          className={`flex ${
            fullWidth ? 'w-full' : ''
          } ${
            centered ? 'justify-center' : ''
          }`}
          role="tablist"
        >
          {tabs.map((tab) => {
            const isActive = tab.key === effectiveActiveKey;
            const isDisabled = tab.disabled;
            
            return (
              <button
                key={tab.key}
                ref={(el) => { tabRefs.current[tab.key] = el; }}
                role="tab"
                aria-selected={isActive}
                aria-disabled={isDisabled}
                disabled={isDisabled}
                onClick={() => handleTabClick(tab.key)}
                className={`
                  flex items-center gap-2 font-medium transition-colors
                  ${sizeStyles[size]}
                  ${styles.tab}
                  ${isActive ? styles.activeTab : ''}
                  ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  ${fullWidth ? 'flex-1 justify-center' : ''}
                `}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </div>
        
        {/* Animated indicator for default variant */}
        {variant === 'default' && (
          <div
            className="absolute bottom-0 h-0.5 bg-blue-600 transition-all duration-200"
            style={indicatorStyle}
          />
        )}
      </div>
      
      {/* Tab Content */}
      <div className="mt-4" role="tabpanel">
        {activeTab?.content}
      </div>
    </div>
  );
};

// Tab Panel component for more control
export interface TabPanelProps {
  children: React.ReactNode;
  tabKey: string;
  activeKey: string;
  keepMounted?: boolean;
  className?: string;
}

export const TabPanel: React.FC<TabPanelProps> = ({
  children,
  tabKey,
  activeKey,
  keepMounted = false,
  className = '',
}) => {
  const isActive = tabKey === activeKey;
  
  if (!isActive && !keepMounted) {
    return null;
  }
  
  return (
    <div
      role="tabpanel"
      hidden={!isActive}
      className={className}
    >
      {children}
    </div>
  );
};