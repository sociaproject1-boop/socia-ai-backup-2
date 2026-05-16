import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),   
      setTimeout(() => setPhase(2), 1200),  
      setTimeout(() => setPhase(3), 2500),  
      setTimeout(() => setPhase(4), 5000),  
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
      initial={{ opacity: 0, clipPath: 'circle(0% at 50% 50%)' }}
      animate={{ opacity: 1, clipPath: 'circle(150% at 50% 50%)' }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute bottom-20 z-30 w-full px-8 text-center">
        <motion.h2 
          className="text-[5vw] font-bold text-white tracking-tight leading-none"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          GENERATE STUNNING<br/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#EC4899] to-[#7C3AED]">VISUALS</span>
        </motion.h2>
      </div>

      {/* Grid of images/videos */}
      <div className="absolute inset-0 flex items-center justify-center z-20 mt-[-10vh]">
        <div className="w-[80vw] aspect-square relative">
          <motion.div 
            className="absolute top-0 left-0 w-[60%] h-[60%] rounded-2xl bg-gradient-to-br from-[#7C3AED]/40 to-transparent border border-white/20 backdrop-blur-md overflow-hidden"
            initial={{ x: -100, opacity: 0, rotate: -10 }}
            animate={{ x: 0, opacity: 1, rotate: -5 }}
            transition={{ type: "spring", stiffness: 100, delay: 0.5 }}
          >
            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=600&auto=format&fit=crop')] bg-cover bg-center mix-blend-overlay opacity-80" />
          </motion.div>
          
          <motion.div 
            className="absolute bottom-0 right-0 w-[65%] h-[65%] rounded-2xl bg-gradient-to-br from-[#06B6D4]/40 to-transparent border border-white/20 backdrop-blur-md overflow-hidden"
            initial={{ x: 100, opacity: 0, rotate: 10 }}
            animate={{ x: 0, opacity: 1, rotate: 5 }}
            transition={{ type: "spring", stiffness: 100, delay: 0.8 }}
          >
            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=600&auto=format&fit=crop')] bg-cover bg-center mix-blend-overlay opacity-80" />
          </motion.div>

          <motion.div 
            className="absolute top-[20%] left-[20%] w-[60%] h-[60%] rounded-2xl bg-black border border-[#EC4899]/50 shadow-[0_0_60px_rgba(236,72,153,0.4)] overflow-hidden flex items-center justify-center"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 150, delay: 1.2 }}
          >
             <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1634152962476-4b8a00e1915c?q=80&w=600&auto=format&fit=crop')] bg-cover bg-center opacity-90" />
             
             {/* Progress overlay */}
             {phase < 3 && (
               <motion.div className="absolute inset-0 bg-black/80 flex items-center justify-center flex-col gap-4 backdrop-blur-sm"
                 exit={{ opacity: 0 }}
               >
                 <div className="w-16 h-16 rounded-full border-4 border-white/20 border-t-[#EC4899] animate-spin" />
                 <div className="text-white font-bold text-sm tracking-widest">RENDERING...</div>
               </motion.div>
             )}
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
