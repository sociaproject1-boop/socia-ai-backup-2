---
name: Profile tab system
description: Architecture of the 5-tab profile content hub (Spotlight/Motion/Gallery/Moments/Milestones)
---

## Tab identity
- Spotlight = all posts
- Motion = posts where any media item has type "video" OR post.type === "video"
- Gallery = posts with media AND not all-video
- Moments = posts where media.length === 0 (text-only)
- Milestones = computed from user/post data, no extra DB table

## Text posts
- Stored with type='photo' and empty post_media rows (no DB constraint change needed)
- Backend: removed the "at least one media item required" guard — now requires caption OR media
- Frontend identifies text posts by `post.media.length === 0`

## SupporterTier type
- `SupporterTier = 1 | 2 | 3 | 4` (numeric, NOT a string union)
- Always import from `@/components/profile/FoundingSupporterBadge`
- Use `TIER_NAMES[supporterTier]` for display labels

## Key files
- `src/components/profile/ProfileTabs.tsx` — tab bar + content router; fetches all posts once then filters client-side per tab
- `src/components/profile/ProfilePostGrid.tsx` — paginated grid; layout="masonry"|"grid"|"feed"
- `src/components/profile/MilestoneTimeline.tsx` — computes milestones from userProfile + posts props
- `src/components/profile/MutualConnections.tsx` — queries follows table directly via Supabase anon client

## Why client-side filtering
Profile pages rarely have >200 posts. Fetching once and filtering avoids N API calls on tab switch. For prolific creators, pagination (20/page) still applies via IntersectionObserver sentinel.
