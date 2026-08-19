"""
Audit Trail API
Query audit logs for admin users
"""
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
import logging

from ....core.auth.tenant_service import get_tenant_aware_db, TenantAwareSession, with_tenant_context
from ....core.auth.org_context import get_org_context, OrgContext
from ....core.security.permissions import PermissionChecker

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/audit-logs", tags=["Audit Trail"])


@router.get("/summary")
@with_tenant_context
async def get_audit_summary(
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    current_user: Dict[str, Any] = Depends(PermissionChecker(require_admin=True)),
    context: OrgContext = Depends(get_org_context),
):
    """Get aggregated audit stats for the last 30 days"""
    try:
        org_id = current_user.get('org_id')

        # Counts by activity type
        by_activity = db.execute(
            text("""
                SELECT activity_type, COUNT(*) as count
                FROM system_config.audit_logs
                WHERE org_id = :org_id
                  AND activity_timestamp >= NOW() - INTERVAL '30 days'
                GROUP BY activity_type
                ORDER BY count DESC
            """),
            {"org_id": org_id}
        )

        # Counts by entity type
        by_entity = db.execute(
            text("""
                SELECT entity_type, COUNT(*) as count
                FROM system_config.audit_logs
                WHERE org_id = :org_id
                  AND activity_timestamp >= NOW() - INTERVAL '30 days'
                GROUP BY entity_type
                ORDER BY count DESC
            """),
            {"org_id": org_id}
        )

        # Counts by user (top 10)
        by_user = db.execute(
            text("""
                SELECT user_id, user_name, COUNT(*) as count
                FROM system_config.audit_logs
                WHERE org_id = :org_id
                  AND activity_timestamp >= NOW() - INTERVAL '30 days'
                GROUP BY user_id, user_name
                ORDER BY count DESC
                LIMIT 10
            """),
            {"org_id": org_id}
        )

        # Total actions and failed logins
        totals = db.execute(
            text("""
                SELECT
                    COUNT(*) as total_actions,
                    COUNT(DISTINCT user_id) as active_users,
                    COUNT(*) FILTER (WHERE activity_type IN ('delete', 'update') AND entity_type IN ('user', 'role')) as critical_changes,
                    COUNT(*) FILTER (WHERE activity_type = 'login' AND result_status = 'failure') as failed_logins
                FROM system_config.audit_logs
                WHERE org_id = :org_id
                  AND activity_timestamp >= NOW() - INTERVAL '30 days'
            """),
            {"org_id": org_id}
        ).first()

        return {
            "total_actions": totals.total_actions if totals else 0,
            "active_users": totals.active_users if totals else 0,
            "critical_changes": totals.critical_changes if totals else 0,
            "failed_logins": totals.failed_logins if totals else 0,
            "by_activity_type": [dict(r._mapping) for r in by_activity],
            "by_entity_type": [dict(r._mapping) for r in by_entity],
            "by_user": [dict(r._mapping) for r in by_user],
        }

    except Exception as e:
        logger.error(f"Error fetching audit summary: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch audit summary: {str(e)}")


@router.get("/")
@with_tenant_context
async def get_audit_logs(
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    user_id: Optional[int] = Query(None, description="Filter by user ID"),
    entity_type: Optional[str] = Query(None, description="Filter by entity type"),
    activity_type: Optional[str] = Query(None, description="Filter by activity type"),
    entity_id: Optional[str] = Query(None, description="Filter by entity ID"),
    search: Optional[str] = Query(None, description="Search in action_performed or entity_name"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    current_user: Dict[str, Any] = Depends(PermissionChecker(require_admin=True)),
    context: OrgContext = Depends(get_org_context),
):
    """List audit logs with filters and pagination"""
    try:
        org_id = current_user.get('org_id')
        offset = (page - 1) * limit

        where_clauses = ["a.org_id = :org_id"]
        params: dict = {"org_id": org_id, "limit": limit, "offset": offset}

        if start_date:
            where_clauses.append("a.activity_timestamp >= :start_date::timestamptz")
            params["start_date"] = start_date
        if end_date:
            where_clauses.append("a.activity_timestamp < (:end_date::date + INTERVAL '1 day')")
            params["end_date"] = end_date
        if user_id:
            where_clauses.append("a.user_id = :filter_user_id")
            params["filter_user_id"] = user_id
        if entity_type:
            where_clauses.append("a.entity_type = :entity_type")
            params["entity_type"] = entity_type
        if activity_type:
            where_clauses.append("a.activity_type = :activity_type")
            params["activity_type"] = activity_type
        if entity_id:
            where_clauses.append("a.entity_id = :entity_id")
            params["entity_id"] = entity_id
        if search:
            where_clauses.append(
                "(LOWER(a.action_performed) LIKE LOWER(:search) OR LOWER(a.entity_name) LIKE LOWER(:search))"
            )
            params["search"] = f"%{search}%"

        where_sql = " AND ".join(where_clauses)

        # Get total count
        count_result = db.execute(
            text(f"SELECT COUNT(*) as total FROM system_config.audit_logs a WHERE {where_sql}"),
            params
        ).first()
        total = count_result.total if count_result else 0

        # Get paginated results with user full_name
        rows = db.execute(
            text(f"""
                SELECT
                    a.audit_id,
                    a.activity_timestamp,
                    a.activity_type,
                    a.entity_type,
                    a.entity_id,
                    a.entity_name,
                    a.action_performed,
                    a.user_id,
                    a.user_name,
                    COALESCE(u.full_name, a.user_name) as full_name,
                    a.result_status,
                    a.ip_address,
                    a.module_name
                FROM system_config.audit_logs a
                LEFT JOIN master.org_users u ON a.user_id = u.user_id
                WHERE {where_sql}
                ORDER BY a.activity_timestamp DESC
                LIMIT :limit OFFSET :offset
            """),
            params
        )

        data = []
        for row in rows:
            item = dict(row._mapping)
            # Convert ip_address to string for JSON serialization
            if item.get('ip_address'):
                item['ip_address'] = str(item['ip_address'])
            data.append(item)

        return {
            "data": data,
            "total": total,
            "page": page,
            "limit": limit,
        }

    except Exception as e:
        logger.error(f"Error fetching audit logs: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch audit logs: {str(e)}")


@router.get("/{audit_id}")
@with_tenant_context
async def get_audit_log_detail(
    audit_id: int,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    current_user: Dict[str, Any] = Depends(PermissionChecker(require_admin=True)),
    context: OrgContext = Depends(get_org_context),
):
    """Get full detail of a single audit log entry"""
    try:
        org_id = current_user.get('org_id')

        result = db.execute(
            text("""
                SELECT
                    a.*,
                    COALESCE(u.full_name, a.user_name) as full_name
                FROM system_config.audit_logs a
                LEFT JOIN master.org_users u ON a.user_id = u.user_id
                WHERE a.audit_id = :audit_id AND a.org_id = :org_id
            """),
            {"audit_id": audit_id, "org_id": org_id}
        )

        row = result.first()
        if not row:
            raise HTTPException(status_code=404, detail="Audit log entry not found")

        item = dict(row._mapping)
        if item.get('ip_address'):
            item['ip_address'] = str(item['ip_address'])
        return item

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching audit log {audit_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch audit log: {str(e)}")
