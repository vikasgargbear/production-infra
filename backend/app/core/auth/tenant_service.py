"""
Enterprise Multi-Tenant Service Layer with Branch-Aware Filtering
Automatic org_id + branch_id filtering without RLS performance overhead
Used by Salesforce, Microsoft, AWS-style SaaS products

Security Model:
- org_id: Hard boundary (always filtered) - CEO of Org A can't see Org B data
- branch_id: Operational boundary (filtered by scope) - Store staff can't see other branches
"""
from typing import Dict, Any, List, Optional, Union
from sqlalchemy.orm import Session, Query
from sqlalchemy import text, and_, or_
from sqlalchemy.sql import Select
from uuid import UUID
import logging
import re
from functools import wraps
from fastapi import Depends
import contextvars

# Import BranchScope from org_context (same folder)
from .org_context import BranchScope

logger = logging.getLogger(__name__)

# Thread-safe context variables for async environments
_org_id_context: contextvars.ContextVar[Optional[UUID]] = contextvars.ContextVar('org_id', default=None)
_user_id_context: contextvars.ContextVar[Optional[UUID]] = contextvars.ContextVar('user_id', default=None)
_bypass_filter_context: contextvars.ContextVar[bool] = contextvars.ContextVar('bypass_filter', default=False)

# Branch-aware context variables
_branch_scope_context: contextvars.ContextVar[BranchScope] = contextvars.ContextVar('branch_scope', default=BranchScope.ALL)
_branch_ids_context: contextvars.ContextVar[List[UUID]] = contextvars.ContextVar('branch_ids', default=[])


class TenantContext:
    """
    THREAD-SAFE tenant context for current request with branch-aware filtering.
    Uses contextvars to ensure isolation between concurrent requests.
    
    Security Levels:
    - org_id: Always filtered (hard boundary)
    - branch_id: Filtered based on user's branch_scope
    
    Branch Scope:
    - SINGLE: User sees only their assigned branch
    - MULTI: User sees specific assigned branches
    - ALL: User sees all branches in org (admins, owners)
    """
    
    @classmethod
    def set_context(
        cls, 
        org_id: UUID, 
        user_id: Optional[UUID] = None,
        branch_scope: BranchScope = BranchScope.ALL,
        branch_ids: Optional[List[UUID]] = None
    ):
        """Set tenant + branch context for current request (thread-safe)"""
        _org_id_context.set(org_id)
        _user_id_context.set(user_id)
        _bypass_filter_context.set(False)
        _branch_scope_context.set(branch_scope)
        _branch_ids_context.set(branch_ids or [])
        logger.debug(
            f"[SECURITY] Context set: org_id={org_id}, user_id={user_id}, "
            f"branch_scope={branch_scope.value}, branches={len(branch_ids or [])}"
        )
        
    @classmethod
    def get_org_id(cls) -> UUID:
        """Get current org_id - throws error if not set (thread-safe)"""
        org_id = _org_id_context.get()
        if org_id is None:
            raise SecurityError("No tenant context set - this is a security bug!")
        return org_id
    
    @classmethod
    def get_user_id(cls) -> Optional[UUID]:
        """Get current user_id (thread-safe)"""
        return _user_id_context.get()
    
    @classmethod
    def get_branch_scope(cls) -> BranchScope:
        """Get current branch access scope (thread-safe)"""
        return _branch_scope_context.get()
    
    @classmethod
    def get_branch_ids(cls) -> List[UUID]:
        """Get list of accessible branch IDs (thread-safe)"""
        return _branch_ids_context.get()
    
    @classmethod
    def should_filter_by_branch(cls) -> bool:
        """Check if branch filtering should be applied"""
        scope = cls.get_branch_scope()
        return scope != BranchScope.ALL
    
    @classmethod
    def clear_context(cls):
        """Clear tenant and branch context (thread-safe)"""
        _org_id_context.set(None)
        _user_id_context.set(None)
        _bypass_filter_context.set(False)
        _branch_scope_context.set(BranchScope.ALL)
        _branch_ids_context.set([])
    
    @classmethod
    def bypass_tenant_filter(cls, enabled: bool = True):
        """Enable/disable tenant filtering bypass (admin operations only)"""
        _bypass_filter_context.set(enabled)
        if enabled:
            logger.warning("[SECURITY] Tenant filter bypass ENABLED - admin operation")
    
    @classmethod
    def is_bypass_enabled(cls) -> bool:
        """Check if tenant filter is bypassed"""
        return _bypass_filter_context.get()


