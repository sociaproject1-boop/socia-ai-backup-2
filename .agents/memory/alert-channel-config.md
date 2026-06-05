---
name: Alert channel config
description: DB-based alert channel settings (email/SMS/webhook) stored in alert_settings table, configured via SystemStatusCenter expandable panel.
---

## alert_settings table (migration 42)
- Columns: user_id (FK, unique), email_enabled, sms_enabled, webhook_enabled, email_address, phone_number, webhook_url.
- Owner-only RLS: only rows where users.is_owner = true.
- API: GET /api/alert-settings, PUT /api/alert-settings, POST /api/alert-settings/test.

## SystemStatusCenter UI
- Alert settings card now has a "Configure channels" button that expands an AnimatePresence panel.
- Panel has per-channel toggles (email, SMS, webhook) + credential inputs.
- Loads existing settings on open via getAlertSettings(); saves via saveAlertSettings().
- Test alert button fires a real delivery to all armed channels.

## Profile UI changes
- `VerifiedFounderBadge` is now **blue** (Twitter/X style: #1d9bf0 gradient, blue glow, white checkmark) — was gold.
- `KingBadge` is removed from Profile.tsx (founder identity lives in VerifiedFounderBadge).
- `BusinessVerificationModal` now shows 4 tabbed documents: DTI cert + BIR 2303 pages 1, 2, 3 with Prev/Next navigation and keyboard arrow support.

**Why:** DB-persisted alert settings survive restarts and don't require env var changes. Blue verified badge matches modern platform trust conventions.
