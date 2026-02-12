import React from 'react';

export interface SidebarSection {
    id: string;
    label: string;
    icon: React.ElementType;
}

interface SidebarNavProps {
    sections: SidebarSection[];
    activeSection: string;
    onSectionChange: (id: string) => void;
}

const SidebarNav: React.FC<SidebarNavProps> = ({ sections, activeSection, onSectionChange }) => (
    <div className="w-48 bg-gray-50 p-4 border-r border-gray-200">
        <nav className="space-y-1">
            {sections.map((section) => {
                const Icon = section.icon;
                return (
                    <button
                        key={section.id}
                        type="button"
                        onClick={() => onSectionChange(section.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg flex items-center space-x-2 transition-colors text-sm ${
                            activeSection === section.id
                                ? 'bg-blue-100 text-blue-700'
                                : 'text-gray-700 hover:bg-gray-100'
                        }`}
                    >
                        <Icon className="w-4 h-4" />
                        <span className="font-medium">{section.label}</span>
                    </button>
                );
            })}
        </nav>
    </div>
);

export default SidebarNav;
