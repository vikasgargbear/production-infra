// Stub exports for components expected by purchase module
// These alias existing components or provide placeholder implementations

import React from 'react';
import FormInput from './forms/FormInput';
import Select from './forms/Select';

// StandardFormInput is an alias for FormInput
export const StandardFormInput = FormInput;

// StandardSelect is an alias for Select  
export const StandardSelect = Select;

// DocumentSummaryTop - placeholder for top document summary component
export interface DocumentSummaryTopProps {
    title?: string;
    subtitle?: string;
    documentNumber?: string;
    documentDate?: string;
    status?: string;
    partyName?: string;
    partyType?: string;
    totalAmount?: number;
    className?: string;
    children?: React.ReactNode;
}

export const DocumentSummaryTop: React.FC<DocumentSummaryTopProps> = ({
    title,
    subtitle,
    documentNumber,
    documentDate,
    status,
    partyName,
    partyType,
    totalAmount,
    className = '',
    children
}) => {
    return (
        <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-4 ${className}`.trim()}>
            <div className="flex justify-between items-start">
                <div>
                    {title && <h2 className="text-lg font-semibold text-gray-900">{title}</h2>}
                    {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
                    {documentNumber && (
                        <p className="text-sm font-mono text-gray-600 mt-1">#{documentNumber}</p>
                    )}
                </div>
                <div className="text-right">
                    {documentDate && <p className="text-sm text-gray-500">{documentDate}</p>}
                    {status && (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status === 'completed' ? 'bg-green-100 text-green-800' :
                                status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-gray-100 text-gray-800'
                            }`}>
                            {status}
                        </span>
                    )}
                </div>
            </div>
            {partyName && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-sm text-gray-600">
                        {partyType && <span className="text-gray-400">{partyType}: </span>}
                        <span className="font-medium text-gray-900">{partyName}</span>
                    </p>
                </div>
            )}
            {totalAmount !== undefined && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-lg font-semibold text-gray-900">
                        ₹{typeof totalAmount === 'number' ? totalAmount.toFixed(2) : totalAmount}
                    </p>
                </div>
            )}
            {children}
        </div>
    );
};

export default DocumentSummaryTop;
