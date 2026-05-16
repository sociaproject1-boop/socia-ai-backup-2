import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1400),
      setTimeout(() => setPhase(3), 2400),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div className="absolute inset-0 flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, filter: 'blur(20px)', rotate: 3 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Title top-right */}
      <div className="absolute top-14 right-8 z-30 text-right">
        <motion.div
          className="text-[5.5vw] font-black text-white tracking-tight leading-none"
          style={{ fontFamily: 'var(--font-display)' }}
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          SOCIA <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#06B6D4] to-[#7C3AED]">GPT</span>
        </motion.div>
        <motion.div
          className="text-[2vw] text-white/40 font-mono tracking-widest uppercase"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          AI Assistant
        </motion.div>
      </div>

      {/* Chat UI */}
      <motion.div
        className="relative z-20 w-[88%] mt-10"
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="w-full rounded-3xl border border-white/10 bg-[#0d0d1a]/92 backdrop-blur-2xl p-5 shadow-2xl flex flex-col gap-5">

          {/* User message */}
          <motion.div
            className="self-end max-w-[82%] rounded-2xl rounded-tr-sm bg-white/10 px-4 py-3 text-[2.5vw] text-white/90 leading-snug"
            initial={{ opacity: 0, y: 16, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', delay: 0.7 }}
          >
            "Create a futuristic cyberpunk city for my next AI video."
          </motion.div>

          {/* Typing indicator → AI response */}
          <motion.div
            className="self-start max-w-[92%] rounded-2xl rounded-tl-sm bg-gradient-to-br from-[#7C3AED]/20 to-[#EC4899]/20 border border-[#7C3AED]/35 px-4 py-3 relative overflow-hidden"
            initial={{ opacity: 0, y: 16, scale: 0.92 }}
            animate={{ opacity: phase >= 2 ? 1 : 0, y: phase >= 2 ? 0 : 16, scale: phase >= 2 ? 1 : 0.92 }}
            transition={{ type: 'spring' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 rounded-full bg-gradient-to-r from-[#7C3AED] to-[#06B6D4] flex items-center justify-center">
                <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
              </div>
              <span className="font-bold text-[1.8vw] uppercase tracking-wider text-[#06B6D4]">Socia GPT</span>
            </div>
            <p className="text-[2.5vw] text-white/85 leading-snug">
              Generating your cinematic environment now. Applying the <span className="text-[#EC4899] font-bold">'Neon Dystopia'</span> preset.
            </p>

            {/* Generated image preview */}
            <motion.div
              className="mt-3 h-20 rounded-xl bg-black/60 overflow-hidden relative border border-white/10"
              initial={{ opacity: 0, scaleY: 0 }}
              animate={{ opacity: phase >= 3 ? 1 : 0, scaleY: phase >= 3 ? 1 : 0 }}
              style={{ transformOrigin: 'top' }}
              transition={{ duration: 0.5 }}
            >
              <div
                className="absolute inset-0 opacity-85"
                style={{ background: 'url(https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=600&auto=format&fit=crop) center/cover' }}
              />
              <div className="absolute bottom-2 right-2 bg-[#7C3AED]/80 rounded-md px-2 py-0.5 text-[1.5vw] font-bold text-white backdrop-blur-sm">
                AI Generated
              </div>
            </motion.div>
          </motion.div>

          {/* Input bar */}
          <div className="h-10 w-full rounded-full bg-black/50 border border-white/10 flex items-center px-3 gap-2">
            <div className="flex-1 text-white/25 text-[2vw] tracking-wide font-mono">
              Type a prompt or upload an asset...
            </div>
            <div className="w-7 h-7 rounded-full bg-gradient-to-r from-[#7C3AED] to-[#3B82F6] flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-white fill-current">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Side glow */}
      <div className="absolute right-0 top-0 bottom-0 w-1/3 pointer-events-none"
        style={{ background: 'linear-gradient(to left, rgba(6,182,212,0.06), transparent)' }} />
    </motion.div>
  );
}
