import React from 'react';
import { X } from 'lucide-react';

interface ModalShellProps {
    isOpen: boolean;
    title: string;
    error: string | null;
    onClose: () => void;
    onSubmit: (e: React.FormEvent) => void;
    sidebar: React.ReactNode;
    footer: React.ReactNode;
    children: React.ReactNode;
}

const ModalShell: React.FC<ModalShellProps> = ({
    isOpen,
    title,
    error,
    onClose,
    onSubmit,
    sidebar,
    footer,
    children
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl m-4 max-h-[90vh] flex flex-col">
                <form onSubmit={onSubmit} className="flex flex-col h-full">
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-gray-200">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
                            <button
                                type="button"
                                onClick={onClose}
                                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>
                        {error && (
                            <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded">
                                {error}
                            </div>
                        )}
                    </div>

                    {/* Body with Sidebar */}
                    <div className="flex flex-1 overflow-hidden">
                        {sidebar}
                        <div className="flex-1 overflow-y-auto p-6">
                            {children}
                        </div>
                    </div>

                    {footer}
                </form>
            </div>
        </div>
    );
};

export default ModalShell;
