import React, { useState, DragEvent, ChangeEvent } from 'react';
import { Upload, FileText, Sparkles, CheckCircle, Loader2 } from 'lucide-react';

// ==================== TYPE DEFINITIONS ====================

export interface PDFUploadCardProps {
    onUpload?: (file: File) => Promise<void>;
    onSuccess?: (file: File) => void;
    title?: string;
    description?: string;
    benefits?: string[];
    className?: string;
}

// ==================== COMPONENT ====================

/**
 * PDFUploadCard - Attractive PDF upload component that encourages usage
 * Shows the benefits of using PDF extraction for automatic data entry
 */
const PDFUploadCard: React.FC<PDFUploadCardProps> = ({
    onUpload,
    onSuccess,
    title = "Smart PDF Import",
    description = "Upload supplier invoice PDF to auto-fill all details",
    benefits = [
        "Extracts invoice number automatically",
        "Identifies supplier details",
        "Captures all line items with prices",
        "Saves 90% data entry time"
    ],
    className = ""
}) => {
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [uploadSuccess, setUploadSuccess] = useState<boolean>(false);
    const [fileName, setFileName] = useState<string>('');

    const handleDragOver = (e: DragEvent<HTMLDivElement>): void => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent<HTMLDivElement>): void => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = async (e: DragEvent<HTMLDivElement>): Promise<void> => {
        e.preventDefault();
        setIsDragging(false);

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            await handleFileUpload(files[0]);
        }
    };

    const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
        const file = e.target.files?.[0];
        if (file) {
            await handleFileUpload(file);
        }
    };

    const handleFileUpload = async (file: File): Promise<void> => {
        if (file.type !== 'application/pdf') {
            alert('Please upload a PDF file');
            return;
        }

        setFileName(file.name);
        setIsProcessing(true);

        try {
            if (onUpload) {
                await onUpload(file);
            }

            setUploadSuccess(true);
            setTimeout(() => {
                setUploadSuccess(false);
                if (onSuccess) {
                    onSuccess(file);
                }
            }, 2000);
        } catch (error) {
            alert('Failed to process PDF. Please try again.');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className={`bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl border-2 border-dashed ${isDragging ? 'border-purple-400 bg-purple-100' : 'border-purple-200'} p-6 transition-all ${className}`}>
            <div className="flex items-start gap-6">
                {/* Left side - Upload area */}
                <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-purple-100 rounded-lg">
                            <Sparkles className="w-5 h-5 text-purple-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
                    </div>

                    <p className="text-sm text-gray-600 mb-4">{description}</p>

                    {/* Drop zone */}
                    <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer hover:bg-white/50 ${isDragging ? 'border-purple-400 bg-purple-50' : 'border-gray-300 bg-white/30'
                            }`}
                    >
                        <input
                            type="file"
                            accept="application/pdf"
                            onChange={handleFileSelect}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            disabled={isProcessing}
                        />

                        {isProcessing ? (
                            <div className="flex flex-col items-center">
                                <Loader2 className="w-8 h-8 text-purple-600 animate-spin mb-2" />
                                <p className="text-sm font-medium text-purple-600">Processing PDF...</p>
                                <p className="text-xs text-gray-500 mt-1">Extracting invoice details</p>
                            </div>
                        ) : uploadSuccess ? (
                            <div className="flex flex-col items-center">
                                <CheckCircle className="w-8 h-8 text-green-600 mb-2" />
                                <p className="text-sm font-medium text-green-600">Successfully extracted!</p>
                                <p className="text-xs text-gray-500 mt-1">{fileName}</p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center">
                                <Upload className="w-8 h-8 text-gray-400 mb-2" />
                                <p className="text-sm font-medium text-gray-700">
                                    Drop PDF here or <span className="text-purple-600">browse</span>
                                </p>
                                <p className="text-xs text-gray-500 mt-1">Supports supplier invoices & bills</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right side - Benefits */}
                <div className="w-64">
                    <div className="bg-white/60 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <FileText className="w-4 h-4 text-purple-600" />
                            <span className="text-sm font-semibold text-gray-700">Why use PDF import?</span>
                        </div>
                        <ul className="space-y-2">
                            {benefits.map((benefit, index) => (
                                <li key={index} className="flex items-start gap-2">
                                    <CheckCircle className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />
                                    <span className="text-xs text-gray-600">{benefit}</span>
                                </li>
                            ))}
                        </ul>
                        <div className="mt-4 p-3 bg-gradient-to-r from-purple-100 to-blue-100 rounded-lg">
                            <p className="text-xs font-medium text-purple-700">💡 Pro Tip</p>
                            <p className="text-xs text-gray-700 mt-1">
                                Upload PDF first to save time on manual data entry
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PDFUploadCard;
