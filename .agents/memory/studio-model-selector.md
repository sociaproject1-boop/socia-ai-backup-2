---
name: Studio AI model selector
description: How the Cinematic Studio's AI model picker is wired into the render pipeline
---

The studio's "active AI model" is `cfg.renderEngine: RenderEngineId` inside `artifacts/socia/src/pages/CreateMultiFrame.tsx`. The `ENGINES` array (top of file) is the single source of truth — every model card the user sees, and every render submission, derives from it.

**Why:** Earlier UIs tried to add a parallel "model" concept alongside `renderEngine`, which immediately drifted (badge text vs. real engine sent to the worker). Keep one id.

**How to apply:**
- To add a model: append to `RenderEngineId` union AND the `ENGINES` array. Optionally add a cover image in `MODEL_COVERS` and badges in `MODEL_BADGES` (both at the top of `CreateMultiFrame.tsx`). The selector picks it up automatically.
- The selector (`components/models/ModelSelector.tsx`) is a bottom sheet rendered at the root of `CreateMultiFrame`'s JSX. Its `onSelect` MUST call both `updateCfg({ renderEngine })` AND `setStudioSelectedModelId(...)` — the cfg drives the live render, the zustand store (`store/modelStore.ts`, persisted as `socia_studio_model_v1`) survives reload.
- Unavailable engines (`available: false`) render with a "Soon" lock pill and are non-clickable; do not silently downgrade — that hides product-tier signaling from the user.
- Cover images use the `@assets` Vite alias (configured in `artifacts/socia/vite.config.ts`). Never reference `attached_assets/` paths directly in JSX — they aren't served.
