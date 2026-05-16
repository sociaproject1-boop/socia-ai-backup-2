import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),   // UI enters
      setTimeout(() => setPhase(2), 1500),  // Render queue
      setTimeout(() => setPhase(3), 3000),  // Glows
      setTimeout(() => setPhase(4), 5000),  // Exit prep
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
      initial={{ opacity: 0, scale: 1.2 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, y: -100, filter: 'blur(20px)' }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute top-16 left-8 z-30">
        <motion.h2 
          className="text-[4vw] font-bold text-white tracking-tight"
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          AI CINEMATIC<br/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#7C3AED] to-[#06B6D4]">STUDIO</span>
        </motion.h2>
      </div>

      <div className="relative z-20 w-[90%] h-[60%] mt-20 perspective-[1000px]">
        <motion.div 
          className="w-full h-full rounded-2xl border border-white/10 bg-[#0d0d1a]/80 backdrop-blur-xl p-4 flex flex-col gap-4 shadow-[0_0_50px_rgba(124,58,237,0.2)] overflow-hidden"
          initial={{ rotateX: 20, y: 100, opacity: 0 }}
          animate={{ rotateX: 0, y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.3 }}
        >
          {/* Timeline UI mock */}
          <div className="w-full h-1/2 rounded-xl bg-black/50 overflow-hidden relative border border-white/5">
             <motion.div 
               className="absolute top-0 bottom-0 w-1 bg-[#EC4899] shadow-[0_0_20px_#EC4899]"
               initial={{ left: "10%" }}
               animate={{ left: "90%" }}
               transition={{ duration: 4, ease: "linear" }}
             />
             <div className="absolute inset-0 flex items-center px-4 gap-2">
                {[1,2,3,4].map(i => (
                  <motion.div key={i} className="h-16 flex-1 rounded bg-[#7C3AED]/20 border border-[#7C3AED]/50"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: phase >= 1 ? 1 : 0, scale: phase >= 1 ? 1 : 0.8 }}
                    transition={{ delay: 0.5 + i*0.1 }}
                  />
                ))}
             </div>
          </div>

          {/* Render controls */}
          <div className="flex gap-4 h-1/3">
             <div className="flex-1 rounded-xl bg-black/40 p-3 border border-white/5 flex flex-col justify-between">
                <div className="text-xs text-white/50 uppercase">Render Queue</div>
                <div className="flex flex-col gap-2">
                  <motion.div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                    <motion.div className="h-full bg-gradient-to-r from-[#06B6D4] to-[#7C3AED]"
                      initial={{ width: "0%" }}
                      animate={{ width: phase >= 2 ? "100%" : "0%" }}
                      transition={{ duration: 2, ease: "easeOut" }}
                    />
                  </motion.div>
                  <motion.div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                    <motion.div className="h-full bg-gradient-to-r from-[#06B6D4] to-[#7C3AED]"
                      initial={{ width: "0%" }}
                      animate={{ width: phase >= 2 ? "60%" : "0%" }}
                      transition={{ duration: 3, ease: "easeOut", delay: 0.5 }}
                    />
                  </motion.div>
                </div>
             </div>
             <div className="w-1/3 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#3B82F6] p-3 flex items-center justify-center font-bold text-white shadow-[0_0_30px_rgba(59,130,246,0.5)]">
               RENDER
             </div>
          </div>
        </motion.div>
      </div>

    </motion.div>
  );
}
