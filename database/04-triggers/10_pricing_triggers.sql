-- =============================================
-- PRICING AND MRP MANAGEMENT TRIGGERS
-- =============================================
-- Schema: inventory, procurement, sales
-- MRP validation, price history, and margin protection
-- =============================================

-- =============================================
-- 1. MRP DECREASE PREVENTION
-- =============================================
CREATE OR REPLACE FUNCTION prevent_mrp_decrease()
RETURNS TRIGGER AS $$
DECLARE
    v_existing_mrp NUMERIC;
    v_product_name TEXT;
    v_last_purchase RECORD;
    v_price_history JSONB;
BEGIN
    -- Get product details
    SELECT 
        product_name,
        current_mrp
    INTO v_product_name, v_existing_mrp
    FROM inventory.products
    WHERE product_id = NEW.product_id;
    
    -- For GRN items, check MRP
    IF TG_TABLE_NAME = 'grn_items' THEN
        -- Get last purchase MRP for this product
        SELECT 
            MAX(mrp) as highest_mrp,
            jsonb_agg(
                jsonb_build_object(
                    'date', g.grn_date,
                    'supplier', s.supplier_name,
                    'mrp', gi.mrp,
                    'batch', gi.batch_number
                ) ORDER BY g.grn_date DESC
            ) as price_history
        INTO v_last_purchase
        FROM procurement.grn_items gi
        JOIN procurement.goods_receipt_notes g ON gi.grn_id = g.grn_id
        JOIN parties.suppliers s ON g.supplier_id = s.supplier_id
        WHERE gi.product_id = NEW.product_id
        AND gi.grn_item_id != COALESCE(NEW.grn_item_id, -1)
        AND g.grn_status = 'approved';
        
        -- Check if MRP is decreasing
        IF v_last_purchase.highest_mrp IS NOT NULL AND 
           NEW.mrp < v_last_purchase.highest_mrp THEN
            
            -- Check if decrease is significant (more than 1%)
            IF ((v_last_purchase.highest_mrp - NEW.mrp) / v_last_purchase.highest_mrp * 100) > 1 THEN
                -- Create alert
                INSERT INTO system_config.system_notifications (
                    org_id,
                    notification_type,
                    notification_category,
                    title,
                    message,
                    priority,
                    requires_acknowledgment,
                    notification_data
                ) VALUES (
                    (SELECT org_id FROM procurement.goods_receipt_notes WHERE grn_id = NEW.grn_id),
                    'warning',
                    'pricing',
                    'MRP Decrease Alert',
                    format('MRP for %s is decreasing from ₹%s to ₹%s (-%s%%). This requires approval.',
                        v_product_name,
                        v_last_purchase.highest_mrp,
                        NEW.mrp,
                        ROUND((v_last_purchase.highest_mrp - NEW.mrp) / v_last_purchase.highest_mrp * 100, 1)),
                    'high',
                    TRUE,
                    jsonb_build_object(
                        'product_id', NEW.product_id,
                        'product_name', v_product_name,
                        'old_mrp', v_last_purchase.highest_mrp,
                        'new_mrp', NEW.mrp,
                        'decrease_percent', ROUND((v_last_purchase.highest_mrp - NEW.mrp) / v_last_purchase.highest_mrp * 100, 1),
                        'grn_id', NEW.grn_id,
                        'recent_history', v_last_purchase.price_history
                    )
                );
                
                -- Require approval for significant decrease
                IF ((v_last_purchase.highest_mrp - NEW.mrp) / v_last_purchase.highest_mrp * 100) > 5 THEN
                    NEW.requires_price_approval := TRUE;
                    NEW.price_approval_reason := format('MRP decrease by %s%% requires approval',
                        ROUND((v_last_purchase.highest_mrp - NEW.mrp) / v_last_purchase.highest_mrp * 100, 1));
                END IF;
            END IF;
        END IF;
        
        -- Update product MRP if higher
        IF NEW.mrp > COALESCE(v_existing_mrp, 0) THEN
            UPDATE inventory.products
            SET 
                current_mrp = NEW.mrp,
                mrp_last_updated = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE product_id = NEW.product_id;
        END IF;
        
    -- For batches, validate MRP consistency
    ELSIF TG_TABLE_NAME = 'batches' THEN
        -- Check against product MRP
        IF v_existing_mrp IS NOT NULL AND NEW.mrp_per_unit < v_existing_mrp THEN
            -- Allow only if there's a valid reason
            IF NEW.mrp_change_reason IS NULL THEN
                RAISE EXCEPTION 'MRP cannot be less than product MRP (₹%). Please provide a valid reason.',
                    v_existing_mrp;
            END IF;
            
            -- Log MRP change
            INSERT INTO inventory.price_change_log (
                org_id,
                product_id,
                batch_id,
                change_type,
                old_value,
                new_value,
                change_reason,
                changed_by,
                requires_approval
            ) VALUES (
                NEW.org_id,
                NEW.product_id,
                NEW.batch_id,
                'mrp_decrease',
                v_existing_mrp,
                NEW.mrp_per_unit,
                NEW.mrp_change_reason,
                NEW.created_by,
                TRUE
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prevent_mrp_decrease_grn
    BEFORE INSERT OR UPDATE OF mrp ON procurement.grn_items
    FOR EACH ROW
    EXECUTE FUNCTION prevent_mrp_decrease();

CREATE TRIGGER trigger_prevent_mrp_decrease_batch
    BEFORE INSERT OR UPDATE OF mrp_per_unit ON inventory.batches
    FOR EACH ROW
    EXECUTE FUNCTION prevent_mrp_decrease();

-- =============================================
-- 2. PURCHASE PRICE TREND ANALYSIS
-- =============================================
CREATE OR REPLACE FUNCTION analyze_purchase_price_trend()
RETURNS TRIGGER AS $$
DECLARE
    v_price_stats RECORD;
    v_price_increase NUMERIC;
    v_margin_impact NUMERIC;
    v_suggested_ptr NUMERIC;
BEGIN
    -- Calculate price statistics for last 6 months
    SELECT 
        AVG(unit_price) as avg_price,
        STDDEV(unit_price) as price_volatility,
        MIN(unit_price) as min_price,
        MAX(unit_price) as max_price,
        COUNT(*) as purchase_count,
        AVG(mrp) as avg_mrp,
        AVG(ptr) as avg_ptr
    INTO v_price_stats
    FROM procurement.grn_items gi
    JOIN procurement.goods_receipt_notes g ON gi.grn_id = g.grn_id
    WHERE gi.product_id = NEW.product_id
    AND g.grn_date >= CURRENT_DATE - INTERVAL '6 months'
    AND g.grn_status = 'approved';
    
    -- Check for significant price increase
    IF v_price_stats.avg_price IS NOT NULL THEN
        v_price_increase := ((NEW.unit_price - v_price_stats.avg_price) / v_price_stats.avg_price) * 100;
        
        -- Alert on unusual price increase
        IF v_price_increase > 10 THEN
            -- Calculate margin impact
            v_margin_impact := ((NEW.unit_price - v_price_stats.avg_price) / NEW.mrp) * 100;
            
            -- Create price alert
            INSERT INTO inventory.price_alerts (
                org_id,
                product_id,
                alert_type,
                alert_severity,
                current_price,
                average_price,
                price_change_percent,
                margin_impact_percent,
                alert_message,
                created_at
            ) VALUES (
                (SELECT org_id FROM procurement.goods_receipt_notes WHERE grn_id = NEW.grn_id),
                NEW.product_id,
                'purchase_price_increase',
                CASE 
                    WHEN v_price_increase > 20 THEN 'high'
                    ELSE 'medium'
                END,
                NEW.unit_price,
                v_price_stats.avg_price,
                v_price_increase,
                v_margin_impact,
                format('Purchase price increased by %s%% (₹%s to ₹%s). Average price: ₹%s',
                    ROUND(v_price_increase, 1),
                    v_price_stats.avg_price,
                    NEW.unit_price,
                    v_price_stats.avg_price),
                CURRENT_TIMESTAMP
            );
            
            -- Suggest PTR adjustment if needed
            IF NEW.ptr IS NOT NULL AND v_margin_impact > 5 THEN
                v_suggested_ptr := NEW.unit_price * 1.10; -- 10% markup
                
                IF v_suggested_ptr > NEW.ptr THEN
                    NEW.suggested_ptr := v_suggested_ptr;
                    NEW.ptr_suggestion_reason := format('Purchase price increased by %s%%. Consider adjusting PTR.',
                        ROUND(v_price_increase, 1));
                END IF;
            END IF;
        END IF;
        
        -- Check for price volatility
        IF v_price_stats.price_volatility > (v_price_stats.avg_price * 0.15) THEN
            -- High volatility alert
            INSERT INTO inventory.price_alerts (
                org_id,
                product_id,
                alert_type,
                alert_severity,
                current_price,
                average_price,
                price_volatility,
                alert_message,
                created_at
            ) VALUES (
                (SELECT org_id FROM procurement.goods_receipt_notes WHERE grn_id = NEW.grn_id),
                NEW.product_id,
                'high_price_volatility',
                'medium',
                NEW.unit_price,
                v_price_stats.avg_price,
                v_price_stats.price_volatility,
                format('High price volatility detected. Range: ₹%s - ₹%s (Std Dev: ₹%s)',
                    v_price_stats.min_price,
                    v_price_stats.max_price,
                    ROUND(v_price_stats.price_volatility, 2)),
                CURRENT_TIMESTAMP
            );
        END IF;
    END IF;
    
    -- Store price trend data
    NEW.price_trend_data := jsonb_build_object(
        'avg_price_6m', v_price_stats.avg_price,
        'price_increase_percent', v_price_increase,
        'price_volatility', v_price_stats.price_volatility,
        'purchase_count_6m', v_price_stats.purchase_count,
        'min_price_6m', v_price_stats.min_price,
        'max_price_6m', v_price_stats.max_price
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_analyze_price_trend
    BEFORE INSERT ON procurement.grn_items
    FOR EACH ROW
    EXECUTE FUNCTION analyze_purchase_price_trend();

-- =============================================
-- 3. SELLING PRICE MARGIN PROTECTION
-- =============================================
CREATE OR REPLACE FUNCTION protect_selling_price_margins()
RETURNS TRIGGER AS $$
DECLARE
    v_cost_price NUMERIC;
    v_min_margin_percent NUMERIC;
    v_current_margin NUMERIC;
    v_suggested_price NUMERIC;
    v_competitor_price NUMERIC;
BEGIN
    -- Get latest cost price
    SELECT 
        AVG(b.cost_per_unit) as avg_cost
    INTO v_cost_price
    FROM inventory.batches b
    WHERE b.product_id = NEW.product_id
    AND b.quantity_available > 0
    AND b.batch_status = 'active';
    
    -- Get minimum margin requirement
    SELECT 
        COALESCE(
            (SELECT (setting_value::JSONB->>'min_margin_percent')::NUMERIC
             FROM system_config.system_settings
             WHERE org_id = NEW.org_id
             AND setting_key = 'pricing_rules'),
            15 -- Default 15% minimum margin
        ) INTO v_min_margin_percent;
    
    -- Calculate current margin
    IF v_cost_price IS NOT NULL AND v_cost_price > 0 THEN
        v_current_margin := ((NEW.base_unit_price - v_cost_price) / v_cost_price) * 100;
        
        -- Check if margin is too low
        IF v_current_margin < v_min_margin_percent THEN
            v_suggested_price := v_cost_price * (1 + v_min_margin_percent / 100);
            
            -- Create margin alert
            INSERT INTO system_config.system_notifications (
                org_id,
                notification_type,
                notification_category,
                title,
                message,
                priority,
                notification_data
            ) VALUES (
                NEW.org_id,
                'warning',
                'pricing',
                'Low Margin Alert',
                format('Selling price for %s gives only %s%% margin (minimum: %s%%). Suggested price: ₹%s',
                    (SELECT product_name FROM inventory.products WHERE product_id = NEW.product_id),
                    ROUND(v_current_margin, 1),
                    v_min_margin_percent,
                    ROUND(v_suggested_price, 2)),
                'high',
                jsonb_build_object(
                    'product_id', NEW.product_id,
                    'cost_price', v_cost_price,
                    'selling_price', NEW.base_unit_price,
                    'current_margin', v_current_margin,
                    'min_margin', v_min_margin_percent,
                    'suggested_price', v_suggested_price
                )
            );
            
            -- Set flag for review
            NEW.requires_margin_approval := TRUE;
            NEW.margin_approval_data := jsonb_build_object(
                'current_margin', v_current_margin,
                'required_margin', v_min_margin_percent,
                'cost_price', v_cost_price,
                'suggested_price', v_suggested_price
            );
        END IF;
        
        -- Store margin data
        NEW.margin_data := jsonb_build_object(
            'cost_price', v_cost_price,
            'margin_percent', v_current_margin,
            'margin_amount', NEW.base_unit_price - v_cost_price
        );
    END IF;
    
    -- Check against competitor pricing if available
    SELECT competitor_price
    INTO v_competitor_price
    FROM inventory.competitor_pricing
    WHERE product_id = NEW.product_id
    AND is_active = TRUE
    ORDER BY last_updated DESC
    LIMIT 1;
    
    IF v_competitor_price IS NOT NULL THEN
        -- Alert if significantly higher than competitor
        IF NEW.base_unit_price > v_competitor_price * 1.20 THEN
            INSERT INTO inventory.price_alerts (
                org_id,
                product_id,
                alert_type,
                alert_severity,
                current_price,
                competitor_price,
                price_difference_percent,
                alert_message
            ) VALUES (
                NEW.org_id,
                NEW.product_id,
                'high_vs_competitor',
                'medium',
                NEW.base_unit_price,
                v_competitor_price,
                ((NEW.base_unit_price - v_competitor_price) / v_competitor_price) * 100,
                format('Price is %s%% higher than competitor (₹%s)',
                    ROUND(((NEW.base_unit_price - v_competitor_price) / v_competitor_price) * 100, 1),
                    v_competitor_price)
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_protect_margins
    BEFORE INSERT OR UPDATE ON sales.price_list_items
    FOR EACH ROW
    EXECUTE FUNCTION protect_selling_price_margins();

-- =============================================
-- 4. SCHEME IMPACT VALIDATION
-- =============================================
CREATE OR REPLACE FUNCTION validate_scheme_profitability()
RETURNS TRIGGER AS $$
DECLARE
    v_avg_cost NUMERIC;
    v_effective_selling_price NUMERIC;
    v_scheme_cost NUMERIC;
    v_net_margin NUMERIC;
    v_scheme_impact JSONB;
BEGIN
    -- Get average cost for affected products
    SELECT AVG(b.cost_per_unit)
    INTO v_avg_cost
    FROM inventory.batches b
    WHERE b.product_id = ANY(NEW.applicable_products)
    AND b.quantity_available > 0;
    
    -- Calculate scheme impact
    IF NEW.scheme_rules->>'discount_type' = 'percentage' THEN
        v_scheme_cost := v_avg_cost * (NEW.scheme_rules->>'discount_value')::NUMERIC / 100;
    ELSIF NEW.scheme_rules->>'discount_type' = 'fixed' THEN
        v_scheme_cost := (NEW.scheme_rules->>'discount_value')::NUMERIC;
    ELSIF NEW.scheme_rules->'free_goods' IS NOT NULL THEN
        v_scheme_cost := v_avg_cost * (NEW.scheme_rules->'free_goods'->>'quantity')::NUMERIC;
    END IF;
    
    -- Calculate net margin after scheme
    IF v_avg_cost IS NOT NULL AND v_scheme_cost IS NOT NULL THEN
        -- Get average selling price
        SELECT AVG(pli.base_unit_price)
        INTO v_effective_selling_price
        FROM sales.price_list_items pli
        WHERE pli.product_id = ANY(NEW.applicable_products)
        AND pli.is_active = TRUE;
        
        v_net_margin := ((v_effective_selling_price - v_avg_cost - v_scheme_cost) / v_avg_cost) * 100;
        
        -- Alert if scheme makes product unprofitable
        IF v_net_margin < 5 THEN -- Less than 5% margin
            NEW.requires_approval := TRUE;
            NEW.approval_reason := format('Scheme reduces margin to %s%%', ROUND(v_net_margin, 1));
            
            -- Create alert
            INSERT INTO system_config.system_notifications (
                org_id,
                notification_type,
                notification_category,
                title,
                message,
                priority,
                requires_acknowledgment,
                notification_data
            ) VALUES (
                NEW.org_id,
                'warning',
                'pricing',
                'Low Margin Scheme Alert',
                format('Scheme "%s" reduces margin to %s%% (Cost: ₹%s, Scheme Impact: ₹%s)',
                    NEW.scheme_name,
                    ROUND(v_net_margin, 1),
                    ROUND(v_avg_cost, 2),
                    ROUND(v_scheme_cost, 2)),
                'high',
                TRUE,
                jsonb_build_object(
                    'scheme_id', NEW.scheme_id,
                    'scheme_name', NEW.scheme_name,
                    'avg_cost', v_avg_cost,
                    'scheme_cost', v_scheme_cost,
                    'net_margin', v_net_margin,
                    'affected_products', NEW.applicable_products
                )
            );
        END IF;
        
        -- Store impact analysis
        NEW.profitability_analysis := jsonb_build_object(
            'avg_product_cost', v_avg_cost,
            'scheme_cost_per_unit', v_scheme_cost,
            'avg_selling_price', v_effective_selling_price,
            'net_margin_percent', v_net_margin,
            'break_even_quantity', CASE 
                WHEN v_net_margin > 0 
                THEN CEIL(v_scheme_cost / (v_effective_selling_price - v_avg_cost))
                ELSE NULL
            END
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_scheme_profitability
    BEFORE INSERT OR UPDATE ON sales.sales_schemes
    FOR EACH ROW
    EXECUTE FUNCTION validate_scheme_profitability();

-- =============================================
-- 5. BATCH-WISE PRICING CONSISTENCY
-- =============================================
CREATE OR REPLACE FUNCTION ensure_batch_price_consistency()
RETURNS TRIGGER AS $$
DECLARE
    v_price_variance RECORD;
    v_max_variance_allowed NUMERIC := 5; -- 5% variance allowed
BEGIN
    -- Check price variance across active batches
    WITH batch_prices AS (
        SELECT 
            product_id,
            COUNT(DISTINCT mrp_per_unit) as mrp_variants,
            COUNT(DISTINCT sale_price_per_unit) as ptr_variants,
            MAX(mrp_per_unit) as max_mrp,
            MIN(mrp_per_unit) as min_mrp,
            MAX(sale_price_per_unit) as max_ptr,
            MIN(sale_price_per_unit) as min_ptr,
            AVG(mrp_per_unit) as avg_mrp,
            AVG(sale_price_per_unit) as avg_ptr
        FROM inventory.batches
        WHERE product_id = NEW.product_id
        AND batch_status = 'active'
        AND quantity_available > 0
        GROUP BY product_id
    )
    SELECT * INTO v_price_variance FROM batch_prices;
    
    -- Alert on MRP variance
    IF v_price_variance.mrp_variants > 1 THEN
        -- Calculate variance percentage
        IF ((v_price_variance.max_mrp - v_price_variance.min_mrp) / v_price_variance.min_mrp * 100) > v_max_variance_allowed THEN
            INSERT INTO inventory.price_alerts (
                org_id,
                product_id,
                alert_type,
                alert_severity,
                alert_message,
                price_variance_data
            ) VALUES (
                NEW.org_id,
                NEW.product_id,
                'mrp_inconsistency',
                'high',
                format('Multiple MRPs found for same product. Range: ₹%s - ₹%s',
                    v_price_variance.min_mrp,
                    v_price_variance.max_mrp),
                jsonb_build_object(
                    'mrp_variants', v_price_variance.mrp_variants,
                    'min_mrp', v_price_variance.min_mrp,
                    'max_mrp', v_price_variance.max_mrp,
                    'variance_percent', ROUND((v_price_variance.max_mrp - v_price_variance.min_mrp) / v_price_variance.min_mrp * 100, 1)
                )
            );
            
            -- Auto-align to highest MRP if configured
            IF EXISTS (
                SELECT 1 FROM system_config.system_settings
                WHERE org_id = NEW.org_id
                AND setting_key = 'auto_align_mrp'
                AND setting_value = 'true'
            ) THEN
                NEW.mrp_per_unit := v_price_variance.max_mrp;
                NEW.price_alignment_note := 'MRP aligned to highest active batch MRP';
            END IF;
        END IF;
    END IF;
    
    -- Validate PTR vs MRP ratio
    IF NEW.sale_price_per_unit IS NOT NULL AND NEW.mrp_per_unit IS NOT NULL THEN
        DECLARE
            v_ptr_mrp_ratio NUMERIC;
            v_min_ratio NUMERIC := 0.70; -- PTR should be at least 70% of MRP
            v_max_ratio NUMERIC := 0.95; -- PTR should not exceed 95% of MRP
        BEGIN
            v_ptr_mrp_ratio := NEW.sale_price_per_unit / NEW.mrp_per_unit;
            
            IF v_ptr_mrp_ratio < v_min_ratio OR v_ptr_mrp_ratio > v_max_ratio THEN
                INSERT INTO inventory.price_alerts (
                    org_id,
                    product_id,
                    batch_id,
                    alert_type,
                    alert_severity,
                    alert_message,
                    price_data
                ) VALUES (
                    NEW.org_id,
                    NEW.product_id,
                    NEW.batch_id,
                    'ptr_mrp_ratio_alert',
                    'medium',
                    format('PTR/MRP ratio is %s%% (recommended: %s%% - %s%%)',
                        ROUND(v_ptr_mrp_ratio * 100, 1),
                        v_min_ratio * 100,
                        v_max_ratio * 100),
                    jsonb_build_object(
                        'ptr', NEW.sale_price_per_unit,
                        'mrp', NEW.mrp_per_unit,
                        'ratio', v_ptr_mrp_ratio,
                        'recommended_ptr_min', NEW.mrp_per_unit * v_min_ratio,
                        'recommended_ptr_max', NEW.mrp_per_unit * v_max_ratio
                    )
                );
            END IF;
        END;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_batch_price_consistency
    BEFORE INSERT OR UPDATE ON inventory.batches
    FOR EACH ROW
    EXECUTE FUNCTION ensure_batch_price_consistency();

-- =============================================
-- 6. HISTORICAL PRICE TRACKING
-- =============================================
CREATE OR REPLACE FUNCTION track_price_history()
RETURNS TRIGGER AS $$
BEGIN
    -- Log all price changes
    IF TG_OP = 'UPDATE' AND (
        OLD.mrp_per_unit != NEW.mrp_per_unit OR
        OLD.sale_price_per_unit != NEW.sale_price_per_unit OR
        OLD.trade_price_per_unit != NEW.trade_price_per_unit OR
        OLD.cost_per_unit != NEW.cost_per_unit
    ) THEN
        INSERT INTO inventory.price_history (
            org_id,
            product_id,
            batch_id,
            price_type,
            old_price,
            new_price,
            change_percent,
            change_reason,
            changed_by,
            changed_at,
            source_reference
        )
        SELECT 
            NEW.org_id,
            NEW.product_id,
            NEW.batch_id,
            price_type,
            old_price,
            new_price,
            CASE 
                WHEN old_price > 0 THEN ((new_price - old_price) / old_price * 100)
                ELSE 0
            END,
            NEW.price_change_reason,
            NEW.updated_by,
            CURRENT_TIMESTAMP,
            TG_TABLE_NAME || ':' || NEW.batch_id
        FROM (
            VALUES 
                ('mrp', OLD.mrp_per_unit, NEW.mrp_per_unit),
                ('ptr', OLD.sale_price_per_unit, NEW.sale_price_per_unit),
                ('pts', OLD.trade_price_per_unit, NEW.trade_price_per_unit),
                ('cost', OLD.cost_per_unit, NEW.cost_per_unit)
        ) AS changes(price_type, old_price, new_price)
        WHERE old_price IS DISTINCT FROM new_price;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_track_batch_price_history
    AFTER UPDATE ON inventory.batches
    FOR EACH ROW
    EXECUTE FUNCTION track_price_history();

-- =============================================
-- 7. COMPETITOR PRICE MONITORING
-- =============================================
CREATE OR REPLACE FUNCTION monitor_competitor_pricing()
RETURNS TRIGGER AS $$
DECLARE
    v_our_price RECORD;
    v_price_difference NUMERIC;
    v_market_position TEXT;
BEGIN
    -- Get our current pricing
    SELECT 
        AVG(pli.base_unit_price) as our_price,
        MAX(b.mrp_per_unit) as our_mrp
    INTO v_our_price
    FROM inventory.products p
    LEFT JOIN sales.price_list_items pli ON p.product_id = pli.product_id AND pli.is_active = TRUE
    LEFT JOIN inventory.batches b ON p.product_id = b.product_id AND b.batch_status = 'active'
    WHERE p.product_id = NEW.product_id
    GROUP BY p.product_id;
    
    -- Calculate price difference
    IF v_our_price.our_price IS NOT NULL THEN
        v_price_difference := ((v_our_price.our_price - NEW.competitor_price) / NEW.competitor_price) * 100;
        
        -- Determine market position
        v_market_position := CASE
            WHEN v_price_difference > 10 THEN 'premium'
            WHEN v_price_difference > 5 THEN 'above_market'
            WHEN v_price_difference >= -5 THEN 'competitive'
            WHEN v_price_difference >= -10 THEN 'below_market'
            ELSE 'aggressive'
        END;
        
        NEW.price_comparison := jsonb_build_object(
            'our_price', v_our_price.our_price,
            'price_difference', v_price_difference,
            'market_position', v_market_position
        );
        
        -- Alert on significant differences
        IF ABS(v_price_difference) > 15 THEN
            INSERT INTO inventory.price_alerts (
                org_id,
                product_id,
                alert_type,
                alert_severity,
                alert_message,
                competitor_data
            ) VALUES (
                NEW.org_id,
                NEW.product_id,
                CASE 
                    WHEN v_price_difference > 0 THEN 'above_competitor'
                    ELSE 'below_competitor'
                END,
                CASE 
                    WHEN ABS(v_price_difference) > 25 THEN 'high'
                    ELSE 'medium'
                END,
                format('Our price is %s%% %s competitor (%s vs ₹%s)',
                    ABS(ROUND(v_price_difference, 1)),
                    CASE WHEN v_price_difference > 0 THEN 'above' ELSE 'below' END,
                    v_market_position,
                    NEW.competitor_price),
                jsonb_build_object(
                    'competitor_name', NEW.competitor_name,
                    'competitor_price', NEW.competitor_price,
                    'our_price', v_our_price.our_price,
                    'price_difference_percent', v_price_difference,
                    'market_position', v_market_position,
                    'source', NEW.data_source
                )
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- DISABLED: Table inventory.competitor_pricing doesn't exist
-- CREATE TRIGGER trigger_monitor_competitor_price
--     BEFORE INSERT OR UPDATE ON inventory.competitor_pricing
--     FOR EACH ROW
--     EXECUTE FUNCTION monitor_competitor_pricing();

-- =============================================
-- SUPPORTING TABLES
-- =============================================

-- Price alerts table
CREATE TABLE IF NOT EXISTS inventory.price_alerts (
    alert_id SERIAL PRIMARY KEY,
    org_id INTEGER NOT NULL,
    product_id INTEGER REFERENCES inventory.products(product_id),
    batch_id INTEGER REFERENCES inventory.batches(batch_id),
    alert_type TEXT NOT NULL,
    alert_severity TEXT CHECK (alert_severity IN ('low', 'medium', 'high', 'critical')),
    current_price NUMERIC(12,2),
    average_price NUMERIC(12,2),
    competitor_price NUMERIC(12,2),
    price_change_percent NUMERIC(5,2),
    margin_impact_percent NUMERIC(5,2),
    price_volatility NUMERIC(12,2),
    price_difference_percent NUMERIC(5,2),
    alert_message TEXT NOT NULL,
    price_data JSONB,
    price_variance_data JSONB,
    competitor_data JSONB,
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by INTEGER,
    acknowledged_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Price history table
CREATE TABLE IF NOT EXISTS inventory.price_history (
    history_id SERIAL PRIMARY KEY,
    org_id INTEGER NOT NULL,
    product_id INTEGER REFERENCES inventory.products(product_id),
    batch_id INTEGER REFERENCES inventory.batches(batch_id),
    price_type TEXT NOT NULL,
    old_price NUMERIC(12,2),
    new_price NUMERIC(12,2),
    change_percent NUMERIC(5,2),
    change_reason TEXT,
    changed_by INTEGER,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    source_reference TEXT
);

-- Create indexes for price history
CREATE INDEX idx_price_history_product ON inventory.price_history(product_id, changed_at);
CREATE INDEX idx_price_history_batch ON inventory.price_history(batch_id, price_type);

-- Price change log
CREATE TABLE IF NOT EXISTS inventory.price_change_log (
    log_id SERIAL PRIMARY KEY,
    org_id INTEGER NOT NULL,
    product_id INTEGER REFERENCES inventory.products(product_id),
    batch_id INTEGER REFERENCES inventory.batches(batch_id),
    change_type TEXT NOT NULL,
    old_value NUMERIC(12,2),
    new_value NUMERIC(12,2),
    change_reason TEXT,
    changed_by INTEGER,
    requires_approval BOOLEAN DEFAULT FALSE,
    approved_by INTEGER,
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Competitor pricing table
CREATE TABLE IF NOT EXISTS inventory.competitor_pricing (
    competitor_price_id SERIAL PRIMARY KEY,
    org_id INTEGER NOT NULL,
    product_id INTEGER REFERENCES inventory.products(product_id),
    competitor_name TEXT NOT NULL,
    competitor_price NUMERIC(12,2) NOT NULL,
    competitor_mrp NUMERIC(12,2),
    data_source TEXT,
    price_comparison JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- SUPPORTING INDEXES
-- =============================================
CREATE INDEX idx_price_alerts_product ON inventory.price_alerts(product_id, created_at);
CREATE INDEX idx_price_alerts_unack ON inventory.price_alerts(org_id, acknowledged) WHERE acknowledged = FALSE;
CREATE INDEX idx_competitor_pricing_active ON inventory.competitor_pricing(product_id, is_active) WHERE is_active = TRUE;

-- =============================================
-- COMMENTS
-- =============================================
COMMENT ON FUNCTION prevent_mrp_decrease() IS 'Prevents MRP from decreasing and alerts on significant changes';
COMMENT ON FUNCTION analyze_purchase_price_trend() IS 'Analyzes purchase price trends and volatility';
COMMENT ON FUNCTION protect_selling_price_margins() IS 'Ensures minimum margin requirements are met';
COMMENT ON FUNCTION validate_scheme_profitability() IS 'Validates that schemes maintain profitability';
COMMENT ON FUNCTION ensure_batch_price_consistency() IS 'Ensures price consistency across batches';
COMMENT ON FUNCTION track_price_history() IS 'Maintains complete price change history';
COMMENT ON FUNCTION monitor_competitor_pricing() IS 'Monitors and alerts on competitor price differences';