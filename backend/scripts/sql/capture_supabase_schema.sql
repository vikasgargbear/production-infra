BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '120s';
SET LOCAL lock_timeout = '5s';

WITH selected_schemas AS (
    SELECT unnest(ARRAY[
        'public', 'auth', 'master', 'parties', 'inventory', 'sales',
        'procurement', 'financial', 'gst', 'compliance', 'analytics',
        'system_config', 'payroll', 'supabase_migrations'
    ]) AS schema_name
),
tables AS (
    SELECT jsonb_agg(to_jsonb(t) ORDER BY t.table_schema, t.table_name) AS value
    FROM (
        SELECT
            n.nspname AS table_schema,
            c.relname AS table_name,
            CASE c.relkind
                WHEN 'r' THEN 'table'
                WHEN 'p' THEN 'partitioned_table'
                WHEN 'v' THEN 'view'
                WHEN 'm' THEN 'materialized_view'
                WHEN 'f' THEN 'foreign_table'
            END AS relation_type,
            c.relrowsecurity AS row_security_enabled,
            c.relforcerowsecurity AS row_security_forced,
            pg_catalog.pg_get_userbyid(c.relowner) AS owner
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        JOIN selected_schemas s ON s.schema_name = n.nspname
        WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
    ) t
),
columns AS (
    SELECT jsonb_agg(to_jsonb(c) ORDER BY c.table_schema, c.table_name, c.ordinal_position) AS value
    FROM (
        SELECT
            cols.table_schema,
            cols.table_name,
            cols.ordinal_position,
            cols.column_name,
            cols.data_type,
            cols.udt_schema,
            cols.udt_name,
            cols.is_nullable,
            cols.column_default,
            cols.is_identity,
            cols.identity_generation,
            cols.is_generated,
            cols.generation_expression
        FROM information_schema.columns cols
        JOIN selected_schemas s ON s.schema_name = cols.table_schema
    ) c
),
constraints AS (
    SELECT jsonb_agg(to_jsonb(k) ORDER BY k.table_schema, k.table_name, k.constraint_name) AS value
    FROM (
        SELECT
            n.nspname AS table_schema,
            c.relname AS table_name,
            con.conname AS constraint_name,
            con.contype AS constraint_type,
            pg_catalog.pg_get_constraintdef(con.oid, true) AS definition
        FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        JOIN selected_schemas s ON s.schema_name = n.nspname
    ) k
),
indexes AS (
    SELECT jsonb_agg(to_jsonb(i) ORDER BY i.schemaname, i.tablename, i.indexname) AS value
    FROM (
        SELECT schemaname, tablename, indexname, indexdef
        FROM pg_catalog.pg_indexes
        WHERE schemaname IN (SELECT schema_name FROM selected_schemas)
    ) i
),
policies AS (
    SELECT jsonb_agg(to_jsonb(p) ORDER BY p.schemaname, p.tablename, p.policyname) AS value
    FROM (
        SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
        FROM pg_catalog.pg_policies
        WHERE schemaname IN (SELECT schema_name FROM selected_schemas)
    ) p
),
triggers AS (
    SELECT jsonb_agg(to_jsonb(t) ORDER BY t.trigger_schema, t.table_name, t.trigger_name) AS value
    FROM (
        SELECT
            n.nspname AS trigger_schema,
            c.relname AS table_name,
            tg.tgname AS trigger_name,
            tg.tgenabled AS enabled_state,
            pg_catalog.pg_get_triggerdef(tg.oid, true) AS definition
        FROM pg_catalog.pg_trigger tg
        JOIN pg_catalog.pg_class c ON c.oid = tg.tgrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        JOIN selected_schemas s ON s.schema_name = n.nspname
        WHERE NOT tg.tgisinternal
    ) t
),
functions AS (
    SELECT jsonb_agg(to_jsonb(f) ORDER BY f.function_schema, f.function_name, f.identity_arguments) AS value
    FROM (
        SELECT
            n.nspname AS function_schema,
            p.proname AS function_name,
            pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
            pg_catalog.pg_get_function_result(p.oid) AS result_type,
            l.lanname AS language,
            p.prosecdef AS security_definer,
            p.provolatile AS volatility,
            pg_catalog.pg_get_functiondef(p.oid) AS definition
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        JOIN pg_catalog.pg_language l ON l.oid = p.prolang
        JOIN selected_schemas s ON s.schema_name = n.nspname
        WHERE p.prokind = 'f'
    ) f
),
enums AS (
    SELECT jsonb_agg(to_jsonb(e) ORDER BY e.enum_schema, e.enum_name, e.sort_order) AS value
    FROM (
        SELECT
            n.nspname AS enum_schema,
            t.typname AS enum_name,
            en.enumsortorder AS sort_order,
            en.enumlabel AS enum_value
        FROM pg_catalog.pg_enum en
        JOIN pg_catalog.pg_type t ON t.oid = en.enumtypid
        JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
        JOIN selected_schemas s ON s.schema_name = n.nspname
    ) e
),
table_grants AS (
    SELECT jsonb_agg(to_jsonb(g) ORDER BY g.table_schema, g.table_name, g.grantee, g.privilege_type) AS value
    FROM (
        SELECT grantor, grantee, table_schema, table_name, privilege_type, is_grantable
        FROM information_schema.role_table_grants
        WHERE table_schema IN (SELECT schema_name FROM selected_schemas)
    ) g
),
routine_grants AS (
    SELECT jsonb_agg(to_jsonb(g) ORDER BY g.routine_schema, g.routine_name, g.grantee, g.privilege_type) AS value
    FROM (
        SELECT grantor, grantee, routine_schema, routine_name, privilege_type, is_grantable
        FROM information_schema.role_routine_grants
        WHERE routine_schema IN (SELECT schema_name FROM selected_schemas)
    ) g
),
migration_history AS (
    SELECT jsonb_agg(to_jsonb(m) ORDER BY to_jsonb(m)->>'version') AS value
    FROM supabase_migrations.schema_migrations m
)
SELECT jsonb_build_object(
    'capture_format_version', 1,
    'captured_at', pg_catalog.clock_timestamp(),
    'database_name', pg_catalog.current_database(),
    'server_version', pg_catalog.current_setting('server_version'),
    'transaction_read_only', pg_catalog.current_setting('transaction_read_only'),
    'schemas', (SELECT jsonb_agg(schema_name ORDER BY schema_name) FROM selected_schemas),
    'tables', COALESCE((SELECT value FROM tables), '[]'::jsonb),
    'columns', COALESCE((SELECT value FROM columns), '[]'::jsonb),
    'constraints', COALESCE((SELECT value FROM constraints), '[]'::jsonb),
    'indexes', COALESCE((SELECT value FROM indexes), '[]'::jsonb),
    'policies', COALESCE((SELECT value FROM policies), '[]'::jsonb),
    'triggers', COALESCE((SELECT value FROM triggers), '[]'::jsonb),
    'functions', COALESCE((SELECT value FROM functions), '[]'::jsonb),
    'enums', COALESCE((SELECT value FROM enums), '[]'::jsonb),
    'table_grants', COALESCE((SELECT value FROM table_grants), '[]'::jsonb),
    'routine_grants', COALESCE((SELECT value FROM routine_grants), '[]'::jsonb),
    'migration_history', COALESCE((SELECT value FROM migration_history), '[]'::jsonb)
);

COMMIT;