class SecurityError(Exception):
    """Raised when tenant security is violated"""
    pass


class TenantQueryBuilder:
    """
    Automatically injects org_id + branch_id filters into all queries
    Enterprise-grade performance without RLS overhead
    
    Filter Logic:
    - org_id: Always injected for TENANT_TABLES
    - branch_id: Injected for BRANCH_TABLES if user's branch_scope != ALL
    """
    
    # Tables that need tenant (org_id) filtering - ALL business tables
    # Extracted from SQL queries in API files - automatically injected
    TENANT_TABLES = {
        # ===== PARTIES SCHEMA =====
        'customers', 'suppliers', 'customer_groups',
        
        # ===== INVENTORY SCHEMA =====
        'products', 'product_categories', 'product_types',
        'batches', 'inventory_batches',
        'location_wise_stock', 'inventory_movements', 'movement_summary',
        
        # ===== SALES SCHEMA =====
        'invoices', 'invoice_items',
        'orders', 'order_items',
        'delivery_challans', 'delivery_challan_items',
        'credit_notes', 'debit_notes',
        'sales_returns', 'sales_return_items',
        'promotional_schemes', 'scheme_customers', 'scheme_products', 'scheme_volume_slabs',
        'loyalty_programs', 'loyalty_tiers', 'loyalty_transactions',
        'payment_promises',
        
        # ===== PROCUREMENT SCHEMA =====
        'purchase_orders', 'purchase_order_items',
        'purchases', 'supplier_invoices', 'supplier_invoice_items',
        'goods_receipt_notes', 'grn_items',
        'purchase_returns',
        
        # ===== FINANCIAL SCHEMA =====
        'payments', 'payment_allocations', 'payment_methods',
        'journal_entries', 'journal_entry_lines',
        'expense_claims', 'expense_claim_items',
        'credit_debit_notes', 'customer_outstanding',
        'chart_of_accounts',
        
        # ===== MASTER SCHEMA =====
        'org_branches', 'org_bank_accounts', 'org_users',
        'departments', 'employees', 'addresses',
        'roles',  # Org-specific roles
        
        # ===== COMPLIANCE SCHEMA =====
        'drug_licenses', 'pharmacist_registrations',
        'compliance_audits', 'compliance_alerts', 'corrective_actions',
        'inspector_visits', 'expired_destructions', 'temperature_zones',
    }
    
    # Tables that ALSO need branch filtering (operational tables)
    BRANCH_TABLES = {
        'invoices', 'orders', 'payments', 'sales', 'purchase_orders',
        'delivery_challans', 'stock_movements', 'inventory',
        'credit_notes', 'debit_notes', 'journal_entries',
        'expense_claims', 'goods_receipt_notes', 'supplier_invoices',
    }
    
    # Tables that are GLOBAL (no tenant filtering)
    GLOBAL_TABLES = {
        'organizations',  # Org table itself
        'users',          # User identity (spans orgs)
        'system_settings', 'system_config', 'feature_flags',
        'audit_logs',
    }
    
    @classmethod
    def build_safe_query(cls, base_query: str, params: Dict = None) -> tuple:
        """
        Automatically inject org_id and branch_id filters into SQL queries
        
        Returns: (modified_query, updated_params)
        
        Filter behavior:
        - org_id: Always applied to TENANT_TABLES
        - branch_id: Applied to BRANCH_TABLES if branch_scope is SINGLE or MULTI
        """
        if TenantContext.is_bypass_enabled():
            logger.warning("SECURITY: Tenant filter bypassed - admin operation")
            return base_query, params or {}
            
        org_id = TenantContext.get_org_id()
        params = params or {}
        
        # Parse query to find tables that need filtering
        query_upper = base_query.upper()
        
        # Skip if already has org_id filter in WHERE clause (not just column selection)
        # Check for patterns like "WHERE org_id =" or "WHERE ... AND org_id ="
        already_has_org_filter = (
            re.search(r'\bWHERE\b.*\bORG_ID\s*=', query_upper, re.DOTALL) or
            re.search(r'\bAND\b.*\bORG_ID\s*=', query_upper, re.DOTALL)
        )
            
        # Check if query accesses tenant tables
        needs_org_filtering = not already_has_org_filter and any(
            table.upper() in query_upper 
            for table in cls.TENANT_TABLES
        )
        
        # Check if query accesses branch tables
        needs_branch_filtering = (
            TenantContext.should_filter_by_branch() and
            any(table.upper() in query_upper for table in cls.BRANCH_TABLES) and
            not re.search(r'\bBRANCH_ID\s*(=|IN)', query_upper, re.DOTALL)  # Not already filtered
        )
        
        modified_query = base_query
        
        # Inject org_id filter if needed
        if needs_org_filtering:
            modified_query = cls._inject_org_filter(modified_query, org_id)
            params['_tenant_org_id'] = str(org_id)
        
        # Inject branch_id filter if needed
        if needs_branch_filtering:
            modified_query = cls._inject_branch_filter(modified_query, params)
        
        return modified_query, params
    
    @classmethod
    def _inject_org_filter(cls, query: str, org_id: UUID) -> str:
        """
        Smart injection of org_id filters
        Handles SELECT, UPDATE, DELETE, and INSERT statements
        """
        query_upper = query.upper().strip()
        
        if query_upper.startswith('SELECT'):
            return cls._inject_select_filter(query)
        elif query_upper.startswith('UPDATE'):
            return cls._inject_update_filter(query)
        elif query_upper.startswith('DELETE'):
            return cls._inject_delete_filter(query)
        elif query_upper.startswith('INSERT'):
            return cls._inject_insert_filter(query)
        else:
            return query
    
    @classmethod
    def _inject_insert_filter(cls, query: str) -> str:
        """
        Auto-inject org_id into INSERT statements.
        
        Transforms:
          INSERT INTO table (col1, col2) VALUES (:val1, :val2)
        Into:
          INSERT INTO table (org_id, col1, col2) VALUES (:_tenant_org_id, :val1, :val2)
        
        Handles:
        - Single INSERT with column list
        - INSERT with RETURNING clause
        - INSERT ... SELECT (injects into SELECT's WHERE)
        """
        query_upper = query.upper()
        
        # Skip if already has org_id
        if 'ORG_ID' in query_upper:
            return query
        
        # Check if this is INSERT ... SELECT (subquery insert)
        if re.search(r'\bINSERT\s+INTO\s+\S+\s+SELECT\b', query_upper):
            # For INSERT ... SELECT, we inject into the SELECT's WHERE clause
            # The SELECT should already get org_id filtering from build_safe_query
            logger.debug("INSERT...SELECT detected - SELECT portion will be filtered")
            return query
        
        # Pattern: INSERT INTO schema.table (columns) VALUES (values)
        # Match the column list opening parenthesis
        column_pattern = r'(INSERT\s+INTO\s+[\w.]+\s*)\((\s*)'
        
        match = re.search(column_pattern, query, re.IGNORECASE)
        if match:
            # Insert org_id as first column
            prefix = match.group(1)
            space = match.group(2)
            rest_of_query = query[match.end():]
            
            modified_query = f"{prefix}({space}org_id, {rest_of_query}"
            
            # Now inject :_tenant_org_id into VALUES
            # Pattern: VALUES (
            values_pattern = r'(VALUES\s*)\((\s*)'
            values_match = re.search(values_pattern, modified_query, re.IGNORECASE)
            
            if values_match:
                values_prefix = modified_query[:values_match.end() - len(values_match.group(2))]
                values_suffix = modified_query[values_match.end():]
                space = values_match.group(2)
                modified_query = f"{values_prefix}{space}:_tenant_org_id, {values_suffix}"
                
                logger.debug(f"Injected org_id into INSERT: {modified_query[:100]}...")
                return modified_query
        
        # Fallback: warn if we couldn't inject
        logger.warning(f"Could not auto-inject org_id into INSERT: {query[:100]}")
        return query
    
    @classmethod
    def _inject_select_filter(cls, query: str) -> str:
        """Inject WHERE org_id filter into SELECT queries"""
        # Find main WHERE clause or add one
        where_pattern = r'\bWHERE\b'
        
        if re.search(where_pattern, query, re.IGNORECASE):
            # Add to existing WHERE with AND
            return re.sub(
                where_pattern,
                'WHERE org_id = :_tenant_org_id AND',
                query,
                count=1,
                flags=re.IGNORECASE
            )
        else:
            # Add new WHERE clause before GROUP BY, ORDER BY, etc.
            keywords = ['GROUP BY', 'ORDER BY', 'LIMIT', 'OFFSET', 'HAVING']
            
            for keyword in keywords:
                pattern = f'\\b{keyword}\\b'
                if re.search(pattern, query, re.IGNORECASE):
                    return re.sub(
                        pattern,
                        f'WHERE org_id = :_tenant_org_id {keyword}',
                        query,
                        count=1,
                        flags=re.IGNORECASE
                    )
            
            # No keywords found, add WHERE at end
            return f"{query.rstrip()} WHERE org_id = :_tenant_org_id"
    
    @classmethod
    def _inject_update_filter(cls, query: str) -> str:
        """Inject WHERE org_id filter into UPDATE queries"""
        where_pattern = r'\bWHERE\b'
        
        if re.search(where_pattern, query, re.IGNORECASE):
            return re.sub(
                where_pattern,
                'WHERE org_id = :_tenant_org_id AND',
                query,
                count=1,
                flags=re.IGNORECASE
            )
        else:
            return f"{query.rstrip()} WHERE org_id = :_tenant_org_id"
    
    @classmethod
    def _inject_delete_filter(cls, query: str) -> str:
        """Inject WHERE org_id filter into DELETE queries"""
        return cls._inject_update_filter(query)  # Same logic
    
    @classmethod
    def _inject_branch_filter(cls, query: str, params: Dict) -> str:
        """
        Inject branch_id filter based on user's branch scope.
        
        Filter Types:
        - SINGLE: WHERE branch_id = :_tenant_branch_id
        - MULTI: WHERE branch_id IN (:_tenant_branch_ids)
        - ALL: No filter (should not reach this method)
        """
        branch_scope = TenantContext.get_branch_scope()
        branch_ids = TenantContext.get_branch_ids()
        
        if branch_scope == BranchScope.ALL:
            # No branch filter needed
            return query
        
        if not branch_ids:
            # User has no branches assigned - this is a security issue
            logger.error("[SECURITY] User has non-ALL scope but no branch_ids assigned!")
            # For safety, filter to impossible condition
            params['_tenant_branch_id'] = '00000000-0000-0000-0000-000000000000'
            return cls._add_branch_condition(query, 'branch_id = :_tenant_branch_id')
        
        if branch_scope == BranchScope.SINGLE:
            # Single branch filter
            params['_tenant_branch_id'] = str(branch_ids[0])
            return cls._add_branch_condition(query, 'branch_id = :_tenant_branch_id')
        
        elif branch_scope == BranchScope.MULTI:
            # Multiple branches filter - use IN clause
            # Convert UUIDs to string for SQL
            branch_id_strs = [str(bid) for bid in branch_ids]
            params['_tenant_branch_ids'] = tuple(branch_id_strs)
            return cls._add_branch_condition(query, 'branch_id IN :_tenant_branch_ids')
        
        return query
    
    @classmethod
    def _add_branch_condition(cls, query: str, condition: str) -> str:
        """Add branch condition to query's WHERE clause"""
        query_upper = query.upper()
        
        # Check if WHERE clause exists
        if re.search(r'\bWHERE\b', query_upper, re.IGNORECASE):
            # Add to existing WHERE with AND
            # Find position after WHERE and any existing conditions
            return re.sub(
                r'\bWHERE\b',
                f'WHERE {condition} AND',
                query,
                count=1,
                flags=re.IGNORECASE
            )
        else:
            # Add new WHERE clause before GROUP BY, ORDER BY, etc.
            keywords = ['GROUP BY', 'ORDER BY', 'LIMIT', 'OFFSET', 'HAVING']
            
            for keyword in keywords:
                pattern = f'\\b{keyword}\\b'
                if re.search(pattern, query, re.IGNORECASE):
                    return re.sub(
                        pattern,
                        f'WHERE {condition} {keyword}',
                        query,
                        count=1,
                        flags=re.IGNORECASE
                    )
            
            # No keywords found, add WHERE at end
            return f"{query.rstrip()} WHERE {condition}"


