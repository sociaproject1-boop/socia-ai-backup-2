import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2600),
      setTimeout(() => setPhase(4), 5000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
      initial={{ opacity: 0, clipPath: 'circle(0% at 50% 50%)' }}
      animate={{ opacity: 1, clipPath: 'circle(150% at 50% 50%)' }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Title at bottom */}
      <div className="absolute bottom-16 z-30 w-full px-8 text-center">
        <motion.h2
          className="text-[5.5vw] font-black text-white tracking-tight leading-none"
          style={{ fontFamily: 'var(--font-display)' }}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          GENERATE STUNNING
        </motion.h2>
        <motion.h2
          className="text-[5.5vw] font-black text-transparent bg-clip-text bg-gradient-to-r from-[#EC4899] to-[#7C3AED] tracking-tight leading-none"
          style={{ fontFamily: 'var(--font-display)' }}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
        >
          VISUALS
        </motion.h2>
      </div>

      {/* Image grid */}
      <div className="absolute inset-0 flex items-center justify-center z-20" style={{ marginTop: '-8vh' }}>
        <div className="w-[78vw] aspect-square relative">

          {/* Back-left card */}
          <motion.div
            className="absolute top-0 left-0 w-[60%] h-[60%] rounded-2xl border border-white/20 backdrop-blur-sm overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.3), rgba(6,182,212,0.2))' }}
            initial={{ x: -80, opacity: 0, rotate: -12 }}
            animate={{ x: 0, opacity: 1, rotate: -6 }}
            transition={{ type: 'spring', stiffness: 90, delay: 0.5 }}
          >
            <div
              className="absolute inset-0 opacity-70 mix-blend-overlay"
              style={{ background: 'url(https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=600&auto=format&fit=crop) center/cover' }}
            />
          </motion.div>

          {/* Back-right card */}
          <motion.div
            className="absolute bottom-0 right-0 w-[62%] h-[62%] rounded-2xl border border-white/20 backdrop-blur-sm overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.3), rgba(236,72,153,0.2))' }}
            initial={{ x: 80, opacity: 0, rotate: 12 }}
            animate={{ x: 0, opacity: 1, rotate: 6 }}
            transition={{ type: 'spring', stiffness: 90, delay: 0.7 }}
          >
            <div
              className="absolute inset-0 opacity-70 mix-blend-overlay"
              style={{ background: 'url(https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=600&auto=format&fit=crop) center/cover' }}
            />
          </motion.div>

          {/* Center focus card — main AI result */}
          <motion.div
            className="absolute top-[18%] left-[18%] w-[64%] h-[64%] rounded-2xl bg-black border border-[#EC4899]/60 shadow-[0_0_80px_rgba(236,72,153,0.5)] overflow-hidden flex items-center justify-center"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 140, delay: 1.1 }}
          >
            <div
              className="absolute inset-0"
              style={{ background: 'url(https://images.unsplash.com/photo-1634152962476-4b8a00e1915c?q=80&w=600&auto=format&fit=crop) center/cover' }}
            />

            {/* Rendering overlay */}
            <motion.div
              className="absolute inset-0 bg-black/85 flex items-center justify-center flex-col gap-4 backdrop-blur-sm"
              initial={{ opacity: 1 }}
              animate={{ opacity: phase >= 3 ? 0 : 1 }}
              transition={{ duration: 0.8 }}
            >
              <div className="w-12 h-12 rounded-full border-4 border-white/20 border-t-[#EC4899] animate-spin" />
              <div className="text-white font-bold text-[10px] tracking-[0.3em] uppercase font-mono">RENDERING AI...</div>
              <div className="w-32 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-[#7C3AED] to-[#EC4899] rounded-full"
                  initial={{ width: '0%' }}
                  animate={{ width: phase >= 3 ? '100%' : '70%' }}
                  transition={{ duration: 1.5 }}
                />
              </div>
            </motion.div>

            {/* Completion flash */}
            {phase >= 3 && (
              <motion.div
                className="absolute inset-0 bg-white"
                initial={{ opacity: 0.5 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
              />
            )}
          </motion.div>
        </div>
      </div>

      {/* Speed ramp scan */}
      <motion.div
        className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#06B6D4] to-transparent pointer-events-none"
        animate={{ top: ['0%', '100%'], opacity: [0, 1, 0] }}
        transition={{ duration: 1.2, ease: 'easeInOut', delay: 1 }}
      />
    </motion.div>
  );
}
