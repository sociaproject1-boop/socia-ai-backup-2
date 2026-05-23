/**
 * modelStore — Selected AI model for the Cinematic Studio render pipeline.
 *
 * Scoped EXCLUSIVELY to the AI Cinematic Studio. The selected ID is the
 * source of truth for `cfg.renderEngine` inside CreateMultiFrame, and the
 * studio mirrors changes back into this store so the selection persists
 * across the session.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type StudioModelId =
  | "kling-3-omni"
  | "kling-standard"
  | "kling-cinematic"
  | "runway-gen4"
  | "veo-ultra"
  | "anime-motion"
  | "hyper-real";

interface ModelStore {
  selectedModelId: StudioModelId;
  setSelectedModelId: (id: StudioModelId) => void;
}

export const useStudioModelStore = create<ModelStore>()(
  persist(
    (set) => ({
      selectedModelId: "kling-3-omni",
      setSelectedModelId: (id) => set({ selectedModelId: id }),
    }),
    { name: "socia_studio_model_v1" }
  )
);
