/**
 * CustomerSearch Component Tests
 * Tests the actual CustomerSearch component from components-v2
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { CustomerSearch } from '../../components/global';
import { customerAPI } from '../../services/api/apiClientExports';

// Mock the API
jest.mock('../../services/api/apiClientExports');

const mockCustomers = [
  {
    customer_id: '1',
    customer_name: 'Test Pharmacy',
    primary_phone: '9876543210',
    primary_email: 'test@pharmacy.com',
    customer_type: 'retail',
    balance_amount: 5000
  },
  {
    customer_id: '2',
    customer_name: 'Wholesale Medical Store',
    primary_phone: '9876543211',
    customer_type: 'wholesale',
    balance_amount: 50000
  }
];

describe('CustomerSearch Component (components-v2)', () => {
  let queryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    
    // Reset mocks
    jest.clearAllMocks();
  });

  const renderComponent = (props = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <CustomerSearch 
          onSelect={jest.fn()}
          placeholder="Search customers..."
          {...props}
        />
      </QueryClientProvider>
    );
  };

  test('Should render search input', () => {
    renderComponent();
    
    const searchInput = screen.getByPlaceholderText('Search customers...');
    expect(searchInput).toBeInTheDocument();
  });

  test('Should search customers on input', async () => {
    customerAPI.search = jest.fn().mockResolvedValue({
      success: true,
      data: mockCustomers
    });

    renderComponent();
    
    const searchInput = screen.getByPlaceholderText('Search customers...');
    fireEvent.change(searchInput, { target: { value: 'test' } });

    await waitFor(() => {
      expect(customerAPI.search).toHaveBeenCalledWith('test');
    });

    // Should display search results
    await waitFor(() => {
      expect(screen.getByText('Test Pharmacy')).toBeInTheDocument();
      expect(screen.getByText('Wholesale Medical Store')).toBeInTheDocument();
    });
  });

  test('Should display customer details in dropdown', async () => {
    customerAPI.search = jest.fn().mockResolvedValue({
      success: true,
      data: mockCustomers
    });

    renderComponent();
    
    const searchInput = screen.getByPlaceholderText('Search customers...');
    fireEvent.change(searchInput, { target: { value: 'test' } });

    await waitFor(() => {
      // Check if phone numbers are displayed
      expect(screen.getByText('9876543210')).toBeInTheDocument();
      // Check if customer types are displayed
      expect(screen.getByText('retail')).toBeInTheDocument();
      expect(screen.getByText('wholesale')).toBeInTheDocument();
    });
  });

  test('Should call onSelect when customer is selected', async () => {
    const onSelect = jest.fn();
    customerAPI.search = jest.fn().mockResolvedValue({
      success: true,
      data: mockCustomers
    });

    renderComponent({ onSelect });
    
    const searchInput = screen.getByPlaceholderText('Search customers...');
    fireEvent.change(searchInput, { target: { value: 'test' } });

    await waitFor(() => {
      expect(screen.getByText('Test Pharmacy')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Test Pharmacy'));

    expect(onSelect).toHaveBeenCalledWith(mockCustomers[0]);
  });

  test('Should show create new customer option', async () => {
    const onCreateNew = jest.fn();
    customerAPI.search = jest.fn().mockResolvedValue({
      success: true,
      data: []
    });

    renderComponent({ 
      allowCreate: true,
      onCreateNew 
    });
    
    const searchInput = screen.getByPlaceholderText('Search customers...');
    fireEvent.change(searchInput, { target: { value: 'new customer' } });

    await waitFor(() => {
      expect(screen.getByText(/Create new customer/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Create new customer/i));
    expect(onCreateNew).toHaveBeenCalledWith('new customer');
  });

  test('Should handle API errors gracefully', async () => {
    customerAPI.search = jest.fn().mockRejectedValue(new Error('API Error'));

    renderComponent();
    
    const searchInput = screen.getByPlaceholderText('Search customers...');
    fireEvent.change(searchInput, { target: { value: 'test' } });

    await waitFor(() => {
      expect(screen.getByText(/Error loading customers/i)).toBeInTheDocument();
    });
  });

  test('Should debounce search requests', async () => {
    customerAPI.search = jest.fn().mockResolvedValue({
      success: true,
      data: mockCustomers
    });

    renderComponent();
    
    const searchInput = screen.getByPlaceholderText('Search customers...');
    
    // Type quickly
    fireEvent.change(searchInput, { target: { value: 't' } });
    fireEvent.change(searchInput, { target: { value: 'te' } });
    fireEvent.change(searchInput, { target: { value: 'tes' } });
    fireEvent.change(searchInput, { target: { value: 'test' } });

    // Should only call API once after debounce
    await waitFor(() => {
      expect(customerAPI.search).toHaveBeenCalledTimes(1);
      expect(customerAPI.search).toHaveBeenCalledWith('test');
    });
  });

  test('Should clear selection', async () => {
    const onSelect = jest.fn();
    customerAPI.search = jest.fn().mockResolvedValue({
      success: true,
      data: mockCustomers
    });

    renderComponent({ onSelect, clearable: true });
    
    // Select a customer
    const searchInput = screen.getByPlaceholderText('Search customers...');
    fireEvent.change(searchInput, { target: { value: 'test' } });

    await waitFor(() => {
      expect(screen.getByText('Test Pharmacy')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Test Pharmacy'));

    // Should show clear button
    const clearButton = screen.getByLabelText('Clear selection');
    expect(clearButton).toBeInTheDocument();

    // Clear selection
    fireEvent.click(clearButton);
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  test('Should integrate with CustomerCreationModal', async () => {
    const { CustomerCreationModal } = require('../../components/global');
    
    customerAPI.search = jest.fn().mockResolvedValue({
      success: true,
      data: []
    });

    const TestComponent = () => {
      const [showModal, setShowModal] = React.useState(false);
      const [selectedCustomer, setSelectedCustomer] = React.useState(null);

      return (
        <>
          <CustomerSearch
            onSelect={setSelectedCustomer}
            allowCreate={true}
            onCreateNew={() => setShowModal(true)}
          />
          <CustomerCreationModal
            isOpen={showModal}
            onClose={() => setShowModal(false)}
            onSuccess={(customer) => {
              setSelectedCustomer(customer);
              setShowModal(false);
            }}
          />
        </>
      );
    };

    render(
      <QueryClientProvider client={queryClient}>
        <TestComponent />
      </QueryClientProvider>
    );

    const searchInput = screen.getByPlaceholderText('Search customers...');
    fireEvent.change(searchInput, { target: { value: 'new pharmacy' } });

    await waitFor(() => {
      expect(screen.getByText(/Create new customer/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Create new customer/i));

    // Modal should open
    expect(screen.getByText('Create New Customer')).toBeInTheDocument();
  });
});