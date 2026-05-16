import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),   
      setTimeout(() => setPhase(2), 1500),  
      setTimeout(() => setPhase(3), 2500),  
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div className="absolute inset-0 flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, filter: 'blur(20px)', rotate: 5 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
    >
      <div className="absolute top-16 right-8 z-30 text-right">
        <motion.h2 
          className="text-[6vw] font-bold text-white tracking-tight"
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          SOCIA <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#06B6D4] to-[#7C3AED]">GPT</span>
        </motion.h2>
      </div>

      <div className="relative z-20 w-[85%] mt-10">
        <motion.div 
          className="w-full rounded-3xl border border-white/10 bg-[#0d0d1a]/90 backdrop-blur-2xl p-6 shadow-2xl flex flex-col gap-6"
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          {/* User message */}
          <motion.div 
            className="self-end max-w-[80%] rounded-2xl rounded-tr-sm bg-white/10 p-4 text-sm text-white/90"
            initial={{ opacity: 0, y: 20, scale: 0.9, transformOrigin: 'top right' }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", delay: 0.8 }}
          >
            "Create a futuristic cyberpunk city layout for my next video, dark purple vibes."
          </motion.div>

          {/* AI Response */}
          <motion.div 
            className="self-start max-w-[90%] rounded-2xl rounded-tl-sm bg-gradient-to-br from-[#7C3AED]/20 to-[#EC4899]/20 border border-[#7C3AED]/30 p-4 text-sm text-white relative overflow-hidden"
            initial={{ opacity: 0, y: 20, scale: 0.9, transformOrigin: 'top left' }}
            animate={{ opacity: phase >= 2 ? 1 : 0, y: phase >= 2 ? 0 : 20, scale: phase >= 2 ? 1 : 0.9 }}
            transition={{ type: "spring" }}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-gradient-to-r from-[#7C3AED] to-[#06B6D4] flex items-center justify-center">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              </div>
              <span className="font-bold text-xs uppercase tracking-wider text-[#06B6D4]">Socia GPT</span>
            </div>
            <p className="opacity-90">Generating your cinematic environment now. I've applied the 'Neon Dystopia' preset to match the purple styling.</p>
            
            <motion.div className="mt-4 h-24 rounded-xl bg-black/50 overflow-hidden relative"
               initial={{ opacity: 0 }}
               animate={{ opacity: phase >= 3 ? 1 : 0 }}
               transition={{ duration: 0.5 }}
            >
               <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=600&auto=format&fit=crop')] bg-cover bg-center opacity-80" />
            </motion.div>
          </motion.div>
          
          {/* Input field mock */}
          <div className="h-12 w-full rounded-full bg-black/50 border border-white/10 flex items-center px-4 mt-2">
             <div className="w-full h-full flex items-center text-white/30 text-xs tracking-wider">
               Type a prompt or upload an asset...
             </div>
             <div className="w-8 h-8 rounded-full bg-[#7C3AED] flex items-center justify-center shrink-0">
               <svg viewBox="0 0 24 24" className="w-4 h-4 text-white fill-current"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>
             </div>
          </div>
        </motion.div>
      </div>

    </motion.div>
  );
}
