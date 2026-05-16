import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 100),   // CREATE
      setTimeout(() => setPhase(2), 600),   // GENERATE
      setTimeout(() => setPhase(3), 1100),  // MONETIZE
      setTimeout(() => setPhase(4), 1600),  // DOMINATE
      setTimeout(() => setPhase(5), 2100),  // What if ONE app
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const words = ["CREATE.", "GENERATE.", "MONETIZE.", "DOMINATE."];

  return (
    <motion.div className="absolute inset-0 flex items-center justify-center bg-black overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
      transition={{ duration: 0.4 }}
    >
      <div className="absolute inset-0 z-0">
        {/* Rapid cinematic flashes */}
        {phase > 0 && phase < 5 && (
          <motion.div 
            className="absolute inset-0 bg-white"
            initial={{ opacity: 0.8 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            key={`flash-${phase}`}
          />
        )}
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center w-full">
        {words.map((word, index) => (
          <div key={word} className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {phase === index + 1 && (
              <motion.h1 
                className="text-[12vw] font-black italic tracking-tighter text-white uppercase"
                initial={{ scale: 0.5, opacity: 0, filter: 'blur(20px)' }}
                animate={{ scale: 1.2, opacity: 1, filter: 'blur(0px)' }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                {word.split('').map((char, i) => (
                  <motion.span key={i} className="inline-block"
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: i * 0.02, type: "spring", stiffness: 400, damping: 30 }}
                  >
                    {char}
                  </motion.span>
                ))}
              </motion.h1>
            )}
          </div>
        ))}

        {phase >= 5 && (
          <motion.div 
            className="text-center w-full px-8"
            initial={{ opacity: 0, y: 30, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <h2 className="text-[6vw] font-bold leading-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
              What if <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#7C3AED] to-[#EC4899]">ONE</span> app
            </h2>
            <h2 className="text-[6vw] font-bold leading-tight text-white">
              could change everything?
            </h2>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
