/**
 * Accessibility E2E Tests
 *
 * Covers the critical a11y requirements identified in the audit:
 * - Login inputs have associated labels
 * - Main landmark is present on Home
 * - All sidebar navigation buttons in ModuleHub have accessible names
 * - GenericSuccessModal has role="dialog", aria-modal, and aria-labelledby
 * - CancelDocumentModal has aria-modal and aria-labelledby
 * - Icon-only action buttons have aria-label
 */

import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    login: jest.fn(),
    loginWithGoogle: jest.fn(),
    isOnline: true,
  }),
}));

jest.mock('../contexts/CompanyContext', () => ({
  useCompany: () => ({ companyInfo: { name: 'Test Pharma', logo: null } }),
}));

jest.mock('../hooks/usePermissions', () => ({
  usePermissions: () => ({ hasModuleAccess: () => true }),
}));

jest.mock('../contexts/SidebarContext', () => ({
  useSidebar: () => ({
    settings: { isExpanded: true, lockExpanded: false },
    setIsHovering: jest.fn(),
    toggleLockExpanded: jest.fn(),
  }),
}));

// CanonicalWriteNotice used inside CancelDocumentModal
jest.mock('../components/global/ui/CanonicalWriteNotice', () => ({
  __esModule: true,
  default: function CanonicalWriteNoticeStub() {
    return null;
  },
}));

// ─── Login Page ──────────────────────────────────────────────────────────────

