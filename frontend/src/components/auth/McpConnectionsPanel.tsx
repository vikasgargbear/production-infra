import React, { useEffect, useState } from 'react';
import { McpConsentProposal, loadMcpConsentProposals, confirmMcpConsentProposal } from '../../services/auth/oauthConsentClient';
import { formatExactDecimal } from '../../utils/exactDecimal';

export default function McpConnectionsPanel({ clientId, subjectId, clientName, onConfirmed }: {
    clientId?: string;
    subjectId?: string;
    clientName?: string;
    onConfirmed?: () => void | Promise<void>;
}) {
    const [proposals, setProposals] = useState<McpConsentProposal[]>([]);
    const [selected, setSelected] = useState<McpConsentProposal | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [confirmed, setConfirmed] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
        let active = true;
        loadMcpConsentProposals(clientId).then(rows => {
            if (rows.some(row => (subjectId && row.subject !== subjectId)
                || (clientName && row.client_display_name !== clientName))) {
                throw new Error('The reviewed connection does not match this signed-in user or client.');
            }
            if (active) setProposals(rows);
        }).catch(reason => { if (active) setError(reason.message); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [clientId, subjectId, clientName]);
    const confirm = async () => {
        if (!selected || saving) return;
        setSaving(true);
        setError('');
        try {
            await confirmMcpConsentProposal(selected);
            await onConfirmed?.();
            setConfirmed(true);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Unable to confirm connection.');
        } finally { setSaving(false); }
    };
    return <section className="mx-auto max-w-2xl p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Connect your ERP organization</h1>
        <p>Choose the organization and connection you intend to use. This confirms existing reviewed access; it does not add permissions.</p>
        {error && <p role="alert" className="text-red-700">{error}</p>}
        {loading ? <p role="status">Loading reviewed connections…</p> : !proposals.length ?
            <p>No reviewed connection grant is available. Ask your organization administrator to review access before connecting.</p> :
            <label className="block">Organization and connection
                <select className="block w-full min-h-11 border rounded p-2 text-base" value={selected?.agent_grant_id || ''}
                    disabled={saving || confirmed} onChange={event => setSelected(proposals.find(row => row.agent_grant_id === event.target.value) || null)}>
                    <option value="">Choose a reviewed connection</option>
                    {proposals.map(row => <option key={row.agent_grant_id} value={row.agent_grant_id}>
                        {row.organization_name} — {row.client_display_name}{row.branch_name ? ` — ${row.branch_name}` : ''}
                    </option>)}
                </select>
            </label>}
        {selected && <div className="space-y-3">
            <p><strong>{selected.organization_name}</strong> · {selected.client_display_name}</p>
            <p>Branch: {selected.branch_name || 'All authorized branches'}</p>
            <p>Expires: {new Date(selected.expires_at).toLocaleString()}</p>
            <ul className="space-y-2">{selected.capabilities.map(capability => <li key={capability.capability_code}>
                {capability.capability_code} — {capability.operation_mode}; risk: {capability.risk_class.replace(/_/g, ' ')};
                approval: {capability.approval_policy.replace(/_/g, ' ')}
                {capability.maximum_amount !== null && `; limit ${capability.currency_code || ''} ${formatExactDecimal(capability.maximum_amount, 2)}`}
                {capability.allow_sensitive_read && <strong className="block text-amber-700">Includes sensitive records</strong>}
            </li>)}</ul>
            <button type="button" className="min-h-11 rounded bg-blue-600 px-4 py-2 text-white" disabled={saving || confirmed} onClick={() => void confirm()}>
                {saving ? 'Confirming…' : confirmed ? 'Connection confirmed' : 'Confirm this organization and access'}
            </button>
        </div>}
        {confirmed && !onConfirmed && <p role="status">Connection confirmed. Reconnect your ERP app in ChatGPT to receive the updated connection.</p>}
    </section>;
}