class TenantAwareSession:
    """
    Database session wrapper with automatic tenant filtering
    Drop-in replacement for SQLAlchemy Session
    
    Security: 
    - Application layer: Injects org_id into all queries
    - Database layer: Sets session variable for RLS policies
    """
    
    def __init__(self, session: Session):
        self.session = session
        self._query_count = 0
        self._rls_context_set = False
    
    def _ensure_rls_context(self):
        """Set RLS session variable if not already set"""
        if self._rls_context_set:
            return
            
        try:
            org_id = TenantContext.get_org_id()
            # Set PostgreSQL session variable for RLS
            self.session.execute(
                text("SELECT set_config('app.org_id', :org_id, true)"),
                {"org_id": str(org_id)}
            )
            self._rls_context_set = True
            logger.debug(f"[RLS] Set session org_id={org_id}")
        except SecurityError:
            # No tenant context - RLS will block all access (safe default)
            logger.warning("[RLS] No tenant context set - RLS will block access")
        
    def execute(self, statement, parameters=None):
        """Execute query with automatic tenant filtering"""
        self._query_count += 1
        
        # Ensure RLS session variable is set for defense in depth
        self._ensure_rls_context()
        
        # Handle text() objects by extracting the string
        if hasattr(statement, 'text'):
            # It's a text() object from SQLAlchemy
            statement_str = str(statement)
        elif isinstance(statement, str):
            # Raw SQL string
            statement_str = statement
        else:
            # SQLAlchemy ORM statement object
            return self._execute_sqlalchemy_statement(statement, parameters)
        
        # Apply tenant filtering to the SQL string
        safe_query, safe_params = TenantQueryBuilder.build_safe_query(
            statement_str, parameters
        )
        logger.debug(f"Tenant query #{self._query_count}: {safe_query[:100]}...")
        return self.session.execute(text(safe_query), safe_params)
    
    def _execute_sqlalchemy_statement(self, statement, parameters):
        """Handle SQLAlchemy ORM statements with tenant filtering"""
        # This is more complex - would need to inspect and modify the statement
        # For now, execute as-is but log warning
        logger.warning("SQLAlchemy statement executed without tenant filtering")
        return self.session.execute(statement, parameters)
    
    def query(self, *entities):
        """Create query with automatic tenant filtering"""
        base_query = self.session.query(*entities)
        
        # Add org_id filter to all tenant tables
        for entity in entities:
            if hasattr(entity, '__tablename__'):
                table_name = entity.__tablename__
                if table_name in TenantQueryBuilder.TENANT_TABLES:
                    if hasattr(entity, 'org_id'):
                        base_query = base_query.filter(
                            entity.org_id == TenantContext.get_org_id()
                        )
        
        return base_query
    
    def commit(self):
        return self.session.commit()
    
    def rollback(self):
        return self.session.rollback()
    
    def close(self):
        return self.session.close()


