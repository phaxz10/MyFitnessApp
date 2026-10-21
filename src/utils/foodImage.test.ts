import { describe, expect, it } from 'vitest';
import { downscaledSize, FOOD_IMAGE_MAX_EDGE } from './foodImage';

describe('downscaledSize', () => {
  it('caps the long edge at 1024 and keeps aspect ratio (portrait)', () => {
    expect(downscaledSize(3024, 4032)).toEqual({ width: 768, height: 1024 });
  });

  it('caps the long edge for landscape', () => {
    expect(downscaledSize(4000, 3000)).toEqual({ width: 1024, height: 768 });
  });

  it('never upscales small images', () => {
    expect(downscaledSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(downscaledSize(1024, 1024)).toEqual({ width: 1024, height: 1024 });
  });

  it('handles extreme aspect ratios without a zero dimension', () => {
    expect(downscaledSize(10000, 5)).toEqual({ width: 1024, height: 1 });
  });

  it('returns zero size for empty input', () => {
    expect(downscaledSize(0, 100)).toEqual({ width: 0, height: 0 });
  });

  it('defaults to the food image max edge', () => {
    expect(FOOD_IMAGE_MAX_EDGE).toBe(1024);
  });
});
