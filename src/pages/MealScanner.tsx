import { zodResolver } from '@hookform/resolvers/zod';
import { Camera, ImageIcon, Minus, Plus, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  CardContent,
  Input,
  Select,
  TextArea,
} from '../components/ui';
import { mealTypes } from '../constants/options';
import { useAppStore } from '../hooks/useAppStore';
import { useCalories } from '../hooks/useCalories';
import { type MealScannerFormData, mealScannerSchema } from '../schemas/forms';
import { analyzeFoodImage, isOpenAIInitialized } from '../services/openai';
import type { AIFoodItem } from '../types';
import { recalculateMacros } from '../utils/calculations';
import { formatDate } from '../utils/date';

interface EditableFoodItem extends AIFoodItem {
  originalPortion: number;
}

type CameraPermission = 'pending' | 'granted' | 'denied';

export function MealScanner() {
  const navigate = useNavigate();
  const { addEntry } = useCalories();
  const isOnline = useAppStore((state) => state.isOnline);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // State
  const [step, setStep] = useState<'capture' | 'analyzing' | 'results'>(
    'capture',
  );
  const [cameraPermission, setCameraPermission] =
    useState<CameraPermission>('pending');
  const [cameraActive, setCameraActive] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageData, setImageData] = useState<{
    base64: string;
    mimeType: string;
  } | null>(null);
  const [results, setResults] = useState<EditableFoodItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // React Hook Form
  const { register, watch } = useForm<MealScannerFormData>({
    resolver: zodResolver(mealScannerSchema),
    defaultValues: {
      mealType: 'lunch',
      description: '',
    },
  });

  const mealType = watch('mealType');
  const description = watch('description');

  // Request camera permission
  const requestCameraPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);
      }

      setCameraPermission('granted');
    } catch (err) {
      console.error('Camera permission error:', err);
      setCameraPermission('denied');
      setCameraActive(false);
    }
  }, []);

  // Stop camera
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

  // Restart camera (after clearing image)
  const restartCamera = useCallback(async () => {
    if (cameraPermission === 'granted') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraActive(true);
        }
      } catch (err) {
        console.error('Camera restart error:', err);
        setCameraPermission('denied');
        setCameraActive(false);
      }
    }
  }, [cameraPermission]);

  // Capture frame from video
  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    // Set canvas size to video size
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0);

    // Get image data
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    const base64 = dataUrl.split(',')[1];

    setImagePreview(dataUrl);
    setImageData({ base64, mimeType: 'image/jpeg' });
    stopCamera();
  }, [stopCamera]);

  // Handle file upload (gallery or camera via input)
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setImagePreview(result);

      const base64 = result.split(',')[1];
      setImageData({ base64, mimeType: file.type });
      stopCamera();
    };
    reader.readAsDataURL(file);

    // Reset input so same file can be selected again
    e.target.value = '';
  };

  // Skip camera and use upload mode
  const skipCamera = () => {
    setCameraPermission('denied');
  };

  // Analyze image
  const handleAnalyze = async () => {
    // If camera is active and no image yet, capture first
    if (cameraActive && !imageData) {
      captureFrame();
      return;
    }

    if (!imageData) {
      setError('Please capture or upload an image first');
      return;
    }

    if (!isOnline) {
      setError('Internet connection required for AI analysis');
      return;
    }

    if (!isOpenAIInitialized()) {
      setError('Please add your OpenAI API key in Settings');
      return;
    }

    setStep('analyzing');
    setIsLoading(true);
    setError(null);

    try {
      const result = await analyzeFoodImage(
        imageData.base64,
        imageData.mimeType,
        description || undefined,
      );

      setResults(
        result.items.map((item) => ({
          ...item,
          originalPortion: item.portion_grams,
        })),
      );
      setStep('results');
    } catch (_err) {
      setError('Failed to analyze image. Please try again or enter manually.');
      setStep('capture');
    } finally {
      setIsLoading(false);
    }
  };

  // Portion change handler
  const handlePortionChange = (index: number, newPortion: number) => {
    setResults((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;

        const recalculated = recalculateMacros(
          item.originalPortion,
          newPortion,
          {
            calories:
              item.calories * (item.originalPortion / item.portion_grams),
            protein_g:
              item.protein_g * (item.originalPortion / item.portion_grams),
            carbs_g: item.carbs_g * (item.originalPortion / item.portion_grams),
            fat_g: item.fat_g * (item.originalPortion / item.portion_grams),
          },
        );

        return {
          ...item,
          portion_grams: newPortion,
          calories: recalculated.calories,
          protein_g: recalculated.protein_g,
          carbs_g: recalculated.carbs_g,
          fat_g: recalculated.fat_g,
        };
      }),
    );
  };

  const handleRemoveItem = (index: number) => {
    setResults((prev) => prev.filter((_, i) => i !== index));
  };

  // Save results
  const handleSave = async () => {
    if (results.length === 0) {
      setError('No food items to save');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      for (const item of results) {
        await addEntry({
          date: formatDate(new Date()),
          meal_type: mealType,
          food_description: item.name,
          portion_grams: item.portion_grams,
          calories: item.calories,
          protein_g: item.protein_g,
          carbs_g: item.carbs_g,
          fat_g: item.fat_g,
          is_ai_generated: true,
        });
      }

      navigate('/calories');
    } catch (_err) {
      setError('Failed to save entries');
    } finally {
      setIsLoading(false);
    }
  };

  // Reset everything
  const handleReset = () => {
    setStep('capture');
    setImagePreview(null);
    setImageData(null);
    setResults([]);
    setError(null);
    if (cameraPermission === 'granted') {
      restartCamera();
    }
  };

  // Clear uploaded image
  const handleClearImage = () => {
    setImagePreview(null);
    setImageData(null);
    if (cameraPermission === 'granted') {
      restartCamera();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const totalCalories = results.reduce((sum, item) => sum + item.calories, 0);
  const totalProtein = results.reduce((sum, item) => sum + item.protein_g, 0);
  const totalCarbs = results.reduce((sum, item) => sum + item.carbs_g, 0);
  const totalFat = results.reduce((sum, item) => sum + item.fat_g, 0);

  // Offline state
  if (!isOnline) {
    return (
      <div className="p-4 pb-20">
        <h1 className="text-xl font-bold text-white mb-6">Meal Scanner</h1>
        <Card>
          <CardContent className="p-6 text-center">
            <div className="w-16 h-16 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <Camera size={32} className="text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">
              Offline Mode
            </h3>
            <p className="text-slate-400 text-sm mb-4">
              Meal scanner requires an internet connection for AI analysis.
            </p>
            <Button
              variant="secondary"
              onClick={() => navigate('/calories?action=add')}
            >
              Add Food Manually
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 pb-20">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold text-white">Meal Scanner</h1>
        {step !== 'capture' && (
          <Button variant="ghost" onClick={handleReset}>
            <X size={18} className="mr-1" />
            Reset
          </Button>
        )}
      </div>

      {error && (
        <div className="bg-red-500/20 text-red-400 px-4 py-2 rounded-lg mb-4">
          {error}
        </div>
      )}

      {/* Hidden elements */}
      <canvas ref={canvasRef} className="hidden" />
      {/* Gallery upload input - no capture attribute to allow gallery selection */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        onChange={handleFileSelect}
        className="hidden"
      />
      {/* Camera capture input for mobile - has capture attribute */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Capture Step */}
      {step === 'capture' && (
        <div className="space-y-4">
          <Select
            label="Meal Type"
            {...register('mealType')}
            options={mealTypes}
          />

          {/* Camera Permission Request */}
          {cameraPermission === 'pending' && !imagePreview && (
            <Card>
              <CardContent className="p-6">
                <div className="text-center">
                  <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Camera size={32} className="text-blue-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">
                    Camera Access
                  </h3>
                  <p className="text-slate-400 text-sm mb-6">
                    Allow camera access to scan your meals in real-time, or
                    upload photos from your gallery.
                  </p>
                  <div className="space-y-3">
                    <Button
                      onClick={requestCameraPermission}
                      className="w-full"
                    >
                      <Camera size={18} className="mr-2" />
                      Enable Camera
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={skipCamera}
                      className="w-full"
                    >
                      <Upload size={18} className="mr-2" />
                      Upload Instead
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Camera Granted - Show Live Feed */}
          {cameraPermission === 'granted' && (
            <Card>
              <CardContent className="p-0 overflow-hidden">
                <div className="relative aspect-[4/3] bg-black">
                  {imagePreview ? (
                    // Captured image preview
                    <>
                      <img
                        src={imagePreview}
                        alt="Food preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={handleClearImage}
                        className="absolute top-2 right-2 p-2 bg-black/50 rounded-full text-white hover:bg-black/70"
                      >
                        <X size={20} />
                      </button>
                    </>
                  ) : (
                    // Live camera feed
                    <>
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                      />
                      {/* Camera loading indicator */}
                      {!cameraActive && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Action buttons for camera mode */}
                <div className="p-4">
                  <Button
                    variant="secondary"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full"
                  >
                    <ImageIcon size={18} className="mr-2" />
                    Upload from Gallery
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Camera Denied - Show Upload Interface */}
          {cameraPermission === 'denied' && (
            <Card>
              <CardContent className="p-0 overflow-hidden">
                <div className="relative aspect-[4/3] bg-slate-800">
                  {imagePreview ? (
                    // Uploaded image preview
                    <>
                      <img
                        src={imagePreview}
                        alt="Food preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={handleClearImage}
                        className="absolute top-2 right-2 p-2 bg-black/50 rounded-full text-white hover:bg-black/70"
                      >
                        <X size={20} />
                      </button>
                    </>
                  ) : (
                    // Upload placeholder
                    <div className="w-full h-full flex flex-col items-center justify-center text-center p-4">
                      <div className="w-16 h-16 bg-slate-700 rounded-full flex items-center justify-center mb-4">
                        <ImageIcon size={32} className="text-slate-400" />
                      </div>
                      <p className="text-slate-400 text-sm">
                        Take a photo or select from gallery
                      </p>
                    </div>
                  )}
                </div>

                {/* Action buttons for upload mode */}
                <div className="p-4 space-y-3">
                  <Button
                    onClick={() => cameraInputRef.current?.click()}
                    className="w-full"
                  >
                    <Camera size={18} className="mr-2" />
                    Take Photo
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full"
                  >
                    <ImageIcon size={18} className="mr-2" />
                    Choose from Gallery
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <TextArea
            label="Description (optional)"
            {...register('description')}
            placeholder="e.g., Filipino chicken adobo with rice"
            rows={2}
            helperText="Adding details helps improve accuracy"
          />

          <Button
            onClick={handleAnalyze}
            disabled={
              (cameraPermission === 'granted' && !cameraActive && !imageData) ||
              (cameraPermission === 'denied' && !imageData) ||
              cameraPermission === 'pending'
            }
            className="w-full"
          >
            <Camera size={18} className="mr-2" />
            {imageData ? 'Analyze Food' : 'Capture & Analyze'}
          </Button>
        </div>
      )}

      {/* Analyzing Step */}
      {step === 'analyzing' && (
        <div className="text-center py-12">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
          <h2 className="text-xl font-semibold text-white mb-2">
            Analyzing...
          </h2>
          <p className="text-slate-400">AI is identifying your food</p>
        </div>
      )}

      {/* Results Step */}
      {step === 'results' && (
        <div className="space-y-4">
          {imagePreview && (
            <img
              src={imagePreview}
              alt="Analyzed food"
              className="w-full h-40 object-cover rounded-lg"
            />
          )}

          <Select
            label="Meal Type"
            {...register('mealType')}
            options={mealTypes}
          />

          <Card>
            <CardContent className="p-4">
              <h3 className="text-lg font-semibold text-white mb-4">
                Identified Items
              </h3>

              {results.length === 0 ? (
                <p className="text-slate-400 text-center py-4">
                  No items identified
                </p>
              ) : (
                <div className="space-y-4">
                  {results.map((item, index) => (
                    <div
                      key={`${item.name}-${item.originalPortion}`}
                      className="bg-slate-700/30 rounded-lg p-3"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <p className="text-white font-medium">{item.name}</p>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          className="text-slate-400 hover:text-red-400"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      <div className="flex items-center gap-2 mb-2">
                        <button
                          type="button"
                          onClick={() =>
                            handlePortionChange(
                              index,
                              Math.max(5, item.portion_grams - 5),
                            )
                          }
                          className="p-1 bg-slate-600 rounded hover:bg-slate-500"
                        >
                          <Minus size={14} />
                        </button>
                        <Input
                          type="number"
                          step="5"
                          value={item.portion_grams}
                          onChange={(e) =>
                            handlePortionChange(
                              index,
                              Number.parseInt(e.target.value, 10) || 0,
                            )
                          }
                          className="w-20 text-center"
                        />
                        <span className="text-slate-400 text-sm">g</span>
                        <button
                          type="button"
                          onClick={() =>
                            handlePortionChange(index, item.portion_grams + 5)
                          }
                          className="p-1 bg-slate-600 rounded hover:bg-slate-500"
                        >
                          <Plus size={14} />
                        </button>
                      </div>

                      <div className="grid grid-cols-4 gap-2 text-xs text-center">
                        <div className="bg-slate-700 rounded p-1">
                          <p className="text-white font-semibold">
                            {item.calories}
                          </p>
                          <p className="text-slate-400">kcal</p>
                        </div>
                        <div className="bg-slate-700 rounded p-1">
                          <p className="text-blue-400 font-semibold">
                            {item.protein_g.toFixed(1)}
                          </p>
                          <p className="text-slate-400">P</p>
                        </div>
                        <div className="bg-slate-700 rounded p-1">
                          <p className="text-green-400 font-semibold">
                            {item.carbs_g.toFixed(1)}
                          </p>
                          <p className="text-slate-400">C</p>
                        </div>
                        <div className="bg-slate-700 rounded p-1">
                          <p className="text-yellow-400 font-semibold">
                            {item.fat_g.toFixed(1)}
                          </p>
                          <p className="text-slate-400">F</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Total */}
          <Card>
            <CardContent className="p-4">
              <h3 className="text-lg font-semibold text-white mb-3">Total</h3>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-2xl font-bold text-white">
                    {totalCalories}
                  </p>
                  <p className="text-slate-400 text-xs">kcal</p>
                </div>
                <div>
                  <p className="text-xl font-semibold text-blue-400">
                    {totalProtein.toFixed(1)}g
                  </p>
                  <p className="text-slate-400 text-xs">Protein</p>
                </div>
                <div>
                  <p className="text-xl font-semibold text-green-400">
                    {totalCarbs.toFixed(1)}g
                  </p>
                  <p className="text-slate-400 text-xs">Carbs</p>
                </div>
                <div>
                  <p className="text-xl font-semibold text-yellow-400">
                    {totalFat.toFixed(1)}g
                  </p>
                  <p className="text-slate-400 text-xs">Fat</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={handleReset}
              className="flex-1"
            >
              Retake
            </Button>
            <Button
              onClick={handleSave}
              isLoading={isLoading}
              className="flex-1"
            >
              Save to {mealType}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