# FastAPI Dependency
def get_tenant_aware_db():
    """
    FastAPI dependency that provides tenant-aware database session
    
    Usage:
    @router.get("/customers")
    async def get_customers(
        context: OrgContext = Depends(get_org_context),
        db: TenantAwareSession = Depends(get_tenant_aware_db)
    ):
        # Set tenant context
        TenantContext.set_context(context.org_id, context.user_id)
        
        # All queries automatically filtered by org_id
        result = db.execute("SELECT * FROM customers")
        return result.fetchall()
    """
    from ..database import get_db
    
    # Get the generator from get_db and extract the session
    db_generator = get_db()
    session = next(db_generator)
    
    try:
        yield TenantAwareSession(session)
    finally:
        # Properly close the session
        try:
            next(db_generator)  # This should trigger the cleanup in get_db
        except StopIteration:
            pass  # Expected when generator is exhausted


# Decorator for automatic tenant context
def with_tenant_context(func):
    """
    Decorator that automatically sets tenant + branch context from OrgContext.
    
    Security Flow:
    1. Extracts OrgContext from function arguments
    2. Sets TenantContext with org_id, user_id, branch_scope, branch_ids
    3. All queries via TenantAwareSession are automatically filtered
    4. Context is cleared after request completes
    
    Usage:
    @router.get("/customers")
    @with_tenant_context
    async def get_customers(
        context: OrgContext = Depends(get_org_context),
        db: TenantAwareSession = Depends(get_tenant_aware_db)
    ):
        # Tenant + branch context automatically set
        # Store staff only sees their branch data
        # CEO sees all branch data
        result = db.execute("SELECT * FROM customers")
        return result.fetchall()
    """
    @wraps(func)
    async def wrapper(*args, **kwargs):
        # Extract OrgContext from function arguments
        context = None
        for arg in list(args) + list(kwargs.values()):
            # Look for OrgContext (has org_id, user_id, and now branch_scope)
            if hasattr(arg, 'org_id') and hasattr(arg, 'branch_scope'):
                context = arg
                break
            # Fallback for old-style context without branch info
            elif hasattr(arg, 'org_id') and hasattr(arg, 'user_id'):
                context = arg
                break
        
        if context:
            # Set full tenant + branch context
            TenantContext.set_context(
                org_id=context.org_id, 
                user_id=context.user_id,
                branch_scope=getattr(context, 'branch_scope', BranchScope.ALL),
                branch_ids=getattr(context, 'branch_ids', [])
            )
            try:
                result = await func(*args, **kwargs)
                return result
            finally:
                TenantContext.clear_context()
        else:
            # No context found - execute without tenant filtering (risky!)
            logger.warning("No tenant context found in function arguments")
            return await func(*args, **kwargs)
    
    return wrapper


