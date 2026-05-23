import { Camera, ImageIcon, Loader2 } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Button } from './Button';

interface CameraCaptureProps {
  onCapture: (data: { base64: string; mimeType: string }) => void;
  overlay?: ReactNode;
}

type CameraPermission = 'pending' | 'granted' | 'denied';

export function CameraCapture({ onCapture, overlay }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);

  const [cameraPermission, setCameraPermission] =
    useState<CameraPermission>('pending');
  const [cameraActive, setCameraActive] = useState(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraPermission('denied');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1080 },
          height: { ideal: 1512 },
        },
      });
      if (!mountedRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);
      }
      setCameraPermission('granted');
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('Camera permission error:', err);
      setCameraPermission('denied');
      setCameraActive(false);
    }
  }, []);

  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const viewfinderAR = 5 / 7;
    const videoAR = video.videoWidth / video.videoHeight;

    let sx: number, sy: number, sw: number, sh: number;
    if (videoAR > viewfinderAR) {
      sh = video.videoHeight;
      sw = sh * viewfinderAR;
      sx = (video.videoWidth - sw) / 2;
      sy = 0;
    } else {
      sw = video.videoWidth;
      sh = sw / viewfinderAR;
      sx = 0;
      sy = (video.videoHeight - sh) / 2;
    }

    canvas.width = sw;
    canvas.height = sh;
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    const base64 = dataUrl.split(',')[1];
    onCapture({ base64, mimeType: 'image/jpeg' });
  }, [onCapture]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      const base64 = result.split(',')[1];
      onCapture({ base64, mimeType: file.type });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  useEffect(() => {
    mountedRef.current = true;
    startCamera();
    return () => {
      mountedRef.current = false;
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  return (
    <div className="rounded-lg overflow-hidden">
      <canvas ref={canvasRef} className="hidden" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        onChange={handleFileSelect}
        className="hidden"
      />

      <div className="relative aspect-[5/7] bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover ${cameraActive ? '' : 'invisible'}`}
        />
        {!cameraActive && cameraPermission === 'pending' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-center p-4">
            <Loader2 size={32} className="text-blue-400 animate-spin mb-3" />
            <p className="text-slate-300 text-sm">
              Waiting for camera permission…
            </p>
          </div>
        )}
        {!cameraActive && cameraPermission === 'denied' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-center p-4">
            <Camera size={32} className="text-slate-500 mb-3" />
            <p className="text-slate-300 text-sm font-medium mb-1">
              Camera unavailable
            </p>
            <p className="text-slate-400 text-xs">
              Permission denied or device has no camera. Upload a photo below.
            </p>
          </div>
        )}
        {overlay && (
          <div className="absolute inset-0 pointer-events-none">{overlay}</div>
        )}
      </div>

      {cameraActive && (
        <Button
          onClick={captureFrame}
          className="w-full mt-2"
          aria-label="Capture photo"
        >
          <Camera size={16} className="mr-2" />
          Capture
        </Button>
      )}

      <Button
        variant="secondary"
        onClick={() => fileInputRef.current?.click()}
        className="w-full mt-2"
      >
        <ImageIcon size={16} className="mr-2" />
        {cameraActive ? 'Upload from gallery instead' : 'Upload from gallery'}
      </Button>

      {cameraPermission === 'denied' && (
        <Button
          variant="secondary"
          onClick={startCamera}
          className="w-full mt-2"
        >
          <Camera size={16} className="mr-2" />
          Retry camera
        </Button>
      )}
    </div>
  );
}
