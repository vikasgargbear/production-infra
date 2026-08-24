import React from 'react';
import { Loader2, Save } from 'lucide-react';
import Button from '../../../global/ui/Button';

interface ModalFooterProps {
    sections: Array<{ id: string }>;
    activeSection: string;
    onSectionChange: (id: string) => void;
    isSaving: boolean;
    isEditing: boolean;
    entityLabel: string;
    entityId?: string;
    onClose: () => void;
    writeDisabled?: boolean;
}

const ModalFooter: React.FC<ModalFooterProps> = ({
    sections,
    activeSection,
    onSectionChange,
    isSaving,
    isEditing,
    entityLabel,
    entityId,
    onClose,
    writeDisabled = false
}) => {
    const currentIndex = sections.findIndex(s => s.id === activeSection);

    return (
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="text-sm text-gray-500">
                    {entityId ? `${entityLabel} ID: ${entityId}` : `New ${entityLabel}`}
                </div>

                {/* Section Navigation */}
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                            if (currentIndex > 0) {
                                onSectionChange(sections[currentIndex - 1].id);
                            }
                        }}
                        disabled={currentIndex === 0}
                        className="px-3 py-1.5 text-sm"
                    >
                        &larr; Previous
                    </Button>

                    <span className="text-sm text-gray-500 px-2">
                        {currentIndex + 1} / {sections.length}
                    </span>

                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                            if (currentIndex < sections.length - 1) {
                                onSectionChange(sections[currentIndex + 1].id);
                            }
                        }}
                        disabled={currentIndex === sections.length - 1}
                        className="px-3 py-1.5 text-sm"
                    >
                        Next &rarr;
                    </Button>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-3">
                    <Button type="button" variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit" variant="primary" disabled={isSaving || writeDisabled}>
                        {isSaving ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4 mr-2" />
                                {writeDisabled ? 'Update unavailable' : isEditing ? 'Update' : 'Create'}
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default ModalFooter;
