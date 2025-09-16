-- Add contact history tracking for collection management
-- This tracks all customer interactions for collection follow-ups

-- Create contact history table in CRM schema
CREATE TABLE IF NOT EXISTS crm.contact_history (
    contact_id BIGSERIAL PRIMARY KEY,
    org_id VARCHAR(50) NOT NULL,
    customer_id INTEGER NOT NULL,
    contact_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    contact_type VARCHAR(50) NOT NULL, -- phone, email, whatsapp, visit, sms, letter
    contact_method VARCHAR(50), -- incoming, outgoing
    contact_purpose VARCHAR(100), -- payment_followup, general_inquiry, complaint, etc
    contacted_by INTEGER, -- user_id who made the contact
    contact_duration INTEGER, -- in minutes, for calls
    contact_notes TEXT,
    next_followup_date DATE,
    promise_to_pay_date DATE,
    promise_amount DECIMAL(15,2),
    collection_status VARCHAR(50), -- promised, disputed, will_pay, not_responding, paid
    is_successful BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_contact_customer
        FOREIGN KEY (customer_id)
        REFERENCES parties.customers(customer_id),
    CONSTRAINT fk_contact_user
        FOREIGN KEY (contacted_by)
        REFERENCES auth.users(id)
);

-- Add indexes for performance
CREATE INDEX idx_contact_history_customer ON crm.contact_history(customer_id);
CREATE INDEX idx_contact_history_org ON crm.contact_history(org_id);
CREATE INDEX idx_contact_history_date ON crm.contact_history(contact_date DESC);
CREATE INDEX idx_contact_history_next_followup ON crm.contact_history(next_followup_date);

-- Add last_contact_date and last_contact_notes to customers table for quick access
ALTER TABLE parties.customers
ADD COLUMN IF NOT EXISTS last_contact_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS last_contact_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS last_contact_notes TEXT,
ADD COLUMN IF NOT EXISTS next_followup_date DATE,
ADD COLUMN IF NOT EXISTS collection_priority VARCHAR(20); -- high, medium, low, critical

-- Create trigger to update customer's last contact info when new contact is added
CREATE OR REPLACE FUNCTION update_customer_last_contact()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE parties.customers
    SET
        last_contact_date = NEW.contact_date,
        last_contact_type = NEW.contact_type,
        last_contact_notes = NEW.contact_notes,
        next_followup_date = NEW.next_followup_date,
        updated_at = CURRENT_TIMESTAMP
    WHERE customer_id = NEW.customer_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_customer_contact ON crm.contact_history;
CREATE TRIGGER trigger_update_customer_contact
    AFTER INSERT ON crm.contact_history
    FOR EACH ROW
    EXECUTE FUNCTION update_customer_last_contact();

-- Add sample contact types for reference
CREATE TABLE IF NOT EXISTS crm.contact_type_master (
    type_id SERIAL PRIMARY KEY,
    contact_type VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE
);

INSERT INTO crm.contact_type_master (contact_type, description) VALUES
    ('phone', 'Phone call to customer'),
    ('email', 'Email communication'),
    ('whatsapp', 'WhatsApp message'),
    ('sms', 'SMS text message'),
    ('visit', 'In-person visit'),
    ('letter', 'Physical letter sent')
ON CONFLICT (contact_type) DO NOTHING;

-- Add collection status types
CREATE TABLE IF NOT EXISTS crm.collection_status_master (
    status_id SERIAL PRIMARY KEY,
    status_code VARCHAR(50) UNIQUE NOT NULL,
    status_name VARCHAR(100),
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE
);

INSERT INTO crm.collection_status_master (status_code, status_name, description) VALUES
    ('promised', 'Promised to Pay', 'Customer has promised to make payment'),
    ('disputed', 'Disputed', 'Customer disputes the amount or invoice'),
    ('will_pay', 'Will Pay Soon', 'Customer acknowledges and will pay'),
    ('not_responding', 'Not Responding', 'Customer not answering calls/messages'),
    ('partial_paid', 'Partially Paid', 'Customer made partial payment'),
    ('paid', 'Fully Paid', 'Customer has paid in full'),
    ('legal_action', 'Legal Action', 'Moved to legal proceedings'),
    ('write_off', 'Written Off', 'Amount written off')
ON CONFLICT (status_code) DO NOTHING;

-- Grant permissions
GRANT ALL ON SCHEMA crm TO webapp_user;
GRANT ALL ON ALL TABLES IN SCHEMA crm TO webapp_user;
GRANT ALL ON ALL SEQUENCES IN SCHEMA crm TO webapp_user;

COMMENT ON TABLE crm.contact_history IS 'Tracks all customer contact interactions for collection management';
COMMENT ON COLUMN crm.contact_history.contact_type IS 'Method of contact: phone, email, whatsapp, visit, sms, letter';
COMMENT ON COLUMN crm.contact_history.collection_status IS 'Outcome of collection attempt';

-- Output success message
DO $$
BEGIN
    RAISE NOTICE '✅ Contact history tracking tables created successfully';
    RAISE NOTICE 'Companies typically track: contact date, type, notes, next followup, promises';
    RAISE NOTICE 'This enables collection teams to see full interaction history';
END $$;