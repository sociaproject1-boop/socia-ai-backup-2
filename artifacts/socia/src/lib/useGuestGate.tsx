/**
 * useGuestGate — Smart auth gate for engagement actions.
 *
 * Usage:
 *   const { gateAction, GuestModalPortal } = useGuestGate();
 *
 *   <button onClick={() => gateAction(() => handleLike(), "like posts")}>Like</button>
 *   {GuestModalPortal}
 */
import { useState, useCallback } from "react";
import { useAppStore } from "@/lib/store";
import { GuestAuthModal } from "@/components/guest/GuestAuthModal";

interface GuestGate {
  gateAction: (action: () => void, label?: string) => void;
  showingGuestModal: boolean;
  GuestModalPortal: React.ReactElement;
}

export function useGuestGate(): GuestGate {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const [open, setOpen] = useState(false);
  const [actionLabel, setActionLabel] = useState<string | undefined>(undefined);

  const gateAction = useCallback(
    (action: () => void, label?: string) => {
      if (isAuthenticated) {
        action();
      } else {
        setActionLabel(label);
        setOpen(true);
      }
    },
    [isAuthenticated],
  );

  const GuestModalPortal = (
    <GuestAuthModal
      open={open}
      onClose={() => setOpen(false)}
      action={actionLabel}
    />
  );

  return { gateAction, showingGuestModal: open, GuestModalPortal };
}
