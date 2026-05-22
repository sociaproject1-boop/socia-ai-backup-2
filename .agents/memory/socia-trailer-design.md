---
name: Socia-trailer design system
description: Design tokens, UI primitives, and workspace shell architecture for the AI Cinematic Studio redesign.
---

## Design tokens (--cs-* namespace)
All tokens live in `artifacts/socia-trailer/src/index.css` under `:root`.
Key values: canvas `#07070f`, bg `#0b0b16`, elevated `#111120`, primary `#7C3AED`.
Tailwind v4 uses `@import "tailwindcss"` + `@theme inline` — NO tailwind.config.js file.

## UI primitives
`artifacts/socia-trailer/src/components/ui/` — 14 components, barrel export via `index.ts`.
Button, IconButton, Card, Badge, CreditsBadge, Toggle, Tabs, Slider, Tooltip, Modal, Drawer, TimelineItem, EmptyState, Skeleton.

## Workspace shell
`artifacts/socia-trailer/src/components/workspace/` — 7 components:
WorkspaceLayout, TopBar, SidebarNav, PreviewPlayer (fill prop for mobile), SceneTimeline (compact prop for mobile), SettingsPanel, GenerateBar, MobileNav.

## URL routing
- Default: WorkspaceLayout (studio UI)
- `?export=1`: ExportPage (MediaRecorder capture flow — do NOT break)
- `?preview=1`: bare VideoTemplate only (for embed/social share)

## Architecture constraint
VideoTemplate + useVideoPlayer + useSceneControls must NEVER be modified during UI work.
All scene state lives in VideoWithControls, passed down as props.

**Why:** VideoTemplate drives MediaRecorder via `window.startRecording` / `window.stopRecording` hooks. Any re-render or lifecycle change breaks the export pipeline.
