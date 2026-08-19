-- Create table to track and reserve document numbers
CREATE TABLE IF NOT EXISTS public.document_number_sequences (
    sequence_id SERIAL PRIMARY KEY,
    document_type VARCHAR(50) NOT NULL,
    org_id UUID NOT NULL,
    year_prefix VARCHAR(8) NOT NULL,
    last_sequence_number BIGINT NOT NULL DEFAULT 10000000,
    last_generated_number VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_type, org_id, year_prefix)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_document_sequences_lookup 
ON public.document_number_sequences(document_type, org_id, year_prefix);

-- Add comment
COMMENT ON TABLE public.document_number_sequences IS 'Tracks document number sequences to prevent duplicates';
