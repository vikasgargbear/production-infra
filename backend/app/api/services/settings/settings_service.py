"""
Settings Service
Reusable helper to fetch org settings for enforcement in other APIs

Usage:
    from app.api.services.settings import SettingsService
    
    billing = await SettingsService.get_billing_settings(db, org_id)
    if billing.auto_round_off_invoice:
        # do round off

PERFORMANCE: Settings are cached per-org for 5 minutes to avoid repeated DB queries.
Cache is automatically invalidated when settings are updated via update endpoints.
"""
from typing import Dict, Any, Optional
from sqlalchemy import text
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

# CACHE: In-memory settings cache with TTL
# Format: { org_id: { "data": {...}, "expires_at": datetime } }
_settings_cache: Dict[str, Dict] = {}
CACHE_TTL_SECONDS = 300  # 5 minutes


def invalidate_settings_cache(org_id: str):
    """Call this when settings are updated to clear cache"""
    if org_id in _settings_cache:
        del _settings_cache[org_id]
        logger.info(f"Settings cache invalidated for org {org_id}")


class SettingsService:
    """Service to fetch and enforce settings across APIs - with caching"""
    
    @staticmethod
    def _get_cached(org_id: str, category: str) -> Optional[Dict]:
        """Get from cache if valid"""
        cache_key = f"{org_id}:{category}"
        if cache_key in _settings_cache:
            entry = _settings_cache[cache_key]
            if datetime.now() < entry["expires_at"]:
                return entry["data"]
            else:
                del _settings_cache[cache_key]  # Expired
        return None
    
    @staticmethod
    def _set_cached(org_id: str, category: str, data: Dict):
        """Store in cache with TTL"""
        cache_key = f"{org_id}:{category}"
        _settings_cache[cache_key] = {
            "data": data,
            "expires_at": datetime.now() + timedelta(seconds=CACHE_TTL_SECONDS)
        }
    
    @staticmethod
    async def get_setting(db, org_id: str, category: str, key: str, default: Any = None) -> Any:
        """Get a single setting value"""
        try:
            result = db.execute(text("""
                SELECT setting_value, setting_type
                FROM master.system_settings
                WHERE org_id = :org_id 
                AND setting_category = :category 
                AND setting_key = :key
                AND is_active = true
            """), {"org_id": org_id, "category": category, "key": key}).first()
            
            if not result:
                return default
                
            return SettingsService._parse_value(result.setting_value, result.setting_type)
        except Exception as e:
            logger.warning(f"Failed to get setting {category}.{key}: {e}")
            return default
    
    @staticmethod
    async def get_billing_settings(db, org_id: str) -> Dict[str, Any]:
        """Get all billing settings with defaults"""
        defaults = {
            "allow_billing_without_customer": False,
            "default_cash_customer_name": "Cash Customer",
            "allow_negative_stock": False,
            "enforce_batch_selection": True,
            "auto_round_off_invoice": True,
            "round_off_limit": 0.50
        }
        return await SettingsService._get_category(db, org_id, "billing", defaults)
    
    @staticmethod
    async def get_inventory_settings(db, org_id: str) -> Dict[str, Any]:
        """Get all inventory settings with defaults"""
        defaults = {
            "allow_negative_stock": False,
            "auto_fifo_selection": True,
            "track_expiry_dates": True,
            "low_stock_alert_percentage": 20.0,
            "auto_update_mrp": True,
            "enforce_barcode_scanning": False
        }
        return await SettingsService._get_category(db, org_id, "inventory", defaults)
    
    @staticmethod
    async def _get_category(db, org_id: str, category: str, defaults: Dict) -> Dict[str, Any]:
        """Get all settings for a category merged with defaults - with caching"""
        # Check cache first
        cached = SettingsService._get_cached(org_id, category)
        if cached is not None:
            return cached
        
        try:
            result = db.execute(text("""
                SELECT setting_key, setting_value, setting_type
                FROM master.system_settings
                WHERE org_id = :org_id AND setting_category = :category AND is_active = true
            """), {"org_id": org_id, "category": category})
            
            settings = dict(defaults)  # Start with defaults
            for row in result:
                settings[row.setting_key] = SettingsService._parse_value(row.setting_value, row.setting_type)
            
            # Store in cache
            SettingsService._set_cached(org_id, category, settings)
            
            return settings
        except Exception as e:
            logger.warning(f"Failed to get {category} settings: {e}")
            return defaults
    
    @staticmethod
    def _parse_value(value: str, setting_type: str) -> Any:
        """Parse setting value based on type"""
        if setting_type == "boolean":
            return str(value).lower() in ('true', '1', 'yes')
        elif setting_type == "number":
            return float(value)
        elif setting_type == "json":
            import json
            return json.loads(value)
        return value


# Sync version for non-async endpoints
class SettingsServiceSync:
    """Synchronous version for non-async code"""
    
    @staticmethod
    def get_billing_settings(db, org_id: str) -> Dict[str, Any]:
        """Get billing settings synchronously"""
        defaults = {
            "allow_billing_without_customer": False,
            "default_cash_customer_name": "Cash Customer",
            "allow_negative_stock": False,
            "enforce_batch_selection": True,
            "auto_round_off_invoice": True,
            "round_off_limit": 0.50
        }
        try:
            result = db.execute(text("""
                SELECT setting_key, setting_value, setting_type
                FROM master.system_settings
                WHERE org_id = :org_id AND setting_category = 'billing' AND is_active = true
            """), {"org_id": org_id})
            
            settings = dict(defaults)
            for row in result:
                settings[row.setting_key] = SettingsService._parse_value(row.setting_value, row.setting_type)
            return settings
        except Exception:
            return defaults
