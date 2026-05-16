import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { SociaLogo } from '../SociaLogo';

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 1000),  // Subtext reveals
      setTimeout(() => setPhase(2), 3000),  // Extra glow
      setTimeout(() => setPhase(3), 6000),  // Final fade
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden bg-[#0a0a0f]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.5 }}
    >
      {/* Massive energy pulse */}
      <motion.div 
        className="absolute inset-0 z-0 bg-[#7C3AED] mix-blend-screen"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.4, 0] }}
        transition={{ duration: 2, ease: "easeOut" }}
      />

      <div className="relative z-20 flex flex-col items-center justify-center">
        <motion.div
          initial={{ scale: 0.5, opacity: 0, filter: 'blur(20px)' }}
          animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
          transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.2 }}
        >
          <SociaLogo className="scale-150 mb-12" />
        </motion.div>

        <motion.div
          className="mt-8 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: phase >= 1 ? 1 : 0, y: phase >= 1 ? 0 : 20 }}
          transition={{ duration: 1, ease: "easeOut" }}
        >
          <div className="text-[4vw] font-black tracking-[0.2em] text-white/90 uppercase">
            The Future Of
          </div>
          <div className="text-[5vw] font-black tracking-[0.1em] text-transparent bg-clip-text bg-gradient-to-r from-[#06B6D4] to-[#EC4899] uppercase mt-1">
            AI Creators
          </div>
        </motion.div>
      </div>

    </motion.div>
  );
}
