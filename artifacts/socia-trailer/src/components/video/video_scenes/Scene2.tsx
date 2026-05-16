import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 3000),
      setTimeout(() => setPhase(4), 5000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
      initial={{ opacity: 0, scale: 1.15 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, y: -80, filter: 'blur(20px)' }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Title */}
      <div className="absolute top-14 left-8 z-30">
        <motion.div
          className="text-[3.5vw] font-black text-white tracking-tight leading-none"
          style={{ fontFamily: 'var(--font-display)' }}
          initial={{ opacity: 0, x: -60 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          AI CINEMATIC
        </motion.div>
        <motion.div
          className="text-[3.5vw] font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[#7C3AED] to-[#06B6D4]"
          style={{ fontFamily: 'var(--font-display)' }}
          initial={{ opacity: 0, x: -60 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        >
          STUDIO
        </motion.div>
      </div>

      {/* Studio UI mockup */}
      <motion.div
        className="relative z-20 w-[90%] mt-20"
        style={{ perspective: 1000 }}
        initial={{ rotateX: 18, y: 80, opacity: 0 }}
        animate={{ rotateX: 0, y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 90, damping: 20, delay: 0.3 }}
      >
        <div className="w-full rounded-2xl border border-white/10 bg-[#0d0d1a]/85 backdrop-blur-xl p-4 flex flex-col gap-3 shadow-[0_0_60px_rgba(124,58,237,0.25)]">

          {/* Timeline */}
          <div className="w-full h-28 rounded-xl bg-black/50 overflow-hidden relative border border-white/5">
            <motion.div
              className="absolute top-0 bottom-0 w-[2px] bg-[#EC4899] shadow-[0_0_12px_#EC4899]"
              initial={{ left: '5%' }}
              animate={{ left: '92%' }}
              transition={{ duration: 5.5, ease: 'linear' }}
            />
            <div className="absolute inset-0 flex items-center px-4 gap-2">
              {[1, 2, 3, 4, 5].map(i => (
                <motion.div key={i}
                  className="h-14 flex-1 rounded-lg border"
                  style={{
                    background: `rgba(124,58,237,${0.1 + i * 0.04})`,
                    borderColor: `rgba(124,58,237,${0.3 + i * 0.05})`
                  }}
                  initial={{ opacity: 0, scaleY: 0 }}
                  animate={{ opacity: phase >= 1 ? 1 : 0, scaleY: phase >= 1 ? 1 : 0 }}
                  transition={{ delay: 0.5 + i * 0.08, type: 'spring', stiffness: 300 }}
                />
              ))}
            </div>
            <div className="absolute top-2 left-4 text-[9px] text-white/30 font-mono uppercase tracking-widest">TIMELINE</div>
          </div>

          {/* Controls row */}
          <div className="flex gap-3 h-20">
            <div className="flex-1 rounded-xl bg-black/40 p-3 border border-white/5 flex flex-col justify-between">
              <div className="text-[9px] text-white/40 uppercase tracking-widest font-bold">Render Queue</div>
              <div className="flex flex-col gap-2">
                <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                  <motion.div className="h-full bg-gradient-to-r from-[#06B6D4] to-[#7C3AED] rounded-full"
                    initial={{ width: '0%' }}
                    animate={{ width: phase >= 2 ? '100%' : '0%' }}
                    transition={{ duration: 2, ease: 'easeOut' }}
                  />
                </div>
                <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                  <motion.div className="h-full bg-gradient-to-r from-[#06B6D4] to-[#7C3AED] rounded-full"
                    initial={{ width: '0%' }}
                    animate={{ width: phase >= 2 ? '58%' : '0%' }}
                    transition={{ duration: 2.8, ease: 'easeOut', delay: 0.4 }}
                  />
                </div>
                <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                  <motion.div className="h-full bg-gradient-to-r from-[#06B6D4] to-[#7C3AED] rounded-full"
                    initial={{ width: '0%' }}
                    animate={{ width: phase >= 2 ? '30%' : '0%' }}
                    transition={{ duration: 3.5, ease: 'easeOut', delay: 0.8 }}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 w-1/3">
              <div className="flex-1 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#3B82F6] flex items-center justify-center font-black text-white text-sm shadow-[0_0_25px_rgba(59,130,246,0.4)]"
                style={{ fontFamily: 'var(--font-display)' }}>
                RENDER
              </div>
              <div className="h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                <div className="text-[9px] text-white/40 font-mono">Kling 1.6 Pro</div>
              </div>
            </div>
          </div>

          {/* Preset row */}
          <div className="flex gap-2">
            {['Cinematic', 'Neon Noir', 'Dreamscape', 'Ultra HD'].map((preset, i) => (
              <motion.div key={preset}
                className={`flex-1 h-7 rounded-lg flex items-center justify-center text-[8px] font-bold uppercase tracking-wider border ${i === 0 ? 'bg-[#7C3AED]/30 border-[#7C3AED]/60 text-[#a78bfa]' : 'bg-white/5 border-white/10 text-white/40'}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: phase >= 3 ? 1 : 0 }}
                transition={{ delay: 0.1 * i }}
              >
                {preset}
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Glow flare bottom */}
      <motion.div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-40 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at bottom, rgba(124,58,237,0.15), transparent 70%)' }}
        animate={{ opacity: phase >= 3 ? 1 : 0 }}
        transition={{ duration: 1 }}
      />
    </motion.div>
  );
}
