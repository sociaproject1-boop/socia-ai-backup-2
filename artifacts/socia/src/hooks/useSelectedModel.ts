/**
 * useSelectedModel — hook for the AI Cinematic Studio orchestrator.
 *
 * Reads/writes the persisted selected model via the existing
 * `useStudioModelStore`, and resolves it to a full `AiModel` object
 * (cover, tags, credits, speed/quality bars, etc.) for any UI that
 * needs to display or price-check the active engine.
 *
 * Scoped EXCLUSIVELY to the AI Cinematic Studio — the render pipeline
 * inside CreateMultiFrame mirrors the same id into `cfg.renderEngine`.
 */

import { useStudioModelStore, type StudioModelId } from "@/store/modelStore";
import {
  AI_MODELS,
  AI_MODELS_BY_ID,
  DEFAULT_AI_MODEL_ID,
  type AiModel,
  type AiModelId,
} from "@/data/aiModels";

export function useSelectedModel(): {
  /** Currently selected model object (always resolved, never null). */
  model: AiModel;
  /** Raw id from the persisted store. */
  modelId: AiModelId;
  /** All orchestrator-visible models. */
  models: AiModel[];
  /** Set the selected model by id. */
  setModel: (id: AiModelId) => void;
  /** Estimate credits cost for a render with N segments. */
  estimateCredits: (segmentCount: number) => number;
} {
  const rawId    = useStudioModelStore((s) => s.selectedModelId);
  const setRawId = useStudioModelStore((s) => s.setSelectedModelId);

  /* Resolve to an orchestrator-known model. If the persisted id belongs
     to a legacy engine that isn't in the orchestrator list (e.g. an old
     kling-standard / hyper-real selection) or has been tampered with,
     fall back to the flagship so the UI always has something to show.
     Use Object.hasOwn — `in` would match inherited prototype keys
     like `toString` and resolve to undefined. */
  const isKnown =
    typeof rawId === "string" &&
    Object.prototype.hasOwnProperty.call(AI_MODELS_BY_ID, rawId);
  const resolvedId: AiModelId = (isKnown ? rawId : DEFAULT_AI_MODEL_ID) as AiModelId;
  const model = AI_MODELS_BY_ID[resolvedId];

  return {
    model,
    modelId: resolvedId,
    models:  AI_MODELS,
    setModel: (id: AiModelId) => setRawId(id as StudioModelId),
    estimateCredits: (segmentCount: number) =>
      model.creditsPerSegment * Math.max(0, segmentCount),
  };
}
