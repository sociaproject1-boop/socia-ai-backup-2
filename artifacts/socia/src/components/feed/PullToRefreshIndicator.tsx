import { useEffect, useRef } from "react";
import type { PTRPhase } from "@/hooks/usePullToRefresh";

interface Props {
  phase: PTRPhase;
  indicatorRef: React.RefObject<HTMLDivElement | null>;
}

export function PullToRefreshIndicator({ phase, indicatorRef }: Props) {
  const spinnerRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!spinnerRef.current || !textRef.current) return;

spinnerRef.current.style.display =
  phase === "refreshing" ? "block" : "none";

textRef.current.textContent = "";
  }, [phase]);

  return (
    <div ref={indicatorRef as React.RefObject<HTMLDivElement>}
      style={{position:"fixed",top:0,left:0,right:0,height:64,zIndex:55,display:"flex",justifyContent:"center",alignItems:"center",gap:8,transform:"translateY(-64px)",opacity:0,pointerEvents:"none"}}>
      <span
  ref={spinnerRef}
  style={{
    width: 28,
    height: 28,
    borderRadius: "50%",
    border: "2px solid rgba(255,255,255,.25)",
    borderTopColor: "#ffffff",
    display: "none",
    animation: "ptr-spin .8s linear infinite",
  }}
/>
      <span ref={textRef} style={{fontSize:12,color:"rgba(255,255,255,.75)"}}/>
    </div>
  );
}
