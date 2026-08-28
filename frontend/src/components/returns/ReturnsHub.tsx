import React from 'react';
import { RotateCcw, ShoppingCart, Package, List, ShieldCheck, Send, Undo2 } from 'lucide-react';
import { ModuleHub } from '../global';
import SalesReturnFlow from './SalesReturnFlow';
import PurchaseReturnFlow from './PurchaseReturnFlow';
import ReturnsListHistory from './ReturnsListHistory';
import ReturnApprovalInbox from './ReturnApprovalInbox';
import ReturnRequesterInbox from './ReturnRequesterInbox';
import CommercialReversalFlow from './CommercialReversalFlow';
import { RETURN_SUBPAGE_IDS, ReturnSubpage } from './returnsNavigation';

export { RETURN_SUBPAGE_IDS } from './returnsNavigation';
export type { ReturnSubpage } from './returnsNavigation';

interface ReturnsHubProps {
  open?: boolean;
  onClose?: () => void;
  initialSubpage?: string | null;
  onSubpageChange?: (subpage: string | null) => void;
}

interface ReturnsModule {
  id: string;
  label: string;
  fullLabel: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  component: React.ComponentType<any>;
}

const ReturnsHub: React.FC<ReturnsHubProps> = ({
  open = true,
  onClose,
  initialSubpage,
  onSubpageChange,
}) => {
  const resolvedDefault: ReturnSubpage = initialSubpage
    && (RETURN_SUBPAGE_IDS as readonly string[]).includes(initialSubpage)
    ? initialSubpage as ReturnSubpage
    : 'sales-return';
  const returnsModules: ReturnsModule[] = [
    {
      id: 'sales-return',
      label: 'Sales Return',
      fullLabel: 'Sales Return',
      description: 'Process customer returns',
      icon: ShoppingCart,
      color: 'red',
      component: SalesReturnFlow
    },
    {
      id: 'purchase-return',
      label: 'Purchase Return',
      fullLabel: 'Purchase Return',
      description: 'Return to suppliers',
      icon: Package,
      color: 'orange',
      component: PurchaseReturnFlow
    },
    {
      id: 'commercial-reversal',
      label: 'Correct Posted',
      fullLabel: 'Compensating Return / Note Reversal',
      description: 'Correct an erroneous posted return or note',
      icon: Undo2,
      color: 'amber',
      component: CommercialReversalFlow
    },
    {
      id: 'returns-history',
      label: 'All Returns',
      fullLabel: 'Returns History',
      description: 'View return history',
      icon: List,
      color: 'gray',
      component: ReturnsListHistory
    },
    {
      id: 'approval-inbox',
      label: 'Approvals',
      fullLabel: 'Return Approval Inbox',
      description: 'Approve another member’s immutable return',
      icon: ShieldCheck,
      color: 'blue',
      component: ReturnApprovalInbox
    },
    {
      id: 'resume-post',
      label: 'Resume / Post',
      fullLabel: 'My Prepared Returns',
      description: 'Resume approved returns and post once',
      icon: Send,
      color: 'green',
      component: ReturnRequesterInbox
    }
  ];

  return (
    <ModuleHub
      open={open}
      onClose={onClose || (() => { })}
      title="Returns"
      subtitle="Process sales and purchase returns"
      icon={RotateCcw}
      modules={returnsModules}
      defaultModule={resolvedDefault}
      onActiveModuleChange={onSubpageChange}
    />
  );
};

export default ReturnsHub;
