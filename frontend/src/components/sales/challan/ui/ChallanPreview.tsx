import React from 'react';
import { formatExactDecimal } from '../../../../utils/exactDecimal';
import type { Challan, CompanyInfo } from '../types/challanTypes';
import { canonicalDispatchPreviewUnavailableReason } from '../../utils/canonicalSalesPreviewFacts';

interface ChallanPreviewProps {
    challan: Challan;
    companyInfo?: CompanyInfo;
}

/**
 * Draft dispatch evidence only. The canonical dispatch lifecycle moves stock and
 * records inventory valuation; it does not establish selling price, GST, MRP,
 * freight, or an invoice total. Those facts therefore never appear here.
 */
const ChallanPreview: React.FC<ChallanPreviewProps> = ({
    challan,
    companyInfo,
}) => {
    const companyName = String(companyInfo?.company_name ?? companyInfo?.name ?? '').trim();
    const previewUnavailableReason = canonicalDispatchPreviewUnavailableReason(challan)
        || (!companyName ? 'The canonical company name is unavailable.' : null);
    if (previewUnavailableReason) {
        return (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900" role="alert">
                <h2 className="font-semibold">Authoritative delivery-challan preview unavailable</h2>
                <p className="mt-1 text-sm">{previewUnavailableReason}</p>
            </div>
        );
    }

    return (
        <div className="w-full bg-white">
            <style>{`
                @media print {
                    body * { visibility: hidden; }
                    #challan-preview, #challan-preview * { visibility: visible; }
                    #challan-preview {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        padding: 20px;
                    }
                    @page { size: A4 portrait; margin: 15mm; }
                    .print-colors {
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                }
            `}</style>

            <div id="challan-preview" className="p-8 font-sans print-colors">
                <div className="mb-6 flex items-start justify-between border-b-2 border-gray-800 pb-4">
                    <div className="flex items-start gap-3">
                        {companyInfo?.logo ? (
                            <img src={companyInfo.logo} alt={companyName} className="h-14 w-14 object-contain" />
                        ) : (
                            <div className="flex h-14 w-14 items-center justify-center rounded bg-gray-800 text-xl font-bold text-white">
                                {companyName.charAt(0).toUpperCase()}
                            </div>
                        )}
                        <div>
                            <h2 className="text-lg font-bold uppercase text-gray-900">{companyName}</h2>
                            {companyInfo?.address && <p className="text-sm text-gray-600">{companyInfo.address}</p>}
                            <p className="text-sm text-gray-600">
                                GSTIN: {companyInfo?.gst_number || 'Unavailable from company context'}
                            </p>
                        </div>
                    </div>
                    <div className="text-right">
                        <h1 className="text-xl font-bold uppercase text-gray-900">Delivery Challan</h1>
                        <p className="mt-1 text-sm text-gray-600">
                            No: {challan.challan_number || 'Assigned after posting'}
                        </p>
                        <p className="text-sm text-gray-600">Dispatch date: {challan.challan_date}</p>
                    </div>
                </div>

                <div className="mb-6 grid grid-cols-2 gap-4">
                    <div className="rounded-lg border border-gray-300 bg-gray-50 p-4">
                        <h3 className="mb-2 text-xs font-bold uppercase text-gray-700">Customer</h3>
                        <p className="font-semibold text-gray-900">{challan.customer_name}</p>
                    </div>
                    <div className="rounded-lg border border-gray-300 bg-gray-50 p-4">
                        <h3 className="mb-2 text-xs font-bold uppercase text-gray-700">Canonical source</h3>
                        <p className="text-sm text-gray-800">Approved sales order</p>
                        <p className="mt-1 break-all text-xs text-gray-600">{challan.source_order_id}</p>
                    </div>
                </div>

                {(challan.transport_company || challan.vehicle_number || challan.lr_number) && (
                    <div className="mb-6 rounded-lg border border-gray-300 p-4">
                        <h3 className="mb-2 text-xs font-bold uppercase text-gray-700">Transport evidence</h3>
                        <dl className="grid grid-cols-3 gap-4 text-sm">
                            {challan.transport_company && <div><dt className="text-gray-500">Transporter</dt><dd>{challan.transport_company}</dd></div>}
                            {challan.vehicle_number && <div><dt className="text-gray-500">Vehicle</dt><dd>{challan.vehicle_number}</dd></div>}
                            {challan.lr_number && <div><dt className="text-gray-500">Transport document</dt><dd>{challan.lr_number}</dd></div>}
                        </dl>
                    </div>
                )}

                <div className="mb-6 overflow-x-auto">
                    <table className="w-full border border-gray-300">
                        <thead className="bg-gray-100">
                            <tr>
                                <th className="border-r px-3 py-2 text-left text-xs uppercase text-gray-700">#</th>
                                <th className="border-r px-3 py-2 text-left text-xs uppercase text-gray-700">Product</th>
                                <th className="border-r px-3 py-2 text-left text-xs uppercase text-gray-700">Batch</th>
                                <th className="border-r px-3 py-2 text-left text-xs uppercase text-gray-700">Expiry</th>
                                <th className="border-r px-3 py-2 text-right text-xs uppercase text-gray-700">Billed qty</th>
                                <th className="border-r px-3 py-2 text-right text-xs uppercase text-gray-700">Free qty</th>
                                <th className="px-3 py-2 text-left text-xs uppercase text-gray-700">Unit</th>
                            </tr>
                        </thead>
                        <tbody>
                            {challan.items.map((item, index) => (
                                <tr key={String(item.source_order_line_id)} className="border-t">
                                    <td className="border-r px-3 py-2 text-sm">{index + 1}</td>
                                    <td className="border-r px-3 py-2 text-sm">
                                        <div className="font-medium">{item.product_name}</div>
                                        <div className="break-all text-[10px] text-gray-500">{item.source_order_line_id}</div>
                                    </td>
                                    <td className="border-r px-3 py-2 text-sm">{item.batch_number}</td>
                                    <td className="border-r px-3 py-2 text-sm">{item.expiry_date || 'Not supplied'}</td>
                                    <td className="border-r px-3 py-2 text-right text-sm">
                                        {formatExactDecimal(item.quantity, 'Dispatch billed quantity', { scale: 6 })}
                                    </td>
                                    <td className="border-r px-3 py-2 text-right text-sm">
                                        {formatExactDecimal(item.free_quantity, 'Dispatch free quantity', { scale: 6 })}
                                    </td>
                                    <td className="px-3 py-2 text-sm">{item.uom_code || item.unit}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                    Selling price, MRP, GST, freight, and document totals are intentionally absent. The independent canonical review shows the resolved stock quantities and inventory valuation before posting.
                </div>

                {challan.notes && (
                    <div className="mt-4 rounded-lg border border-gray-200 p-3">
                        <p className="text-xs font-semibold text-gray-700">Dispatch notes</p>
                        <p className="mt-1 text-sm text-gray-600">{challan.notes}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ChallanPreview;
