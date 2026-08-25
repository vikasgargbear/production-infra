-- Make canonical evidence upload metadata branch-aware and replace the blanket
-- attachment immutability trigger with the reviewed upload lifecycle.

SET LOCAL ROLE erp_migration_owner;

ALTER TABLE core.attachments
    ADD COLUMN branch_id uuid;

ALTER TABLE core.attachments
    ADD CONSTRAINT attachments_branch_fk
    FOREIGN KEY (org_id,branch_id)
    REFERENCES core.branches(org_id,id)
    ON DELETE RESTRICT;

ALTER TABLE core.attachments
    DROP CONSTRAINT attachments_status_ck;
ALTER TABLE core.attachments
    ADD CONSTRAINT attachments_status_ck
    CHECK (status IN (
        'pending_upload','verified','rejected','quarantined','retained'
    ));

ALTER TABLE core.attachments
    DROP CONSTRAINT attachments_verified_ck;
ALTER TABLE core.attachments
    ADD CONSTRAINT attachments_verified_ck
    CHECK (
        (status IN ('verified','retained'))=(verified_at IS NOT NULL)
    );

ALTER TABLE core.attachments
    ADD CONSTRAINT attachments_private_evidence_shape_ck
    CHECK (
        storage_bucket<>'canonical-evidence-private-v1'
        OR (
            branch_id IS NOT NULL
            AND evidence_kind='expense_receipt'
            AND media_type='application/pdf'
            AND document_date IS NOT NULL
            AND retention_until IS NOT NULL
            AND retention_until>=document_date
            AND storage_object_path=(
                org_id::text || '/' || branch_id::text || '/' || evidence_kind
                || '/' || pg_catalog.encode(sha256,'hex') || '.pdf'
            )
        )
    );

DROP INDEX core.attachments_hash_uq;
CREATE UNIQUE INDEX attachments_org_hash_uq
    ON core.attachments(org_id,sha256,byte_size)
    WHERE branch_id IS NULL AND status IN ('verified','retained');
CREATE UNIQUE INDEX attachments_branch_hash_uq
    ON core.attachments(org_id,branch_id,sha256,byte_size)
    WHERE branch_id IS NOT NULL AND status IN ('verified','retained');
CREATE INDEX attachments_branch_kind_date_idx
    ON core.attachments(org_id,branch_id,evidence_kind,document_date,id)
    WHERE branch_id IS NOT NULL AND status IN ('verified','retained');

DROP TRIGGER core_attachments_immutable_trg ON core.attachments;
DROP TRIGGER attachments_evidence_guard_ct ON core.attachments;