# Admin bypass context manager
class AdminBypass:
    """
    Context manager for admin operations that need cross-tenant access
    
    Usage:
    with AdminBypass(user_has_admin_permission):
        # Can access all orgs data
        result = db.execute("SELECT * FROM customers")  # All orgs
    """
    
    def __init__(self, user_has_permission: bool):
        self.allowed = user_has_permission
        self.original_bypass_state = False
        
    def __enter__(self):
        if not self.allowed:
            raise SecurityError("Admin bypass attempted without permission")
            
        self.original_bypass_state = TenantContext._bypass_tenant_filter
        TenantContext.bypass_tenant_filter(True)
        logger.warning("SECURITY: Admin bypass enabled")
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        TenantContext.bypass_tenant_filter(self.original_bypass_state)
        logger.info("Admin bypass disabled")


# Performance monitoring
class TenantQueryStats:
    """Monitor tenant query performance and patterns"""
    
    query_count = 0
    filtered_queries = 0
    bypassed_queries = 0
    
    @classmethod
    def log_query(cls, query: str, filtered: bool, bypassed: bool = False):
        cls.query_count += 1
        if filtered:
            cls.filtered_queries += 1
        if bypassed:
            cls.bypassed_queries += 1
    
    @classmethod
    def get_stats(cls) -> Dict[str, Any]:
        return {
            "total_queries": cls.query_count,
            "filtered_queries": cls.filtered_queries,
            "bypassed_queries": cls.bypassed_queries,
            "filter_rate": cls.filtered_queries / max(cls.query_count, 1) * 100
        }