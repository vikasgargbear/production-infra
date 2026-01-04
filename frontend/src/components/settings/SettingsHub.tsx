/**
 * Settings Hub
 * 
 * Main navigation hub for application settings
 */

import React, { useState } from 'react';
import { Building2, Users, Settings, Database, Shield, Bell } from 'lucide-react';
import { ModuleHub } from '../global';
import { CompanySettings } from './company';
import { EmployeeManagement } from './employees';
import { MasterSettings } from './master';

interface SettingsHubProps {
    open?: boolean;
    onClose?: () => void;
}

const SettingsHub: React.FC<SettingsHubProps> = ({ open = true, onClose }) => {
    const settingsModules = [
        {
            id: 'company',
            label: 'Company',
            fullLabel: 'Company Settings',
            description: 'Business profile & info',
            icon: Building2,
            color: 'blue',
            component: CompanySettings
        },
        {
            id: 'employees',
            label: 'Employees',
            fullLabel: 'Employee Management',
            description: 'Staff & team management',
            icon: Users,
            color: 'green',
            component: EmployeeManagement
        },
        {
            id: 'master',
            label: 'Master',
            fullLabel: 'Master Settings',
            description: 'Feature flags & config',
            icon: Database,
            color: 'purple',
            component: MasterSettings
        }
    ];

    return (
        <ModuleHub
            open={open}
            onClose={onClose || (() => { })}
            title="Settings"
            subtitle="Application configuration"
            icon={Settings}
            modules={settingsModules}
            defaultModule="company"
        />
    );
};

export default SettingsHub;
