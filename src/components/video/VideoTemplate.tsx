import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';
import { Scene6 } from './video_scenes/Scene6';

// 35s total max
const SCENE_DURATIONS = { 
  hook: 3000,     // 0-3s
  studio: 6000,   // 3-9s
  generate: 6000, // 9-15s
  gpt: 4000,      // 15-19s
  monetize: 7000, // 19-26s
  outro: 9000     // 26-35s
};

export default function VideoTemplate() {
  const { currentScene } = useVideoPlayer({ durations: SCENE_DURATIONS });

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#0a0a0f] text-white" style={{ fontFamily: 'var(--font-display)' }}>
      
      {/* Persistent Background Layer */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[#0a0a0f] opacity-80 z-10" />
        {currentScene < 3 ? (
          <video 
            src={`${import.meta.env.BASE_URL}videos/ui-lines.mp4`}
            autoPlay loop muted playsInline
            className="absolute inset-0 w-full h-full object-cover opacity-30"
          />
        ) : (
          <video 
            src={`${import.meta.env.BASE_URL}videos/energy-core.mp4`}
            autoPlay loop muted playsInline
            className="absolute inset-0 w-full h-full object-cover opacity-40"
          />
        )}
      </div>

      {/* Persistent Midground Particles & Flares */}
      <motion.div 
        className="absolute inset-0 z-10 pointer-events-none"
        animate={{ opacity: currentScene === 0 ? 0 : 1 }}
        transition={{ duration: 1 }}
      >
        <motion.div 
          className="absolute w-[150vw] h-[150vw] rounded-full blur-[120px] mix-blend-screen opacity-20"
          style={{ background: 'radial-gradient(circle, #7C3AED, transparent 70%)' }}
          animate={{ 
            x: ['-50%', '10%', '-30%'][currentScene % 3], 
            y: ['-20%', '40%', '10%'][currentScene % 3] 
          }}
          transition={{ duration: 4, ease: "easeInOut" }}
        />
        <motion.div 
          className="absolute w-[100vw] h-[100vw] rounded-full blur-[100px] mix-blend-screen opacity-15 right-0 bottom-0"
          style={{ background: 'radial-gradient(circle, #EC4899, transparent 70%)' }}
          animate={{ 
            x: ['20%', '-20%', '10%'][currentScene % 3], 
            y: ['10%', '-30%', '-10%'][currentScene % 3] 
          }}
          transition={{ duration: 5, ease: "easeInOut" }}
        />
      </motion.div>

      {/* Foreground Scenes */}
      <div className="absolute inset-0 z-20">
        <AnimatePresence mode="popLayout">
          {currentScene === 0 && <Scene1 key="hook" />}
          {currentScene === 1 && <Scene2 key="studio" />}
          {currentScene === 2 && <Scene3 key="generate" />}
          {currentScene === 3 && <Scene4 key="gpt" />}
          {currentScene === 4 && <Scene5 key="monetize" />}
          {currentScene === 5 && <Scene6 key="outro" />}
        </AnimatePresence>
      </div>

      {/* Global Vignette */}
      <div className="absolute inset-0 z-50 pointer-events-none box-shadow-[inset_0_0_150px_rgba(0,0,0,0.9)]" />
    </div>
  );
}
