import { apiHelpers } from '../../apiClient';

export interface AuditLogParams {
    start_date?: string;
    end_date?: string;
    user_id?: number;
    entity_type?: string;
    activity_type?: string;
    entity_id?: string;
    search?: string;
    page?: number;
    limit?: number;
}

export interface AuditLogEntry {
    audit_id: number;
    activity_timestamp: string;
    activity_type: string;
    entity_type: string;
    entity_id: string;
    entity_name: string;
    action_performed: string;
    user_id: number;
    user_name: string;
    full_name: string;
    result_status: string;
    ip_address: string;
    module_name: string;
    old_values?: Record<string, any>;
    new_values?: Record<string, any>;
    changed_fields?: string[];
    error_message?: string;
}

export interface AuditSummary {
    total_actions: number;
    active_users: number;
    critical_changes: number;
    failed_logins: number;
    by_activity_type: { activity_type: string; count: number }[];
    by_entity_type: { entity_type: string; count: number }[];
    by_user: { user_id: number; user_name: string; count: number }[];
}

export const auditApi = {
    getAll: (params?: AuditLogParams) =>
        apiHelpers.get<{ data: AuditLogEntry[]; total: number; page: number; limit: number }>(
            '/audit-logs',
            { params }
        ),

    getSummary: () =>
        apiHelpers.get<AuditSummary>('/audit-logs/summary'),

    getById: (id: number) =>
        apiHelpers.get<AuditLogEntry>(`/audit-logs/${id}`),
};
