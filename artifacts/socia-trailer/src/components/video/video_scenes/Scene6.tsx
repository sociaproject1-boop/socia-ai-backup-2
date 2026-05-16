import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { SociaLogo } from '../SociaLogo';

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 1000),
      setTimeout(() => setPhase(2), 3000),
      setTimeout(() => setPhase(3), 6500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden bg-[#0a0a0f]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.08 }}
      transition={{ duration: 1.4 }}
    >
      {/* Energy pulse on mount */}
      <motion.div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, #7C3AED, transparent 65%)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.5, 0] }}
        transition={{ duration: 2.2, ease: 'easeOut' }}
      />

      {/* Floating particles */}
      {Array.from({ length: 12 }, (_, i) => (
        <motion.div key={i}
          className="absolute rounded-full pointer-events-none"
          style={{
            width: 3 + (i % 3) * 2,
            height: 3 + (i % 3) * 2,
            background: i % 3 === 0 ? '#7C3AED' : i % 3 === 1 ? '#EC4899' : '#06B6D4',
            left: `${8 + i * 7}%`,
            top: `${15 + (i * 17) % 65}%`,
            opacity: 0.6,
          }}
          animate={{
            y: [0, -(20 + i * 5), 0],
            opacity: [0.3, 0.8, 0.3],
          }}
          transition={{
            duration: 3 + i * 0.4,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.3,
          }}
        />
      ))}

      {/* Outer ring glow */}
      <motion.div
        className="absolute w-[60vw] h-[60vw] rounded-full border border-[#7C3AED]/20 pointer-events-none"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: phase >= 1 ? 1 : 0 }}
        transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.div
        className="absolute w-[40vw] h-[40vw] rounded-full border border-[#EC4899]/20 pointer-events-none"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: phase >= 1 ? 1 : 0 }}
        transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
      />

      {/* Logo */}
      <motion.div
        className="relative z-20 flex flex-col items-center"
        initial={{ scale: 0.4, opacity: 0, filter: 'blur(20px)' }}
        animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
        transition={{ type: 'spring', stiffness: 90, damping: 20, delay: 0.2 }}
      >
        <SociaLogo />
      </motion.div>

      {/* Main tagline */}
      <motion.div
        className="relative z-20 mt-12 text-center px-8"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: phase >= 1 ? 1 : 0, y: phase >= 1 ? 0 : 24 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      >
        <div
          className="text-[4.5vw] font-black tracking-[0.15em] text-white/85 uppercase"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          The Future Of
        </div>
        <div
          className="text-[5.5vw] font-black tracking-[0.08em] text-transparent bg-clip-text bg-gradient-to-r from-[#06B6D4] to-[#EC4899] uppercase mt-1"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          AI Creators
        </div>
      </motion.div>

      {/* Voice-over caption */}
      <motion.div
        className="relative z-20 mt-10 text-center px-12"
        initial={{ opacity: 0 }}
        animate={{ opacity: phase >= 2 ? 1 : 0 }}
        transition={{ duration: 1.2 }}
      >
        <p className="text-[2.8vw] text-white/45 italic leading-relaxed">
          "This isn't just another AI app."
        </p>
        <motion.p
          className="text-[3.2vw] text-white/70 font-bold mt-2"
          style={{ fontFamily: 'var(--font-display)' }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: phase >= 2 ? 1 : 0, y: phase >= 2 ? 0 : 10 }}
          transition={{ delay: 0.8 }}
        >
          "This is the future of creators."
        </motion.p>
      </motion.div>

      {/* Final fade to dark */}
      <motion.div
        className="absolute inset-0 bg-black pointer-events-none z-40"
        initial={{ opacity: 0 }}
        animate={{ opacity: phase >= 3 ? 1 : 0 }}
        transition={{ duration: 2 }}
      />
    </motion.div>
  );
}
