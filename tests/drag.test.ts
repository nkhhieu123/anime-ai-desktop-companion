import { describe, expect, it } from 'vitest';
import { clampToArea, computeDragPosition, defaultAvatarPosition, pickWorkArea, type Rect } from '../src/main/windows/drag';

const size = { width: 240, height: 320 };
const primary: Rect = { x: 0, y: 0, width: 1920, height: 1040 }; // taskbar excluded
const secondary: Rect = { x: 1920, y: 0, width: 1280, height: 1024 };

describe('computeDragPosition', () => {
  it('moves the window by the pointer delta', () => {
    const next = computeDragPosition({ x: 500, y: 400 }, { x: 600, y: 500 }, { x: 650, y: 470 }, size, [primary]);
    expect(next).toEqual({ x: 550, y: 370 });
  });

  it('keeps the window inside the work area (not under the taskbar)', () => {
    const next = computeDragPosition({ x: 1600, y: 700 }, { x: 1700, y: 800 }, { x: 1900, y: 1035 }, size, [primary]);
    expect(next).toEqual({ x: 1920 - 240, y: 1040 - 320 });
  });

  it('never goes past the top-left corner', () => {
    const next = computeDragPosition({ x: 10, y: 10 }, { x: 50, y: 50 }, { x: 0, y: 0 }, size, [primary]);
    expect(next).toEqual({ x: 0, y: 0 });
  });

  it('can move onto a second monitor', () => {
    const next = computeDragPosition({ x: 1600, y: 300 }, { x: 1700, y: 400 }, { x: 2300, y: 400 }, size, [primary, secondary]);
    expect(next).toEqual({ x: 2200, y: 300 });
  });

  it('handles monitors with negative coordinates', () => {
    const left: Rect = { x: -1280, y: 0, width: 1280, height: 1024 };
    const next = computeDragPosition({ x: 100, y: 100 }, { x: 200, y: 200 }, { x: -600, y: 200 }, size, [primary, left]);
    expect(next).toEqual({ x: -700, y: 100 });
  });

  it('returns the raw target when there are no displays', () => {
    expect(computeDragPosition({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 5 }, size, [])).toEqual({ x: 5, y: 5 });
  });
});

describe('pickWorkArea', () => {
  it('falls back to the nearest display when the pointer is in a gap', () => {
    const lower: Rect = { x: 1920, y: 1100, width: 800, height: 600 };
    expect(pickWorkArea([primary, lower], { x: 2000, y: 1060 })).toBe(lower);
  });
});

describe('clampToArea / defaultAvatarPosition', () => {
  it('pins a window larger than the area to its origin', () => {
    expect(clampToArea({ x: 50, y: 50 }, { width: 3000, height: 3000 }, primary)).toEqual({ x: 0, y: 0 });
  });

  it('places the avatar at the bottom-right with a margin', () => {
    expect(defaultAvatarPosition(size, primary)).toEqual({ x: 1920 - 240 - 24, y: 1040 - 320 - 24 });
  });
});
