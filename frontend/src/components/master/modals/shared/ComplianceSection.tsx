import React from 'react';
import { Shield } from 'lucide-react';
import Input from '../../../global/ui/forms/Input';
import { FORM_STYLES } from '../../../../constants/formStyles';

interface ComplianceSectionProps {
    formData: Record<string, any>;
    handleInputChange: (field: string, value: any) => void;
}

const ComplianceSection: React.FC<ComplianceSectionProps> = ({
    formData,
    handleInputChange
}) => (
    <div className="space-y-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
            <Shield className="w-5 h-5 mr-2" />
            Compliance &amp; GST
        </h3>

        <div className="grid grid-cols-2 gap-4">
            <div>
                <label className={FORM_STYLES.label}>GST Number</label>
                <Input
                    type="text"
                    value={formData.gst_number || ''}
                    onChange={(e) => handleInputChange('gst_number', e.target.value.toUpperCase())}
                    placeholder="27AABCU9603R1ZM"
                />
            </div>

            <div>
                <label className={FORM_STYLES.label}>PAN Number</label>
                <Input
                    type="text"
                    value={formData.pan_number || ''}
                    onChange={(e) => handleInputChange('pan_number', e.target.value.toUpperCase())}
                    placeholder="AABCU9603R"
                />
            </div>

            <div>
                <label className={FORM_STYLES.label}>Drug License Number</label>
                <Input
                    type="text"
                    value={formData.drug_license_number || ''}
                    onChange={(e) => handleInputChange('drug_license_number', e.target.value)}
                    placeholder="DL-12345"
                />
            </div>

            <div>
                <label className={FORM_STYLES.label}>Drug License Validity</label>
                <Input
                    type="date"
                    value={formData.drug_license_validity || ''}
                    onChange={(e) => handleInputChange('drug_license_validity', e.target.value)}
                />
            </div>

            <div>
                <label className={FORM_STYLES.label}>FSSAI Number</label>
                <Input
                    type="text"
                    value={formData.fssai_number || ''}
                    onChange={(e) => handleInputChange('fssai_number', e.target.value)}
                    placeholder="FSSAI-12345"
                />
            </div>
        </div>
    </div>
);

export default ComplianceSection;
