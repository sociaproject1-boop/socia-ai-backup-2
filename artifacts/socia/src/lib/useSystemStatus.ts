/**
 * useSystemStatus — live public status feed for banners + checkout gating.
 *
 * Sources, in order of freshness:
 *   1. REST snapshot on mount (immediate, reliable).
 *   2. Socket.IO push on SYSTEM_STATUS_CHANNEL (realtime updates).
 *
 * FAILSAFE: state starts at SAFE_DEFAULT (checkout enabled). Any fetch/socket
 * failure leaves checkout enabled — a monitoring outage never blocks payment.
 */
import { useEffect, useState } from "react";
import {
  fetchPublicStatus,
  getStatusSocket,
  SAFE_DEFAULT,
  SYSTEM_STATUS_CHANNEL,
  type PublicStatusSnapshot,
  type StatusLevel,
} from "./systemStatus";

export interface UseSystemStatus {
  snapshot: PublicStatusSnapshot;
  /** True only on a CONFIRMED maintenance/outage of the payment provider. */
  checkoutDisabled: boolean;
  paymentStatus: StatusLevel;
  paymentMessage: string;
  loaded: boolean;
}

export function useSystemStatus(): UseSystemStatus {
  const [snapshot, setSnapshot] = useState<PublicStatusSnapshot>(SAFE_DEFAULT);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetchPublicStatus().then((snap) => {
      if (!cancelled) {
        setSnapshot(snap);
        setLoaded(true);
      }
    });

    const socket = getStatusSocket();
    const onStatus = (snap: PublicStatusSnapshot) => {
      if (!cancelled && snap?.payment) setSnapshot(snap);
    };
    socket.on(SYSTEM_STATUS_CHANNEL, onStatus);

    return () => {
      cancelled = true;
      socket.off(SYSTEM_STATUS_CHANNEL, onStatus);
    };
  }, []);

  return {
    snapshot,
    checkoutDisabled: snapshot.payment.checkoutDisabled === true,
    paymentStatus: snapshot.payment.status,
    paymentMessage: snapshot.payment.message,
    loaded,
  };
}
