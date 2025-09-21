import React from 'react';
import GSTModuleMain from './GSTModuleMain';

interface GSTBalancedProps {
  open?: boolean;
  onClose?: () => void;
}

const GSTBalanced: React.FC<GSTBalancedProps> = ({ onClose }) => {
  return <GSTModuleMain onBack={onClose} />;
};

export default GSTBalanced;