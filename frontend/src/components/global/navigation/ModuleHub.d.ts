import React from 'react';

export interface ModuleItem {
  id: string;
  label: string;
  fullLabel?: string;
  description?: string;
  icon: React.ComponentType<any>;
  color: string;
  component: React.ComponentType<any> | null;
}

export interface ModuleHubProps {
  open?: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  icon?: React.ComponentType<any>;
  modules: ModuleItem[];
  defaultModule?: string;
}

declare const ModuleHub: React.FC<ModuleHubProps>;
export default ModuleHub;