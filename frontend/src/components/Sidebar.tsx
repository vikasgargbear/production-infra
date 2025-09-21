import React, { useState } from 'react';
import { 
	Package, 
	Users, 
	ShoppingCart, 
	CreditCard, 
	Settings,
	Home,
	TrendingUp,
	Shield,
	Archive,
	ChevronRight,
	Menu,
	X,
	FileText,
	Home as HomeIcon,
	BarChart3,
	Target,
	User,
	MessageSquare,
	WalletCards,
	LucideIcon
} from 'lucide-react';
import { Button } from './global';

interface MenuItem {
	id: string;
	label: string;
	icon: LucideIcon;
	count?: string | null;
}

interface SidebarProps {
	activeTab: string;
	onTabChange: (tab: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange }) => {
	const [collapsed, setCollapsed] = useState<boolean>(false);
	const [mobileOpen, setMobileOpen] = useState<boolean>(false);
	
	const menuItems: MenuItem[] = [
		{
			id: 'home',
			label: 'Home',
			icon: HomeIcon,
			count: null
		},
		{ 
			id: 'dashboard', 
			label: 'Dashboard', 
			icon: Home,
			count: null
		},
		{ 
			id: 'products', 
			label: 'Products', 
			icon: Package,
			count: '150+'
		},
		{ 
			id: 'customers', 
			label: 'Customers', 
			icon: Users,
			count: '45'
		},
		{ 
			id: 'orders', 
			label: 'Orders', 
			icon: ShoppingCart,
			count: '268'
		},
		{ 
			id: 'batches', 
			label: 'Batches', 
			icon: Archive,
			count: '89'
		},
		{ 
			id: 'payment-entry', 
			label: 'Payment Entry', 
			icon: WalletCards,
			count: 'Quick'
		},
		{ 
			id: 'payments', 
			label: 'Payment Tracking', 
			icon: CreditCard,
			count: '₹5.2L'
		},
		{ 
			id: 'credit', 
			label: 'Credit Management', 
			icon: Shield,
			count: '45'
		},
		{ 
			id: 'whatsapp', 
			label: 'WhatsApp Business', 
			icon: MessageSquare,
			count: 'New'
		}
	];
	
	const advancedItems: MenuItem[] = [
		{ id: 'inventory', label: 'Inventory Management', icon: Package },
		{ id: 'accounting', label: 'Accounting Ledgers', icon: FileText },
		{ id: 'payment-dashboard', label: 'Payment Analytics', icon: BarChart3 },
		{ id: 'analytics', label: 'Analytics', icon: TrendingUp },
		{ id: 'reports', label: 'Reports', icon: FileText },
		{ id: 'compliance', label: 'Compliance', icon: Shield },
		{ id: 'profile', label: 'Company Profile', icon: User },
		// Settings removed - handled by settings icon in header
		{ id: 'test-save', label: 'Test Save', icon: Package }
	];

	const toggleSidebar = () => setCollapsed(!collapsed);
	const toggleMobileSidebar = () => setMobileOpen(!mobileOpen);

	// Mobile sidebar toggle button
	const MobileMenuButton: React.FC = () => (
		<Button
			className="fixed bottom-4 right-4 md:hidden bg-white p-3 rounded-full shadow-lg z-30 border border-gray-200"
			onClick={toggleMobileSidebar}
			variant="ghost"
			size="sm"
			aria-label="Toggle menu"
		>
			<Menu className="w-5 h-5 text-gray-700" />
		</Button>
	);

	// Sidebar header with logo and toggle buttons
	const SidebarHeader: React.FC = () => (
		<div className="flex items-center justify-between p-4 border-b border-gray-200">
			<div className="flex items-center space-x-3">
				<div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center border border-indigo-100">
					<Shield className="w-4 h-4 text-indigo-600" />
				</div>
				{!collapsed && (
					<div>
						<div className="font-semibold text-gray-900">AASO Pharma</div>
						<div className="text-xs text-gray-500">Wholesale Hub</div>
					</div>
				)}
			</div>
			{!collapsed ? (
				<Button
					onClick={toggleSidebar}
					className="p-1 rounded-md hover:bg-gray-100 text-gray-600 hidden md:block"
					variant="ghost"
					size="sm"
					aria-label="Collapse sidebar"
				>
					<ChevronRight className="w-4 h-4" />
				</Button>
			) : (
				<Button
					onClick={toggleSidebar}
					className="p-1 rounded-md hover:bg-gray-100 text-gray-600"
					variant="ghost"
					size="sm"
					aria-label="Expand sidebar"
				>
					<Menu className="w-4 h-4" />
				</Button>
			)}
			<Button
				onClick={toggleMobileSidebar}
				className="p-1 rounded-md hover:bg-gray-100 text-gray-600 md:hidden"
				variant="ghost"
				size="sm"
				aria-label="Close menu"
			>
				<X className="w-4 h-4" />
			</Button>
		</div>
	);

	// Main navigation menu items
	const MainNavigation: React.FC = () => (
		<div className="mb-2">
			{!collapsed && (
				<div className="px-3 py-2">
					<div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Main Menu</div>
				</div>
			)}
			
			<div className="space-y-1">
				{menuItems.map((item) => {
					const IconComponent = item.icon;
					const isActive = activeTab === item.id;
					
					return (
						<button
							key={item.id}
							className={`w-full flex items-center px-3 py-2 rounded-lg text-sm transition-colors ${
								isActive 
									? 'bg-indigo-50 text-indigo-700' 
									: 'hover:bg-gray-100 text-gray-700'
							}`}
							onClick={() => onTabChange(item.id)}
							aria-current={isActive ? 'page' : undefined}
							title={collapsed ? item.label : undefined}
						>
							<div className="flex items-center justify-center w-6 h-6">
								<IconComponent className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-gray-500'}`} />
							</div>
							
							{!collapsed && (
								<div className="ml-3 flex-1 flex items-center justify-between">
									<span className="font-medium">{item.label}</span>
									{item.count && (
										<span className={`text-xs px-1.5 py-0.5 rounded-full border ${
											isActive 
												? 'bg-indigo-100 text-indigo-700 border-indigo-200' 
												: 'bg-gray-100 text-gray-600 border-gray-200'
										}` }>
											{item.count}
										</span>
									)}
								</div>
							)}
						</button>
					);
				})}
			</div>
		</div>
	);

	// Advanced tools menu items
	const AdvancedTools: React.FC = () => (
		<div className="mt-6">
			{!collapsed && (
				<div className="px-3 py-2">
					<div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Advanced</div>
				</div>
			)}
			
			<div className="space-y-1">
				{advancedItems.map((item) => {
					const IconComponent = item.icon;
					const isActive = activeTab === item.id;
					
					return (
						<button
							key={item.id}
							className={`w-full flex items-center px-3 py-2 rounded-lg text-sm transition-colors ${
								isActive 
									? 'bg-indigo-50 text-indigo-700' 
									: 'hover:bg-gray-100 text-gray-700'
							}`}
							onClick={() => onTabChange(item.id)}
							aria-current={isActive ? 'page' : undefined}
							title={collapsed ? item.label : undefined}
						>
							<div className="flex items-center justify-center w-6 h-6">
								<IconComponent className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-gray-500'}`} />
							</div>
							
							{!collapsed && (
								<span className="ml-3 font-medium">{item.label}</span>
							)}
						</button>
					);
				})}
			</div>
		</div>
	);

	// Status footer
	const StatusFooter: React.FC = () => (
		!collapsed ? (
			<div className="mt-auto p-3 border-t border-gray-200">
				<div className="rounded-lg p-3 text-xs bg-green-50 border border-green-100">
					<div className="flex items-center">
						<div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" aria-hidden="true"></div>
						<span className="ml-2 text-green-800 font-medium">All systems online</span>
					</div>
				</div>
			</div>
		) : null
	);

	return (
		<>
			{/* Mobile overlay */}
			{mobileOpen && (
				<div 
					className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
					onClick={toggleMobileSidebar}
				/>
			)}
			
			{/* Mobile sidebar */}
			<div className={`fixed top-0 left-0 h-screen bg-white border-r border-gray-200 z-50 shadow-xl transition-all duration-300 transform md:hidden ${
				mobileOpen ? 'translate-x-0' : '-translate-x-full'
			} w-64`}>
				<div className="flex flex-col h-full">
					<SidebarHeader />
					<div className="p-3 overflow-y-auto flex-1">
						<MainNavigation />
						<AdvancedTools />
					</div>
					<StatusFooter />
				</div>
			</div>
			
			{/* Desktop sidebar */}
			<div className={`hidden md:block h-screen bg-white border-r border-gray-200 shadow-sm transition-all duration-300 fixed top-0 left-0 z-10 ${
				collapsed ? 'w-16' : 'w-64'
			}`}>
				<div className="flex flex-col h-full">
					<SidebarHeader />
					<div className="p-3 overflow-y-auto flex-1">
						<MainNavigation />
						<AdvancedTools />
					</div>
					<StatusFooter />
				</div>
			</div>
			
			{/* Mobile menu button */}
			<MobileMenuButton />
		</>
	);
};

export default Sidebar;