CREATE OR REPLACE FUNCTION erp_stable_invariants.guard_attachment_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=''
AS $function$
BEGIN
    IF TG_OP='DELETE' THEN
        IF OLD.legal_hold OR OLD.status IN ('verified','retained') THEN
            RAISE EXCEPTION USING ERRCODE='23514',
                MESSAGE='verified, retained, or held attachment evidence cannot be deleted';
        END IF;
        RETURN OLD;
    END IF;

    IF ROW(
        NEW.org_id,NEW.branch_id,NEW.id,NEW.storage_bucket,
        NEW.storage_object_path,NEW.original_filename,NEW.media_type,
        NEW.byte_size,NEW.sha256,NEW.evidence_kind,NEW.document_date,
        NEW.created_at,NEW.created_by_membership_id
    ) IS DISTINCT FROM ROW(
        OLD.org_id,OLD.branch_id,OLD.id,OLD.storage_bucket,
        OLD.storage_object_path,OLD.original_filename,OLD.media_type,
        OLD.byte_size,OLD.sha256,OLD.evidence_kind,OLD.document_date,
        OLD.created_at,OLD.created_by_membership_id
    ) THEN
        RAISE EXCEPTION USING ERRCODE='23514',
            MESSAGE='attachment evidence identity is immutable';
    END IF;

    IF OLD.legal_hold AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION USING ERRCODE='23514',
            MESSAGE='attachment under legal hold is immutable';
    END IF;
    IF NOT OLD.legal_hold AND NEW.legal_hold AND (
        NEW.status IS DISTINCT FROM OLD.status
        OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
        OR NEW.retention_until IS DISTINCT FROM OLD.retention_until
    ) THEN
        RAISE EXCEPTION USING ERRCODE='23514',
            MESSAGE='legal hold must be applied independently of lifecycle changes';
    END IF;
    IF OLD.legal_hold AND NOT NEW.legal_hold THEN
        RAISE EXCEPTION USING ERRCODE='23514',
            MESSAGE='legal hold release requires a future reviewed command';
    END IF;
    IF NEW.retention_until IS DISTINCT FROM OLD.retention_until AND (
        OLD.retention_until IS NULL
        OR NEW.retention_until IS NULL
        OR NEW.retention_until<OLD.retention_until
    ) THEN
        RAISE EXCEPTION USING ERRCODE='23514',
            MESSAGE='attachment retention may only be extended';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
        (OLD.status='pending_upload' AND NEW.status IN ('verified','rejected'))
        OR (OLD.status='verified' AND NEW.status='retained')
    ) THEN
        RAISE EXCEPTION USING ERRCODE='23514',
            MESSAGE='invalid attachment evidence lifecycle transition';
    END IF;
    IF OLD.status='pending_upload' AND NEW.status='verified' AND (
        OLD.verified_at IS NOT NULL
        OR NEW.verified_at IS NULL
        OR NEW.verified_at>pg_catalog.transaction_timestamp()
    ) THEN
        RAISE EXCEPTION USING ERRCODE='23514',
            MESSAGE='verified attachment requires a current server verification time';
    END IF;
    IF NEW.status='rejected' AND NEW.verified_at IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE='23514',
            MESSAGE='rejected attachment cannot carry verification evidence';
    END IF;
    RETURN NEW;
END
$function$;
ALTER FUNCTION erp_stable_invariants.guard_attachment_evidence()
    OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_stable_invariants.guard_attachment_evidence()
    FROM PUBLIC,erp_app,erp_runtime;
CREATE TRIGGER attachments_evidence_guard
    BEFORE UPDATE OR DELETE ON core.attachments
    FOR EACH ROW EXECUTE FUNCTION erp_stable_invariants.guard_attachment_evidence();

DROP POLICY erp_select ON core.attachments;
DROP POLICY erp_insert ON core.attachments;
DROP POLICY erp_update ON core.attachments;

CREATE POLICY erp_select ON core.attachments FOR SELECT TO erp_app
    USING (
        org_id=erp_security.current_org_id()
        AND erp_security.current_actor_is_active()
        AND (branch_id IS NULL OR erp_security.can_access_branch(branch_id))
    );
CREATE POLICY erp_insert ON core.attachments FOR INSERT TO erp_app
    WITH CHECK (
        org_id=erp_security.current_org_id()
        AND branch_id IS NOT NULL
        AND erp_security.current_actor_is_active()
        AND erp_security.can_access_branch(branch_id)
        AND erp_security.has_permission('core.attachment.manage',branch_id)
    );
CREATE POLICY erp_update ON core.attachments FOR UPDATE TO erp_app
    USING (
        org_id=erp_security.current_org_id()
        AND branch_id IS NOT NULL
        AND erp_security.current_actor_is_active()
        AND erp_security.can_access_branch(branch_id)
        AND erp_security.has_permission('core.attachment.manage',branch_id)
    )
    WITH CHECK (
        org_id=erp_security.current_org_id()
        AND branch_id IS NOT NULL
        AND erp_security.current_actor_is_active()
        AND erp_security.can_access_branch(branch_id)
        AND erp_security.has_permission('core.attachment.manage',branch_id)
    );

COMMENT ON COLUMN core.attachments.branch_id IS
    'Canonical operational branch owning access to uploaded evidence; NULL remains valid only for pre-existing organization-level reference evidence.';

RESET ROLE;
