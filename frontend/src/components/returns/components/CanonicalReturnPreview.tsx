import React from 'react';
import type { CanonicalReturnCommandDetail } from '../../../services/api/modules/returns/canonicalReturns.api';

const ImpactBlock = ({ title, value }: { title: string; value: unknown }) => (
  <section className="rounded-lg border border-gray-200 bg-white p-4">
    <h3 className="mb-2 text-sm font-semibold text-gray-900">{title}</h3>
    <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-gray-700">
      {JSON.stringify(value, null, 2)}
    </pre>
  </section>
);

export const CanonicalReturnPreview = ({ command }: { command: CanonicalReturnCommandDetail }) => (
  <div className="space-y-4" aria-label="Immutable canonical return preview">
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
      <p className="font-semibold">Immutable preview</p>
      <dl className="mt-2 grid gap-2 md:grid-cols-2">
        <div><dt className="text-xs text-blue-700">Command UUID</dt><dd className="break-all font-mono">{command.command_request_id}</dd></div>
        <div><dt className="text-xs text-blue-700">Preview hash</dt><dd className="break-all font-mono">{command.preview_hash}</dd></div>
        <div><dt className="text-xs text-blue-700">Requester</dt><dd>{command.requester_name}</dd></div>
        <div><dt className="text-xs text-blue-700">Expires</dt><dd>{new Date(command.expires_at).toLocaleString()}</dd></div>
      </dl>
    </div>
    <div className="grid gap-4 xl:grid-cols-3">
      <ImpactBlock title="Inventory impact" value={command.inventory_impact} />
      <ImpactBlock title="Financial impact" value={command.financial_impact} />
      <ImpactBlock title="Tax impact" value={command.tax_impact} />
    </div>
    <div className="grid gap-4 xl:grid-cols-2">
      <ImpactBlock title="Resolved source references" value={command.resolved_references} />
      <ImpactBlock title="Source versions and evidence" value={command.source_versions} />
    </div>
    <ImpactBlock title="Calculation authority" value={command.calculation_ruleset} />
    {command.policy_warnings.length > 0 && (
      <ImpactBlock title="Policy warnings" value={command.policy_warnings} />
    )}
  </div>
);

export default CanonicalReturnPreview;
