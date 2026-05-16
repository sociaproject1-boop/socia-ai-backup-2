import { motion, AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';
import { useVideoPlayer } from '@/lib/video';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';
import { Scene6 } from './video_scenes/Scene6';

export const SCENE_DURATIONS: Record<string, number> = {
  hook:     3000,
  studio:   6000,
  generate: 6000,
  gpt:      4000,
  monetize: 7000,
  outro:    9000,
};

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  hook:     Scene1,
  studio:   Scene2,
  generate: Scene3,
  gpt:      Scene4,
  monetize: Scene5,
  outro:    Scene6,
};

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentScene, currentSceneKey } = useVideoPlayer({ durations, loop });

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '') as keyof typeof SCENE_DURATIONS;
  const sceneIndex = Object.keys(SCENE_DURATIONS).indexOf(baseSceneKey);
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  // Persistent midground orb positions per scene
  const orbPositions = [
    { x: '-30%', y: '-20%' },
    { x: '15%',  y: '30%'  },
    { x: '-15%', y: '40%'  },
    { x: '25%',  y: '-10%' },
    { x: '-5%',  y: '20%'  },
    { x: '0%',   y: '0%'   },
  ];
  const pinkPositions = [
    { x: '30%',  y: '20%'  },
    { x: '-20%', y: '-10%' },
    { x: '10%',  y: '-30%' },
    { x: '-25%', y: '15%'  },
    { x: '20%',  y: '-20%' },
    { x: '0%',   y: '0%'   },
  ];

  const safeIndex = Math.min(sceneIndex >= 0 ? sceneIndex : 0, orbPositions.length - 1);

  return (
    <div
      className="relative w-full h-screen overflow-hidden bg-[#0a0a0f] text-white"
      style={{ fontFamily: 'var(--font-display)' }}
    >
      {/* Persistent video background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[#0a0a0f]/80 z-10" />
        <video
          src={`${import.meta.env.BASE_URL}videos/ui-lines.mp4`}
          autoPlay loop muted playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-25"
          style={{ display: sceneIndex < 3 ? 'block' : 'none' }}
        />
        <video
          src={`${import.meta.env.BASE_URL}videos/energy-core.mp4`}
          autoPlay loop muted playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-35"
          style={{ display: sceneIndex >= 3 ? 'block' : 'none' }}
        />
      </div>

      {/* Persistent purple orb — moves between scenes */}
      <motion.div
        className="absolute w-[120vw] h-[120vw] rounded-full blur-[100px] mix-blend-screen opacity-[0.18] pointer-events-none z-10"
        style={{ background: 'radial-gradient(circle, #7C3AED, transparent 65%)' }}
        animate={orbPositions[safeIndex]}
        transition={{ duration: 2.5, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Persistent pink orb */}
      <motion.div
        className="absolute w-[90vw] h-[90vw] rounded-full blur-[80px] mix-blend-screen opacity-[0.12] pointer-events-none z-10 right-0 bottom-0"
        style={{ background: 'radial-gradient(circle, #EC4899, transparent 65%)' }}
        animate={pinkPositions[safeIndex]}
        transition={{ duration: 3, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Persistent scan line accent — travels across scenes */}
      <motion.div
        className="absolute h-[1px] pointer-events-none z-20"
        style={{ background: 'linear-gradient(to right, transparent, #7C3AED, #06B6D4, transparent)' }}
        animate={{
          left: ['5%', '10%', '15%', '5%', '0%', '20%'][safeIndex],
          width: ['60%', '80%', '40%', '70%', '90%', '55%'][safeIndex],
          top: ['45%', '55%', '35%', '65%', '50%', '48%'][safeIndex],
          opacity: sceneIndex === 5 ? 0 : 0.6,
        }}
        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
      />

      {/* Scene foreground — only scene-specific content mounts/unmounts */}
      <div className="absolute inset-0 z-20">
        <AnimatePresence mode="popLayout">
          {SceneComponent && <SceneComponent key={currentSceneKey} />}
        </AnimatePresence>
      </div>

      {/* Vignette overlay */}
      <div
        className="absolute inset-0 z-30 pointer-events-none"
        style={{ boxShadow: 'inset 0 0 120px rgba(0,0,0,0.85)' }}
      />
    </div>
  );
}
