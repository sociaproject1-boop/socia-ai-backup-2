import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 2800),
      setTimeout(() => setPhase(4), 4800),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
      initial={{ opacity: 0, y: 80 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 1.15, filter: 'blur(15px)' }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Title */}
      <div className="absolute top-12 text-center z-30 px-8">
        <motion.div
          className="text-[4vw] font-black text-white tracking-tight uppercase"
          style={{ fontFamily: 'var(--font-display)' }}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          Unlock{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-[#EC4899]">
            Monetization
          </span>
        </motion.div>
        <motion.div
          className="text-[2.2vw] text-white/40 font-mono uppercase tracking-widest mt-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45 }}
        >
          Creator Ecosystem
        </motion.div>
      </div>

      <div className="relative z-20 w-[86%] mt-10 flex flex-col gap-4">

        {/* Goal card */}
        <motion.div
          className="w-full rounded-3xl bg-gradient-to-br from-[#1a1a2e] to-[#0a0a0f] border border-[#7C3AED]/45 p-5 shadow-[0_0_50px_rgba(124,58,237,0.3)] relative overflow-hidden"
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.45, type: 'spring', stiffness: 140 }}
        >
          <div className="absolute -right-8 -top-8 w-36 h-36 bg-[#7C3AED]/25 blur-3xl rounded-full pointer-events-none" />
          <div className="text-white/50 text-[1.8vw] font-bold tracking-widest uppercase mb-1">Creator Goal</div>
          <div className="text-[7vw] font-black text-white leading-none mb-3" style={{ fontFamily: 'var(--font-display)' }}>
            50K <span className="text-[3.5vw] text-[#06B6D4]">SUPPORTERS</span>
          </div>
          <div className="w-full h-3 bg-black/50 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-[#06B6D4] via-[#7C3AED] to-[#EC4899] rounded-full"
              initial={{ width: '18%' }}
              animate={{ width: phase >= 2 ? '82%' : '18%' }}
              transition={{ duration: 2.2, ease: 'easeOut' }}
            />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[1.5vw] text-white/30 font-mono">0</span>
            <motion.span
              className="text-[1.5vw] text-[#06B6D4] font-mono font-bold"
              initial={{ opacity: 0 }}
              animate={{ opacity: phase >= 2 ? 1 : 0 }}
            >
              41,200 / 50,000
            </motion.span>
          </div>
        </motion.div>

        {/* Creator benefits grid */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Premium AI Tools', color: '#7C3AED' },
            { label: '100% Rev Share', color: '#EC4899' },
            { label: 'Pro Render Nodes', color: '#06B6D4' },
            { label: 'Verified Creator', color: '#F59E0B' },
          ].map(({ label, color }, i) => (
            <motion.div key={i}
              className="bg-white/5 border border-white/10 rounded-2xl p-3 flex items-center gap-3"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: phase >= 1 ? 1 : 0, y: phase >= 1 ? 0 : 16 }}
              transition={{ delay: 0.7 + i * 0.1, type: 'spring' }}
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ background: `${color}22`, border: `1px solid ${color}55` }}>
                <div className="w-3 h-3 rounded-full" style={{ background: color }} />
              </div>
              <span className="text-[2vw] font-bold text-white/90" style={{ fontFamily: 'var(--font-display)' }}>{label}</span>
            </motion.div>
          ))}
        </div>

        {/* Ecosystem tagline */}
        <motion.div
          className="text-center text-[2.5vw] font-bold text-transparent bg-clip-text bg-gradient-to-r from-white/60 to-white/30"
          initial={{ opacity: 0 }}
          animate={{ opacity: phase >= 3 ? 1 : 0 }}
          transition={{ duration: 0.8 }}
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Not just AI. A creator-powered ecosystem.
        </motion.div>
      </div>
    </motion.div>
  );
}
