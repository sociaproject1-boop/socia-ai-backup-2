import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 600),   
      setTimeout(() => setPhase(2), 1500),  
      setTimeout(() => setPhase(3), 2800),  
      setTimeout(() => setPhase(4), 4500),  
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
      initial={{ opacity: 0, y: 100 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 1.2, filter: 'blur(15px)' }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute top-16 text-center z-30">
        <motion.h2 
          className="text-[4.5vw] font-bold text-white tracking-tight uppercase"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          Unlock <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-[#EC4899]">Monetization</span>
        </motion.h2>
      </div>

      <div className="relative z-20 w-[85%] mt-12 flex flex-col gap-6">
        
        {/* Goal Card */}
        <motion.div 
          className="w-full rounded-3xl bg-gradient-to-br from-[#1a1a2e] to-[#0a0a0f] border border-[#7C3AED]/40 p-6 shadow-[0_0_40px_rgba(124,58,237,0.3)] relative overflow-hidden"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, type: "spring" }}
        >
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-[#7C3AED]/30 blur-3xl rounded-full" />
          
          <div className="text-white/60 text-xs font-bold tracking-widest uppercase mb-2">Creator Goal</div>
          <div className="text-4xl font-black text-white mb-4">50K <span className="text-xl text-[#06B6D4]">FUNDS</span></div>
          
          <div className="w-full h-3 bg-black/50 rounded-full overflow-hidden">
             <motion.div className="h-full bg-gradient-to-r from-[#06B6D4] via-[#7C3AED] to-[#EC4899]"
               initial={{ width: "20%" }}
               animate={{ width: phase >= 2 ? "85%" : "20%" }}
               transition={{ duration: 2, ease: "easeOut" }}
             />
          </div>
        </motion.div>

        {/* Benefits Grid */}
        <div className="grid grid-cols-2 gap-4">
          {["Premium Tools", "100% Rev Share", "Pro Render Nodes", "Verified Badge"].map((benefit, i) => (
            <motion.div key={i}
              className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center text-center gap-2"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: phase >= 1 ? 1 : 0, y: phase >= 1 ? 0 : 20 }}
              transition={{ delay: 0.8 + i*0.1 }}
            >
               <div className="w-8 h-8 rounded-full bg-[#7C3AED]/20 text-[#EC4899] flex items-center justify-center">
                 ★
               </div>
               <span className="text-xs font-bold text-white/90">{benefit}</span>
            </motion.div>
          ))}
        </div>

      </div>

    </motion.div>
  );
}
