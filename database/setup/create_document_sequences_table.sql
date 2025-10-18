-- Create document sequences table for atomic number generation
-- This replaces all ad-hoc document number generation with a centralized system

-- Create the table in system schema
CREATE TABLE IF NOT EXISTS system.document_sequences (
    id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL,
    document_type VARCHAR(10) NOT NULL,  -- INV, SO, PO, DC, etc.
    branch_id INTEGER,  -- NULL means organization-wide numbering
    fiscal_year VARCHAR(10) NOT NULL,  -- Format: 2024-25
    year_month VARCHAR(6) NOT NULL,  -- Format: 202412
    last_number INTEGER NOT NULL DEFAULT 0,
    last_generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraint ensures no duplicates per org/type/branch/fiscal_year/month
    CONSTRAINT unique_sequence_key UNIQUE (org_id, document_type, branch_id, fiscal_year, year_month)
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_document_sequences_org_type 
ON system.document_sequences(org_id, document_type);

CREATE INDEX IF NOT EXISTS idx_document_sequences_fiscal_year 
ON system.document_sequences(fiscal_year, year_month);

-- Add comments
COMMENT ON TABLE system.document_sequences IS 'Centralized document number sequence management for atomic generation';
COMMENT ON COLUMN system.document_sequences.org_id IS 'Organization ID for multi-tenancy';
COMMENT ON COLUMN system.document_sequences.document_type IS 'Document type code (INV, SO, PO, etc.)';
COMMENT ON COLUMN system.document_sequences.branch_id IS 'Branch ID for branch-specific numbering (NULL for org-wide)';
COMMENT ON COLUMN system.document_sequences.fiscal_year IS 'Fiscal year in format YYYY-YY (e.g., 2024-25)';
COMMENT ON COLUMN system.document_sequences.year_month IS 'Year and month in format YYYYMM for monthly sequences';
COMMENT ON COLUMN system.document_sequences.last_number IS 'Last generated sequence number for this combination';

-- Create update trigger for updated_at
CREATE OR REPLACE FUNCTION system.update_document_sequences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_document_sequences_timestamp
    BEFORE UPDATE ON system.document_sequences
    FOR EACH ROW
    EXECUTE FUNCTION system.update_document_sequences_updated_at();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON system.document_sequences TO authenticated;
GRANT USAGE ON SEQUENCE system.document_sequences_id_seq TO authenticated;