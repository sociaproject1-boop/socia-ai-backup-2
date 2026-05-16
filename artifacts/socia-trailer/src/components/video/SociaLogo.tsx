export function SociaLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`relative flex flex-col items-center justify-center ${className}`}>
      <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-[#7C3AED] to-[#EC4899] flex items-center justify-center shadow-[0_0_60px_rgba(124,58,237,0.6)]">
        <svg viewBox="0 0 24 24" fill="none" className="w-12 h-12 text-white">
          <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" fill="currentColor"/>
          <path d="M19 4L20 7L23 8L20 9L19 12L18 9L15 8L18 7L19 4Z" fill="currentColor"/>
          <path d="M5 18L5.5 20L8 20.5L5.5 21L5 23L4.5 21L2 20.5L4.5 20L5 18Z" fill="currentColor"/>
        </svg>
      </div>
      <div className="mt-4 font-black tracking-tighter text-4xl text-transparent bg-clip-text bg-gradient-to-r from-[#7C3AED] to-[#EC4899]" style={{ fontFamily: 'var(--font-display)' }}>
        Socia
      </div>
      <div className="mt-1 text-xs uppercase tracking-widest text-[#a0a0b0] font-medium">
        Where imagination becomes feed
      </div>
    </div>
  );
}
