import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 100),
      setTimeout(() => setPhase(2), 600),
      setTimeout(() => setPhase(3), 1100),
      setTimeout(() => setPhase(4), 1600),
      setTimeout(() => setPhase(5), 2100),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const words = ["CREATE.", "GENERATE.", "MONETIZE.", "DOMINATE."];

  return (
    <motion.div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0f] overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
      transition={{ duration: 0.4 }}
    >
      {/* Rapid flash effect */}
      <div className="absolute inset-0 z-0">
        {phase > 0 && phase < 5 && (
          <motion.div
            className="absolute inset-0 bg-white"
            initial={{ opacity: 0.6 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            key={`flash-${phase}`}
          />
        )}
      </div>

      {/* Floating accent shapes */}
      <motion.div
        className="absolute top-[15%] left-[8%] w-32 h-32 rounded-full border border-[#7C3AED]/30"
        animate={{ y: [0, -20, 0], rotate: [0, 180, 360] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-[20%] right-[10%] w-20 h-20 rounded-full border border-[#EC4899]/20"
        animate={{ y: [0, 15, 0], scale: [1, 1.2, 1] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="relative z-10 flex flex-col items-center justify-center w-full">
        {words.map((word, index) => (
          <div key={word} className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {phase === index + 1 && (
              <motion.h1
                className="text-[13vw] font-black italic tracking-tighter text-white uppercase leading-none"
                style={{ fontFamily: 'var(--font-display)' }}
                initial={{ scale: 0.4, opacity: 0, filter: 'blur(20px)' }}
                animate={{ scale: 1.1, opacity: 1, filter: 'blur(0px)' }}
                transition={{ type: 'spring', stiffness: 280, damping: 22 }}
              >
                {word.split('').map((char, i) => (
                  <motion.span key={i} className="inline-block"
                    initial={{ y: 60, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: i * 0.025, type: 'spring', stiffness: 400, damping: 30 }}
                  >
                    {char}
                  </motion.span>
                ))}
              </motion.h1>
            )}
          </div>
        ))}

        {/* Tagline — always in DOM, animate via phase */}
        <motion.div
          className="text-center w-full px-8"
          initial={{ opacity: 0, y: 40, filter: 'blur(10px)' }}
          animate={phase >= 5 ? { opacity: 1, y: 0, filter: 'blur(0px)' } : { opacity: 0, y: 40, filter: 'blur(10px)' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-[7vw] font-bold leading-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400" style={{ fontFamily: 'var(--font-display)' }}>
            What if <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#7C3AED] to-[#EC4899]">ONE</span> app
          </h2>
          <h2 className="text-[7vw] font-bold leading-tight text-white" style={{ fontFamily: 'var(--font-display)' }}>
            could change everything?
          </h2>
        </motion.div>
      </div>

      {/* Horizontal scan line */}
      <motion.div
        className="absolute left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#7C3AED] to-transparent pointer-events-none"
        initial={{ top: '-5%', opacity: 0 }}
        animate={{ top: '110%', opacity: [0, 0.8, 0] }}
        transition={{ duration: 1.5, ease: 'easeInOut', delay: 0.2 }}
      />
    </motion.div>
  );
}
