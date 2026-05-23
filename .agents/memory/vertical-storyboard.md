---
name: VerticalStoryboard component
description: Premium cinematic vertical storyboard in CreateMultiFrame mobile "scenes" tab — wiring decisions and key patterns.
---

## Rule
`VerticalStoryboard` lives at `artifacts/socia/src/components/studio/VerticalStoryboard.tsx`.
It is mounted only as the mobile "scenes" tab inside `CreateMultiFrame.tsx`.
Desktop layout (3-column sidebar/center/right) is completely separate — do NOT merge them.

**Why:** The reference mockup is explicitly mobile-first. Desktop kept its own timeline/preview/panel layout.

## Per-frame upload pattern
`frameInputRef` + `pendingUploadIdRef` are added to `CreateMultiFrame.tsx` alongside `globalInputRef`.
`triggerFrameUpload(id)` sets `pendingUploadIdRef.current = id` then calls `frameInputRef.current?.click()`.
The hidden `<input ref={frameInputRef}>` onChange calls the existing `uploadFile(id, file)`.

**Why:** `VerticalStoryboard` needs single-frame file picking (tap scene thumbnail → pick one image),
not the multi-file bulk create flow of `globalInputRef`.

## Data flow
All props passed from CreateMultiFrame: `frames`, `selectedId`, `onSelectId`, `onUpdateFrame`,
`onAddFrame` (`addFrame`), `onRemoveFrame` (`removeFrame`), `onDuplicateFrame` (`duplicateFrame`),
`onTriggerUpload` (`triggerFrameUpload`), `canGenerate`, `onGenerate` (`generate`),
`generating`, `cooldownSec`, `engineGradient` (`engine.gradient`), `engineGlow` (`engine.glow`),
`credits` (`estCredits(cfg.renderEngine, segmentCount)`).

## Bottom tab bar
Mobile bottom bar was updated from 4 tabs to 5: Scenes | Preview | Voice (→ "director") | Motion (→ "settings") | Render (glowing action button, calls `generate()` directly).

## MobileView type stays unchanged
`"scenes"|"preview"|"director"|"settings"` — no new values needed. Voice maps to "director", Motion maps to "settings". Render is an action, not a view.
