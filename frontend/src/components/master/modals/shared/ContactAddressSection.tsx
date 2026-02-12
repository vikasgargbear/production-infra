import React from 'react';
import { Phone } from 'lucide-react';
import Input from '../../../global/ui/forms/Input';
import { FORM_STYLES } from '../../../../constants/formStyles';

interface ContactAddressSectionProps {
    formData: Record<string, any>;
    handleInputChange: (field: string, value: any) => void;
    extraContactPersonFields?: React.ReactNode;
}

const ContactAddressSection: React.FC<ContactAddressSectionProps> = ({
    formData,
    handleInputChange,
    extraContactPersonFields
}) => (
    <div className="space-y-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
            <Phone className="w-5 h-5 mr-2" />
            Contact &amp; Address
        </h3>

        {/* Contact Details */}
        <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">Contact Information</h4>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className={FORM_STYLES.labelRequired}>Primary Phone</label>
                    <Input
                        type="tel"
                        required
                        value={formData.primary_phone || ''}
                        onChange={(e) => handleInputChange('primary_phone', e.target.value)}
                        placeholder="+91-9876543210"
                    />
                </div>

                <div>
                    <label className={FORM_STYLES.label}>Primary Email</label>
                    <Input
                        type="email"
                        value={formData.primary_email || ''}
                        onChange={(e) => handleInputChange('primary_email', e.target.value)}
                        placeholder="email@example.com"
                    />
                </div>

                <div>
                    <label className={FORM_STYLES.label}>WhatsApp Number</label>
                    <Input
                        type="tel"
                        value={formData.whatsapp_number || ''}
                        onChange={(e) => handleInputChange('whatsapp_number', e.target.value)}
                        placeholder="+91-9876543210"
                    />
                </div>

                <div>
                    <label className={FORM_STYLES.label}>Secondary Phone</label>
                    <Input
                        type="tel"
                        value={formData.secondary_phone || ''}
                        onChange={(e) => handleInputChange('secondary_phone', e.target.value)}
                        placeholder="+91-9876543211"
                    />
                </div>
            </div>
        </div>

        {/* Contact Person */}
        <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">Contact Person</h4>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className={FORM_STYLES.label}>Contact Person Name</label>
                    <Input
                        type="text"
                        value={formData.contact_person || ''}
                        onChange={(e) => handleInputChange('contact_person', e.target.value)}
                        placeholder="John Doe"
                    />
                </div>

                <div>
                    <label className={FORM_STYLES.label}>Contact Person Phone</label>
                    <Input
                        type="tel"
                        value={formData.contact_person_phone || ''}
                        onChange={(e) => handleInputChange('contact_person_phone', e.target.value)}
                        placeholder="+91-9876543210"
                    />
                </div>

                {extraContactPersonFields}
            </div>
        </div>

        {/* Address */}
        <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">Address</h4>
            <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                    <label className={FORM_STYLES.label}>Address Line 1</label>
                    <Input
                        type="text"
                        value={formData.address_line_1 || ''}
                        onChange={(e) => handleInputChange('address_line_1', e.target.value)}
                        placeholder="Street address"
                    />
                </div>

                <div className="col-span-2">
                    <label className={FORM_STYLES.label}>Address Line 2</label>
                    <Input
                        type="text"
                        value={formData.address_line_2 || ''}
                        onChange={(e) => handleInputChange('address_line_2', e.target.value)}
                        placeholder="Apartment, suite, etc."
                    />
                </div>

                <div>
                    <label className={FORM_STYLES.label}>City</label>
                    <Input
                        type="text"
                        value={formData.city || ''}
                        onChange={(e) => handleInputChange('city', e.target.value)}
                        placeholder="Mumbai"
                    />
                </div>

                <div>
                    <label className={FORM_STYLES.label}>State</label>
                    <Input
                        type="text"
                        value={formData.state || ''}
                        onChange={(e) => handleInputChange('state', e.target.value)}
                        placeholder="Maharashtra"
                    />
                </div>

                <div>
                    <label className={FORM_STYLES.label}>Pincode</label>
                    <Input
                        type="text"
                        value={formData.pincode || ''}
                        onChange={(e) => handleInputChange('pincode', e.target.value)}
                        placeholder="400001"
                    />
                </div>
            </div>
        </div>
    </div>
);

export default ContactAddressSection;
