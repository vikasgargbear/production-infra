-- Create a simple configuration table for controlling features
CREATE TABLE IF NOT EXISTS system_config.feature_flags (
    feature_name VARCHAR(100) PRIMARY KEY,
    is_enabled BOOLEAN DEFAULT true,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert notification flag
INSERT INTO system_config.feature_flags (feature_name, is_enabled, description)
VALUES ('system_notifications', false, 'Controls whether system notifications are created')
ON CONFLICT (feature_name) DO UPDATE SET
    is_enabled = false,
    updated_at = CURRENT_TIMESTAMP;

-- Create a helper function to check if a feature is enabled
CREATE OR REPLACE FUNCTION system_config.is_feature_enabled(feature_name TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    enabled BOOLEAN;
BEGIN
    SELECT is_enabled INTO enabled
    FROM system_config.feature_flags
    WHERE feature_name = feature_name;

    -- Default to false if not found
    RETURN COALESCE(enabled, false);
END;
$$ LANGUAGE plpgsql;

-- Now update all notification functions to check this flag
CREATE OR REPLACE FUNCTION public.create_notification_if_enabled(
    p_org_id UUID,
    p_type VARCHAR(50),
    p_category VARCHAR(100),
    p_title TEXT,
    p_message TEXT,
    p_priority VARCHAR(20) DEFAULT 'medium',
    p_target_audience VARCHAR(100) DEFAULT 'all',
    p_data JSONB DEFAULT '{}'::JSONB
) RETURNS VOID AS $$
BEGIN
    -- Only create notification if feature is enabled
    IF system_config.is_feature_enabled('system_notifications') THEN
        INSERT INTO system_config.system_notifications (
            org_id, notification_type, notification_category,
            title, message, priority, target_audience,
            notification_data, created_at, created_by
        ) VALUES (
            p_org_id, p_type, p_category,
            p_title, p_message, p_priority,
            COALESCE(p_target_audience, 'all'),
            p_data, NOW(), 1
        );
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.create_notification_if_enabled IS
'Creates notifications only if system_notifications feature flag is enabled';

-- To enable/disable notifications, simply run:
-- UPDATE system_config.feature_flags SET is_enabled = true WHERE feature_name = 'system_notifications';
-- UPDATE system_config.feature_flags SET is_enabled = false WHERE feature_name = 'system_notifications';

DO $$
BEGIN
    RAISE NOTICE '✅ Created feature flags table with notifications disabled';
    RAISE NOTICE 'To enable: UPDATE system_config.feature_flags SET is_enabled = true WHERE feature_name = ''system_notifications'';';
END $$;