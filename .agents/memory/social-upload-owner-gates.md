---
name: Social upload & owner gates
description: Architecture of the social post upload system and how owner access is gated across ComingSoonGuard and CreateHub.
---

## Owner gate pattern
- `ComingSoonGuard` unlocks for `isAdmin` (super-admin JWT) **OR** `user.isOwner === true` (Supabase user from useAppStore).
- `CreateHub` has the same dual check: `const comingSoonLocked = m.comingSoon && !isAdmin && !isOwner`.
- Both pull `isOwner` from `useAppStore((s) => s.user?.isOwner === true)`.
- The `OWNER_EMAIL` env var (`allanalbacen5@gmail.com`) is the server-side gate on all owner-only API endpoints.

## Social post upload system
- Migration 42 (`42-social-upload-music.sql`) creates: posts, post_media, comments, likes, saves, shares, post_notifications, sounds, sound_usage, alert_settings; adds cover_photo_url to users.
- Storage buckets: `post-media` (public, 100 MB limit) and `cover-photos` (public, 10 MB limit).
- API routes: `socialPosts.ts` (GET/POST/DELETE /api/posts, like/save/comment toggles) and `alertSettings.ts` (GET/PUT /api/alert-settings, POST /api/alert-settings/test).
- Client: `postsClient.ts` exports fetchFeed, createPost, toggleLike, toggleSave, fetchComments, addComment, uploadPostMedia, uploadCoverPhoto, getAlertSettings, saveAlertSettings, sendTestAlertToChannels.
- `/upload` route (`Upload.tsx`) — multi-file drag/drop, per-file progress, caption, music placeholder, publish.

## BottomNav
- Changed from 4-tab `grid-cols-4` to a 5-item flex layout with center "+" upload button (gradient circle, 50px).
- Center button navigates to `/upload`.

**Why:** Owner needs full access to all studio features without being a super-admin. The social upload system is the foundation for the public feed.
