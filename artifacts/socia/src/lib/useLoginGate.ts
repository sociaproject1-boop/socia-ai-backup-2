/**
 * useLoginGate — global Zustand store + hook for triggering the
 * LoginRequiredModal from anywhere in the component tree without
 * prop drilling.
 *
 * Security model:
 *   - This gate is UX only. The backend enforces auth via requireAuth
 *     middleware on every AI route (POST /api/generate-image,
 *     /api/generate-video, /api/socia-gpt/chat, etc.) and returns
 *     HTTP 401 for any unauthenticated request regardless of
 *     what the frontend does.
 *   - AuthGuard in App.tsx already redirects guests who deep-link
 *     directly to /create/prompt-image, /create/prompt-video,
 *     /create/image-video, /socia-gpt, etc.
 *   - This hook provides the final polished UX layer: instead of a
 *     silent redirect, show a "Login Required" bottom sheet explaining
 *     what the user will unlock.
 *
 * Usage:
 *   const { requireLogin } = useLoginGate();
 *   // Returns true if the action is allowed (user is authenticated)
 *   // Returns false and opens the modal if the user is a guest.
 *   if (!requireLogin("Prompt to Image")) return;
 *   navigate("/create/prompt-image");
 */
import { create } from "zustand";
import { useAppStore } from "./store";

interface LoginGateState {
  open:     boolean;
  toolName: string | undefined;
  openGate:  (toolName?: string) => void;
  closeGate: () => void;
}

export const useLoginGateStore = create<LoginGateState>((set) => ({
  open:      false,
  toolName:  undefined,
  openGate:  (toolName) => set({ open: true, toolName }),
  closeGate: ()         => set({ open: false, toolName: undefined }),
}));

/**
 * Returns a `requireLogin(toolName?)` helper.
 * Call it before any authenticated action:
 *
 *   if (!requireLogin("Prompt to Image")) return;
 *
 * For authenticated users it returns `true` immediately.
 * For guests it opens the modal and returns `false`.
 */
export function useLoginGate() {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const openGate        = useLoginGateStore((s) => s.openGate);

  const requireLogin = (toolName?: string): boolean => {
    if (isAuthenticated) return true;
    openGate(toolName);
    return false;
  };

  return { requireLogin };
}
