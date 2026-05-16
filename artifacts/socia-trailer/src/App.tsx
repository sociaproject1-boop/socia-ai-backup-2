import { lazy, Suspense } from 'react';
import VideoWithControls from "@/components/video/VideoWithControls";

const ExportPage = lazy(() => import('@/components/video/ExportPage'));

const isExportMode =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('export');

export default function App() {
  if (isExportMode) {
    return (
      <Suspense fallback={<div className="w-full h-screen bg-[#0a0a0f]" />}>
        <ExportPage />
      </Suspense>
    );
  }
  return <VideoWithControls />;
}
