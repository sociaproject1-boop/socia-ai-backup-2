-- ============================================================
-- Socia Plan Price Update
-- Run this in the Supabase SQL editor.
-- Updates 15-day plan: ₱1000 → ₱1200
-- Updates Monthly plan: ₱1500 → ₱1700
-- ============================================================

UPDATE plans
SET price_php = 1200, updated_at = now()
WHERE code = 'p15';

UPDATE plans
SET price_php = 1700, updated_at = now()
WHERE code = 'p30';

-- Verify
SELECT code, name, price_php, credits, duration_days
FROM plans
ORDER BY price_php;
