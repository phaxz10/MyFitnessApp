/** Downscale a base64 photo to at most 1200px and re-encode as JPEG. */
export function compressBase64Image(
  base64: string,
  mimeType: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = document.createElement('img');
    img.onload = () => {
      const maxDim = 1200;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width *= ratio;
        height *= ratio;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => reject(new Error('Failed to process image'));
    img.src = `data:${mimeType};base64,${base64}`;
  });
}
