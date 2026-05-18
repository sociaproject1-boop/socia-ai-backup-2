import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Loader2, Video, CheckCircle, AlertCircle } from 'lucide-react';
import VideoTemplate, { SCENE_DURATIONS } from './VideoTemplate';

type ExportState = 'idle' | 'requesting' | 'recording' | 'uploading' | 'done' | 'error';

const TOTAL_DURATION_MS = Object.values(SCENE_DURATIONS).reduce((a, b) => a + b, 0);
const RECORDING_BUFFER_MS = 1500;
const RECORDING_TOTAL_MS = TOTAL_DURATION_MS + RECORDING_BUFFER_MS;

export default function ExportPage() {
  const [exportState, setExportState] = useState<ExportState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(Math.ceil(TOTAL_DURATION_MS / 1000));
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [mountKey, setMountKey] = useState(0);
  const [isRecordingPass, setIsRecordingPass] = useState(false);

  const chunksRef = useRef<Blob[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Countdown ticker during recording
  useEffect(() => {
    if (exportState === 'recording') {
      setCountdown(Math.ceil(TOTAL_DURATION_MS / 1000));
      countdownRef.current = setInterval(() => {
        setCountdown(c => {
          if (c <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
      return () => {
        if (countdownRef.current) clearInterval(countdownRef.current);
      };
    }
    return undefined;
  }, [exportState]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
    };
  }, []);

  const handleRecorderStop = useCallback(async () => {
    setExportState('uploading');
    setIsRecordingPass(false);

    const blob = new Blob(chunksRef.current, { type: 'video/webm' });
    chunksRef.current = [];

    try {
      const resp = await fetch('/api/export/trailer/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'video/webm' },
        body: blob,
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || `Server error ${resp.status}`);
      }

      const mp4Blob = await resp.blob();
      const url = URL.createObjectURL(mp4Blob);
      setDownloadUrl(url);
      setExportState('done');

      // Auto-trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = 'socia-trailer.mp4';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setExportState('error');
    }
  }, []);

  const startExport = useCallback(async () => {
    setError(null);
    setExportState('requesting');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false,
        // @ts-ignore — Chrome 107+ hint for current-tab capture
        preferCurrentTab: true,
      } as DisplayMediaStreamOptions);
    } catch (err) {
      setError('Screen share cancelled or not supported.');
      setExportState('idle');
      return;
    }

    // Pick best supported mime type
    const mimeType =
      MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : '';

    const recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 8_000_000,
    });
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      handleRecorderStop();
    };

    // Hook into useVideoPlayer lifecycle
    window.startRecording = async () => {
      recorder.start(1000); // collect chunks every second
      setExportState('recording');
    };

    window.stopRecording = () => {
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
      if (recorder.state !== 'inactive') recorder.stop();
      window.startRecording = undefined;
      window.stopRecording = undefined;
    };

    // Safety: stop after total duration + large buffer
    safetyTimerRef.current = setTimeout(() => {
      window.stopRecording?.();
    }, RECORDING_TOTAL_MS + 5000);

    // Mount the recording pass (loop=false so stopRecording fires once)
    setIsRecordingPass(true);
    setMountKey(k => k + 1);
  }, [handleRecorderStop]);

  const progress = exportState === 'recording'
    ? Math.max(0, Math.min(100, ((Math.ceil(TOTAL_DURATION_MS / 1000) - countdown) / Math.ceil(TOTAL_DURATION_MS / 1000)) * 100))
    : 0;

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#0a0a0f]">
      {/* VideoTemplate always renders behind the UI */}
      <VideoTemplate
        key={mountKey}
        loop={!isRecordingPass}
        durations={SCENE_DURATIONS}
      />

      {/* Export UI overlay */}
      {exportState !== 'done' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-end pointer-events-none pb-12 px-6">
          <div className="pointer-events-auto w-full max-w-sm">

            {/* Status card */}
            {exportState === 'idle' && (
              <div className="flex flex-col items-center gap-4">
                <p className="text-white/50 text-xs text-center tracking-wide">
                  Click to record this page and export as MP4
                </p>
                <button
                  onClick={startExport}
                  className="flex items-center gap-2.5 bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white font-bold text-sm px-6 py-3.5 rounded-2xl shadow-[0_0_30px_rgba(124,58,237,0.5)] hover:opacity-90 active:scale-[0.98] transition-all"
                >
                  <Video className="w-4 h-4" />
                  Export MP4
                </button>
              </div>
            )}

            {exportState === 'requesting' && (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-6 h-6 text-[#7C3AED] animate-spin" />
                <p className="text-white/70 text-sm text-center">
                  Requesting screen share…<br />
                  <span className="text-white/40 text-xs">Select <strong className="text-white/60">this tab</strong> in the dialog</span>
                </p>
              </div>
            )}

            {exportState === 'recording' && (
              <div className="flex flex-col items-center gap-3 w-full">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-white font-bold text-sm">Recording — {countdown}s remaining</span>
                </div>
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#7C3AED] to-[#EC4899] rounded-full transition-[width] duration-1000"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-white/40 text-xs text-center">
                  Keep this tab visible. Processing will start automatically.
                </p>
              </div>
            )}

            {exportState === 'uploading' && (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-6 h-6 text-[#06B6D4] animate-spin" />
                <p className="text-white/70 text-sm text-center">
                  Converting to MP4…<br />
                  <span className="text-white/40 text-xs">This takes about 10–20 seconds</span>
                </p>
              </div>
            )}

            {exportState === 'error' && (
              <div className="flex flex-col items-center gap-3">
                <AlertCircle className="w-6 h-6 text-red-400" />
                <p className="text-red-300 text-sm text-center">{error}</p>
                <button
                  onClick={() => { setExportState('idle'); setError(null); }}
                  className="text-white/60 text-xs hover:text-white underline"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Done state */}
      {exportState === 'done' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-5 p-8 rounded-3xl bg-[#0d0d1a]/90 border border-white/10 max-w-xs text-center">
            <CheckCircle className="w-10 h-10 text-emerald-400" />
            <div>
              <p className="text-white font-bold text-lg">Export complete!</p>
              <p className="text-white/50 text-xs mt-1">Your trailer.mp4 should have downloaded automatically.</p>
            </div>
            {downloadUrl && (
              <a
                href={downloadUrl}
                download="socia-trailer.mp4"
                className="flex items-center gap-2 bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white font-bold text-sm px-5 py-3 rounded-xl"
              >
                <Download className="w-4 h-4" />
                Download again
              </a>
            )}
            <button
              onClick={() => { setExportState('idle'); setDownloadUrl(null); setIsRecordingPass(false); setMountKey(k => k + 1); }}
              className="text-white/40 text-xs hover:text-white"
            >
              Record again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
