/**
 * Legacy /subscribe entry — preserved as a permanent redirect to the new
 * billing flow. All paid features now live under /billing/*.
 */
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function Subscribe() {
  const [, navigate] = useLocation();
  useEffect(() => { navigate("/billing/upgrade", { replace: true }); }, [navigate]);
  return null;
}
