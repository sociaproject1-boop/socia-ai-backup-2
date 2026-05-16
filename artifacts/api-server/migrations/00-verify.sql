-- ================================================================
-- VERIFICATION — run this AFTER all 13 sections complete
-- No transaction needed — read-only query.
-- Expected output: 13 rows, every rls_enabled = true
-- ================================================================

SELECT
  tablename                    AS "table",
  rowsecurity                  AS rls_enabled,
  CASE rowsecurity
    WHEN true  THEN 'OK'
    WHEN false THEN 'UNPROTECTED'
  END                          AS status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'messages',
    'typing_status',
    'users',
    'message_reactions',
    'nicknames',
    'ai_subscriptions',
    'ai_usage_tracking',
    'ai_requests',
    'ai_billing_history',
    'refund_requests',
    'refund_decisions',
    'funding_donations',
    'community_funding'
  )
ORDER BY tablename;