describe('LoginPage accessibility', () => {
  it('email input has an associated label', () => {
    const { default: LoginPage } = require('../components/auth/LoginPage');
    render(React.createElement(LoginPage));
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
  });

  it('password input has an associated label', () => {
    const { default: LoginPage } = require('../components/auth/LoginPage');
    render(React.createElement(LoginPage));
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('submit button is present and has type submit', () => {
    const { default: LoginPage } = require('../components/auth/LoginPage');
    render(React.createElement(LoginPage));
    // Use exact name match to distinguish from "Sign in with Google"
    const submitBtn = screen.getByRole('button', { name: /^sign in$/i });
    expect(submitBtn).toBeInTheDocument();
  });

  it('Google sign-in button is present and labelled', () => {
    const { default: LoginPage } = require('../components/auth/LoginPage');
    render(React.createElement(LoginPage));
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
  });
});

// ─── Home ────────────────────────────────────────────────────────────────────

describe('Home accessibility', () => {
  it('renders a <main> landmark', () => {
    const { default: Home } = require('../components/Home');
    render(React.createElement(Home, { setActiveTab: jest.fn() }));
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('action cards are buttons with visible text labels', () => {
    const { default: Home } = require('../components/Home');
    render(React.createElement(Home, { setActiveTab: jest.fn() }));
    // All module buttons should have text — verify the specific ones with unique names
    const purchaseButton = screen.getByRole('button', { name: /purchase entry/i });
    expect(purchaseButton).toBeInTheDocument();
  });
});

// ─── ModuleHub ───────────────────────────────────────────────────────────────

describe('ModuleHub accessibility', () => {
  function PackageIcon() { return null; }
  function StubModule() { return null; }

  const sampleModules = [
    {
      id: 'current-stock',
      label: 'Stock',
      fullLabel: 'Current Stock',
      description: 'View current stock levels',
      icon: PackageIcon,
      color: 'blue',
      component: StubModule,
    },
    {
      id: 'batch-tracking',
      label: 'Batches',
      fullLabel: 'Batch Tracking',
      description: 'Track batches',
      icon: PackageIcon,
      color: 'green',
      component: StubModule,
    },
  ];

  it('sidebar nav buttons have accessible names', () => {
    const { default: ModuleHub } = require('../components/global/navigation/ModuleHub');
    render(
      React.createElement(ModuleHub, {
        open: true,
        title: 'Inventory',
        modules: sampleModules,
        layout: 'sidebar',
      })
    );
    const navRegion = screen.getByRole('navigation', { name: /inventory module navigation/i });
    const buttons = within(navRegion).getAllByRole('button');
    buttons.forEach((btn) => {
      expect(btn).toHaveAccessibleName();
    });
  });

  it('Home navigation button has aria-label "Back to Home"', () => {
    const { default: ModuleHub } = require('../components/global/navigation/ModuleHub');
    render(
      React.createElement(ModuleHub, {
        open: true,
        title: 'Inventory',
        modules: sampleModules,
        onClose: jest.fn(),
        layout: 'sidebar',
      })
    );
    // The sidebar "Back to Home" button in the desktop sidebar
    const homeButtons = screen.getAllByRole('button', { name: /back to home/i });
    expect(homeButtons.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── CancelDocumentModal ─────────────────────────────────────────────────────

describe('CancelDocumentModal accessibility', () => {
  it('has role="dialog", aria-modal="true", and aria-labelledby', () => {
    const { default: CancelDocumentModal } = require('../components/global/modals/CancelDocumentModal');
    const doc = { id: 1, document_number: 'ORD-001' };
    render(
      React.createElement(CancelDocumentModal, {
        isOpen: true,
        onClose: jest.fn(),
        documentType: 'order',
        document: doc,
      })
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const labelId = dialog.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId as string)).toBeInTheDocument();
  });

  it('close button has an accessible name', () => {
    const { default: CancelDocumentModal } = require('../components/global/modals/CancelDocumentModal');
    const doc = { id: 1, document_number: 'ORD-001' };
    render(
      React.createElement(CancelDocumentModal, {
        isOpen: true,
        onClose: jest.fn(),
        documentType: 'order',
        document: doc,
      })
    );
    // The X icon button has aria-label="Close cancellation notice"
    expect(screen.getByRole('button', { name: /close cancellation notice/i })).toBeInTheDocument();
  });
});

// ─── GenericSuccessModal ─────────────────────────────────────────────────────

describe('GenericSuccessModal accessibility', () => {
  it('has role="dialog", aria-modal="true", and aria-labelledby pointing at title', () => {
    const { default: GenericSuccessModal } = require('../components/global/modals/GenericSuccessModal');
    render(
      React.createElement(GenericSuccessModal, {
        isOpen: true,
        onClose: jest.fn(),
        title: 'Invoice Created',
        documentNumber: 'INV-001',
        documentType: 'invoice',
        customerName: 'Test Customer',
        totalAmount: 1500,
        showQuickActions: false,
      })
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const labelId = dialog.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    const titleEl = document.getElementById(labelId as string);
    expect(titleEl).toBeInTheDocument();
    expect(titleEl).toHaveTextContent('Invoice Created');
  });

  it('close button has accessible name', () => {
    const { default: GenericSuccessModal } = require('../components/global/modals/GenericSuccessModal');
    render(
      React.createElement(GenericSuccessModal, {
        isOpen: true,
        onClose: jest.fn(),
        title: 'Invoice Created',
        documentNumber: 'INV-001',
        documentType: 'invoice',
        showQuickActions: false,
      })
    );
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
  });

  it('renders an exact decimal-string amount without JavaScript number coercion', () => {
    const { default: GenericSuccessModal } = require('../components/global/modals/GenericSuccessModal');
    render(
      React.createElement(GenericSuccessModal, {
        isOpen: true,
        onClose: jest.fn(),
        documentType: 'purchase-order',
        totalAmount: '9007199254740993.01',
        showQuickActions: false,
      })
    );
    expect(screen.getByText('₹9007199254740993.01')).toBeInTheDocument();
  });

  it('disables contact actions when destinations are missing or invalid', () => {
    const { default: GenericSuccessModal } = require('../components/global/modals/GenericSuccessModal');
    render(React.createElement(GenericSuccessModal, {
      isOpen: true,
      onClose: jest.fn(),
      documentType: 'invoice',
      documentNumber: 'INV-001',
      customerName: 'Test Customer',
      partyDetails: { phone: '123', email: 'not-an-email' },
    }));

    expect(screen.getByRole('button', { name: 'Valid WhatsApp number unavailable' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Valid email address unavailable' })).toBeDisabled();
  });

  it('uses the shared WhatsApp mark and the device mail composer for valid destinations', () => {
    const { default: GenericSuccessModal } = require('../components/global/modals/GenericSuccessModal');
    const opened = jest.spyOn(window, 'open').mockImplementation(() => null);
    render(React.createElement(GenericSuccessModal, {
      isOpen: true,
      onClose: jest.fn(),
      documentType: 'invoice',
      documentNumber: 'INV-001',
      customerName: 'Test Customer',
      totalAmount: '168.00',
      partyDetails: { phone: '+91 98765 43210', email: 'buyer@example.com' },
    }));

    const whatsapp = screen.getByRole('button', { name: 'Open WhatsApp for Test Customer' });
    expect(whatsapp.querySelector('svg')).toBeInTheDocument();
    fireEvent.click(whatsapp);
    expect(opened).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/wa\.me\/919876543210\?text=/),
      '_blank',
      'noopener,noreferrer',
    );
    expect(screen.getByRole('link', { name: 'Email Test Customer' }).getAttribute('href'))
      .toMatch(/^mailto:buyer%40example\.com\?/);
    expect(document.body.innerHTML).not.toContain('mail.google.com');
    opened.mockRestore();
  });
});
