import { describe, expect, it } from 'vitest';
import { createTrayBitmap } from '../src/main/tray-icon';

describe('createTrayBitmap', () => {
  it('produces a BGRA buffer of the right size', () => {
    expect(createTrayBitmap(32)).toHaveLength(32 * 32 * 4);
  });

  it('is transparent in the corners and opaque in the middle', () => {
    const size = 32;
    const buf = createTrayBitmap(size);
    const alphaAt = (x: number, y: number) => buf[(y * size + x) * 4 + 3];
    expect(alphaAt(0, 0)).toBe(0);
    expect(alphaAt(size - 1, size - 1)).toBe(0);
    expect(alphaAt(16, 20)).toBe(255);
  });
});
