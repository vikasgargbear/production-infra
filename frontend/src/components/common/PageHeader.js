import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../global';

/**
 * PageHeader Component
 * Consistent page header styling across the application
 */
const PageHeader = ({
  title,
  subtitle,
  backButton = false,
  onBack,
  actions,
  breadcrumbs,
  icon,
  className = ''
}) => {
  return (
    <div className={`bg-white border-b border-gray-200 ${className}`.trim()}>
      <div className="max-w-7xl mx-auto px-8 py-6">
        {/* Breadcrumbs */}
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="flex mb-4" aria-label="Breadcrumb">
            <ol className="flex items-center space-x-2">
              {breadcrumbs.map((crumb, index) => (
                <li key={index} className="flex items-center">
                  {index > 0 && (
                    <svg
                      className="flex-shrink-0 h-5 w-5 text-gray-400 mx-2"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      aria-hidden="true"
                    >
                      <path d="M5.555 17.776l8-16 .894.448-8 16-.894-.448z" />
                    </svg>
                  )}
                  {crumb.href ? (
                    <a
                      href={crumb.href}
                      className="text-sm font-medium text-gray-500 hover:text-gray-700"
                    >
                      {crumb.label}
                    </a>
                  ) : (
                    <span className="text-sm font-medium text-gray-900">
                      {crumb.label}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}

        {/* Main Header Content */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {/* Back Button */}
            {backButton && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onBack}
                icon={<ArrowLeft className="w-4 h-4" />}
                className="mr-2"
              >
                Back
              </Button>
            )}

            {/* Icon */}
            {icon && (
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <div className="w-6 h-6 text-blue-600">{icon}</div>
              </div>
            )}

            {/* Title and Subtitle */}
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
              {subtitle && (
                <p className="text-sm text-gray-600 mt-1">{subtitle}</p>
              )}
            </div>
          </div>

          {/* Actions */}
          {actions && (
            <div className="flex items-center space-x-3">
              {actions}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Simple Page Title Component
export const PageTitle = ({ children, className = '' }) => (
  <h1 className={`text-2xl font-bold text-gray-900 ${className}`.trim()}>
    {children}
  </h1>
);

// Section Header Component
export const SectionHeader = ({ 
  title, 
  subtitle, 
  actions, 
  className = '' 
}) => (
  <div className={`flex items-center justify-between mb-6 ${className}`.trim()}>
    <div>
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      {subtitle && (
        <p className="text-sm text-gray-600 mt-1">{subtitle}</p>
      )}
    </div>
    {actions && (
      <div className="flex items-center space-x-3">
        {actions}
      </div>
    )}
  </div>
);

export default PageHeader;