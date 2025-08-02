import React, { useState, useRef, useEffect } from 'react';

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  trigger?: 'hover' | 'click' | 'focus';
  delay?: number;
  disabled?: boolean;
  className?: string;
  offset?: number;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  placement = 'top',
  trigger = 'hover',
  delay = 0,
  disabled = false,
  className = '',
  offset = 8,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();
  
  const calculatePosition = () => {
    if (!triggerRef.current || !tooltipRef.current) return;
    
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    
    let top = 0;
    let left = 0;
    
    switch (placement) {
      case 'top':
        top = triggerRect.top - tooltipRect.height - offset;
        left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
        break;
      case 'bottom':
        top = triggerRect.bottom + offset;
        left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
        break;
      case 'left':
        top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
        left = triggerRect.left - tooltipRect.width - offset;
        break;
      case 'right':
        top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
        left = triggerRect.right + offset;
        break;
    }
    
    // Prevent tooltip from going off-screen
    const padding = 10;
    top = Math.max(padding, Math.min(top, window.innerHeight - tooltipRect.height - padding));
    left = Math.max(padding, Math.min(left, window.innerWidth - tooltipRect.width - padding));
    
    setPosition({ top, left });
  };
  
  useEffect(() => {
    if (isVisible) {
      calculatePosition();
      window.addEventListener('scroll', calculatePosition);
      window.addEventListener('resize', calculatePosition);
      
      return () => {
        window.removeEventListener('scroll', calculatePosition);
        window.removeEventListener('resize', calculatePosition);
      };
    }
  }, [isVisible]);
  
  const show = () => {
    if (disabled) return;
    
    if (delay > 0) {
      timeoutRef.current = setTimeout(() => setIsVisible(true), delay);
    } else {
      setIsVisible(true);
    }
  };
  
  const hide = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };
  
  const handleTrigger = {
    hover: {
      onMouseEnter: show,
      onMouseLeave: hide,
    },
    click: {
      onClick: () => isVisible ? hide() : show(),
    },
    focus: {
      onFocus: show,
      onBlur: hide,
    },
  };
  
  // Handle click outside for click trigger
  useEffect(() => {
    if (trigger === 'click' && isVisible) {
      const handleClickOutside = (e: MouseEvent) => {
        if (
          triggerRef.current &&
          !triggerRef.current.contains(e.target as Node) &&
          tooltipRef.current &&
          !tooltipRef.current.contains(e.target as Node)
        ) {
          hide();
        }
      };
      
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [trigger, isVisible]);
  
  const arrowStyles = {
    top: 'bottom-[-4px] left-1/2 transform -translate-x-1/2 border-t-gray-900 border-x-transparent border-b-transparent',
    bottom: 'top-[-4px] left-1/2 transform -translate-x-1/2 border-b-gray-900 border-x-transparent border-t-transparent',
    left: 'right-[-4px] top-1/2 transform -translate-y-1/2 border-l-gray-900 border-y-transparent border-r-transparent',
    right: 'left-[-4px] top-1/2 transform -translate-y-1/2 border-r-gray-900 border-y-transparent border-l-transparent',
  };
  
  return (
    <>
      <div
        ref={triggerRef}
        className="inline-block"
        {...handleTrigger[trigger]}
      >
        {children}
      </div>
      
      {isVisible && (
        <div
          ref={tooltipRef}
          className={`
            fixed z-50 px-2 py-1 text-xs text-white bg-gray-900 rounded shadow-lg
            pointer-events-none
            ${className}
          `}
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
          }}
          role="tooltip"
        >
          {content}
          
          {/* Arrow */}
          <div
            className={`absolute w-0 h-0 border-4 ${arrowStyles[placement]}`}
          />
        </div>
      )}
    </>
  );
};

// Popover component (similar to Tooltip but with more content)
export interface PopoverProps extends Omit<TooltipProps, 'delay'> {
  title?: React.ReactNode;
  interactive?: boolean;
}

export const Popover: React.FC<PopoverProps> = ({
  content,
  children,
  title,
  placement = 'bottom',
  trigger = 'click',
  disabled = false,
  className = '',
  offset = 8,
  interactive = true,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  
  const calculatePosition = () => {
    if (!triggerRef.current || !popoverRef.current) return;
    
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const popoverRect = popoverRef.current.getBoundingClientRect();
    
    let top = 0;
    let left = 0;
    
    switch (placement) {
      case 'top':
        top = triggerRect.top - popoverRect.height - offset;
        left = triggerRect.left + (triggerRect.width - popoverRect.width) / 2;
        break;
      case 'bottom':
        top = triggerRect.bottom + offset;
        left = triggerRect.left + (triggerRect.width - popoverRect.width) / 2;
        break;
      case 'left':
        top = triggerRect.top + (triggerRect.height - popoverRect.height) / 2;
        left = triggerRect.left - popoverRect.width - offset;
        break;
      case 'right':
        top = triggerRect.top + (triggerRect.height - popoverRect.height) / 2;
        left = triggerRect.right + offset;
        break;
    }
    
    // Prevent popover from going off-screen
    const padding = 10;
    top = Math.max(padding, Math.min(top, window.innerHeight - popoverRect.height - padding));
    left = Math.max(padding, Math.min(left, window.innerWidth - popoverRect.width - padding));
    
    setPosition({ top, left });
  };
  
  useEffect(() => {
    if (isVisible) {
      calculatePosition();
      window.addEventListener('scroll', calculatePosition);
      window.addEventListener('resize', calculatePosition);
      
      return () => {
        window.removeEventListener('scroll', calculatePosition);
        window.removeEventListener('resize', calculatePosition);
      };
    }
  }, [isVisible]);
  
  const show = () => {
    if (!disabled) {
      setIsVisible(true);
    }
  };
  
  const hide = () => {
    setIsVisible(false);
  };
  
  const toggle = () => {
    isVisible ? hide() : show();
  };
  
  const handleTrigger = {
    hover: {
      onMouseEnter: show,
      onMouseLeave: hide,
    },
    click: {
      onClick: toggle,
    },
    focus: {
      onFocus: show,
      onBlur: hide,
    },
  };
  
  // Handle click outside
  useEffect(() => {
    if (isVisible) {
      const handleClickOutside = (e: MouseEvent) => {
        if (
          triggerRef.current &&
          !triggerRef.current.contains(e.target as Node) &&
          popoverRef.current &&
          !popoverRef.current.contains(e.target as Node)
        ) {
          hide();
        }
      };
      
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isVisible]);
  
  return (
    <>
      <div
        ref={triggerRef}
        className="inline-block"
        {...handleTrigger[trigger]}
      >
        {children}
      </div>
      
      {isVisible && (
        <div
          ref={popoverRef}
          className={`
            fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200
            ${interactive ? '' : 'pointer-events-none'}
            ${className}
          `}
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
          }}
          role="dialog"
        >
          {title && (
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-medium text-gray-900">{title}</h3>
            </div>
          )}
          
          <div className="p-4">
            {content}
          </div>
        </div>
      )}
    </>
  );
};