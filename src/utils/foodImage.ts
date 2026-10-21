// Food photos are sent to a vision model billed per image token. Phone
// cameras produce 3-12 MP images; past ~1024px on the long edge the model
// sees no extra detail for portion estimates, it just costs more. Every
// food photo (camera capture and gallery upload) goes through here.

export const FOOD_IMAGE_MAX_EDGE = 1024;
export const FOOD_IMAGE_JPEG_QUALITY = 0.8;

export interface EncodedImage {
  base64: string;
  mimeType: string;
}

/**
 * Target size that fits within `maxEdge` on the long edge, preserving aspect
 * ratio. Never upscales. Pure — unit tested.
 */
export function downscaledSize(
  width: number,
  height: number,
  maxEdge: number = FOOD_IMAGE_MAX_EDGE,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdge) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const scale = maxEdge / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * Draws (a crop of) an image source onto `canvas` at the downscaled size and
 * encodes it as JPEG. Returns null if the canvas has no 2D context.
 */
export function encodeDownscaledJpeg(
  source: CanvasImageSource,
  crop: CropRect,
  canvas: HTMLCanvasElement = document.createElement('canvas'),
): EncodedImage | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const { width, height } = downscaledSize(crop.sw, crop.sh);
  if (width === 0 || height === 0) return null;
  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(
    source,
    crop.sx,
    crop.sy,
    crop.sw,
    crop.sh,
    0,
    0,
    width,
    height,
  );
  const dataUrl = canvas.toDataURL('image/jpeg', FOOD_IMAGE_JPEG_QUALITY);
  return { base64: dataUrl.split(',')[1] ?? '', mimeType: 'image/jpeg' };
}

/**
 * Downscales and re-encodes an uploaded image file as JPEG. Decoding through
 * the browser also converts HEIC/HEIF where the browser can decode it
 * (Safari). If decoding fails, falls back to the original bytes so upload
 * still works exactly as before.
 */
export async function prepareFoodImageFile(file: File): Promise<EncodedImage> {
  try {
    const decoded = await decodeImage(file);
    try {
      const encoded = encodeDownscaledJpeg(decoded.source, {
        sx: 0,
        sy: 0,
        sw: decoded.width,
        sh: decoded.height,
      });
      if (encoded?.base64) return encoded;
    } finally {
      decoded.release();
    }
  } catch (err) {
    console.warn(
      '[foodImage] could not downscale image, sending original',
      err,
    );
  }
  return readOriginal(file);
}

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      // 'from-image' applies EXIF orientation so portrait photos stay upright.
      const bitmap = await createImageBitmap(file, {
        imageOrientation: 'from-image',
      });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Fall through to <img> decoding (wider format support on Safari).
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

function readOriginal(file: File): Promise<EncodedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      resolve({ base64: result.split(',')[1] ?? '', mimeType: file.type });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
