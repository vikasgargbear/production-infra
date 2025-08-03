#!/usr/bin/env python3
"""
Disable problematic KPI trigger that's blocking invoice creation
This is a temporary fix until we can properly create the missing analytics.kpi_actuals table
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from app.core.database import engine
    from sqlalchemy import text
    
    def disable_kpi_triggers():
        """Disable KPI-related triggers that are causing invoice creation to fail"""
        
        # List of potential problematic triggers
        triggers_to_disable = [
            "calculate_realtime_kpis",
            "update_kpi_actuals", 
            "refresh_kpi_cache",
            "kpi_trigger"
        ]
        
        try:
            with engine.connect() as conn:
                success_count = 0
                
                # Try to disable each trigger (they may not all exist)
                for trigger_name in triggers_to_disable:
                    try:
                        # Try disabling on sales.invoices table
                        conn.execute(text(f"ALTER TABLE sales.invoices DISABLE TRIGGER IF EXISTS {trigger_name}"))
                        print(f"✅ Disabled trigger: {trigger_name} on sales.invoices")
                        success_count += 1
                    except Exception as e:
                        # Trigger might not exist, which is fine
                        if "does not exist" in str(e):
                            print(f"ℹ️ Trigger {trigger_name} does not exist (OK)")
                        else:
                            print(f"⚠️ Could not disable {trigger_name}: {str(e)}")
                
                # Commit the changes
                conn.commit()
                
                if success_count > 0:
                    print(f"✅ Successfully disabled {success_count} triggers")
                else:
                    print("ℹ️ No KPI triggers found to disable")
                
                return True
                
        except Exception as e:
            print(f"❌ Error disabling triggers: {str(e)}")
            return False
    
    if __name__ == "__main__":
        print("🔧 Disabling problematic KPI triggers...")
        success = disable_kpi_triggers()
        sys.exit(0 if success else 1)
        
except ImportError as e:
    print(f"❌ Cannot import database connection: {str(e)}")
    print("ℹ️ This script needs to run in the backend environment")
    sys.exit(1)