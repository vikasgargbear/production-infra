import { useState } from 'react';

interface UseInvoiceFiltersReturn {
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    filterStatus: string;
    setFilterStatus: (status: string) => void;
    dateFilter: string;
    setDateFilter: (filter: string) => void;
    showFilters: boolean;
    setShowFilters: (show: boolean) => void;
    handleSearchChange: (query: string, onFetch: (filters: any) => void) => void;
    handleStatusChange: (status: string, searchQuery: string, onFetch: (filters: any) => void) => void;
    handleDateChange: (dateFilter: string, searchQuery: string, filterStatus: string, onFetch: (filters: any) => void) => void;
    handleFilterChange: (filters: any, onFetch: (filters: any) => void) => void;
}

export function useInvoiceFilters(): UseInvoiceFiltersReturn {
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [dateFilter, setDateFilter] = useState('all');
    const [showFilters, setShowFilters] = useState(false);

    const handleSearchChange = (query: string, onFetch: (filters: any) => void) => {
        setSearchQuery(query);

        const timeoutId = setTimeout(() => {
            const searchParams = {
                search: query,
                payment_status: filterStatus === 'all' ? undefined : filterStatus
            };
            onFetch(searchParams);
        }, 500);

        return () => clearTimeout(timeoutId);
    };

    const handleStatusChange = (
        status: string,
        searchQuery: string,
        onFetch: (filters: any) => void
    ) => {
        setFilterStatus(status);
        const searchParams = {
            search: searchQuery,
            payment_status: status === 'all' ? undefined : status
        };
        onFetch(searchParams);
    };

    const handleDateChange = (
        dateFilter: string,
        searchQuery: string,
        filterStatus: string,
        onFetch: (filters: any) => void
    ) => {
        setDateFilter(dateFilter);
        const searchParams = {
            search: searchQuery,
            payment_status: filterStatus === 'all' ? undefined : filterStatus,
            dateFilter: dateFilter
        };
        onFetch(searchParams);
    };

    const handleFilterChange = (filters: any, onFetch: (filters: any) => void) => {
        if (filters.status) setFilterStatus(filters.status);
        if (filters.dateFilter) setDateFilter(filters.dateFilter);

        const searchParams = {
            search: searchQuery,
            payment_status: filterStatus === 'all' ? undefined : filterStatus,
            ...filters
        };

        onFetch(searchParams);
    };

    return {
        searchQuery,
        setSearchQuery,
        filterStatus,
        setFilterStatus,
        dateFilter,
        setDateFilter,
        showFilters,
        setShowFilters,
        handleSearchChange,
        handleStatusChange,
        handleDateChange,
        handleFilterChange
    };
}
