import type { ScreenPoint } from '@shared/ipc';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

function contains(area: Rect, point: ScreenPoint): boolean {
  return (
    point.x >= area.x &&
    point.x < area.x + area.width &&
    point.y >= area.y &&
    point.y < area.y + area.height
  );
}

function distanceSq(area: Rect, point: ScreenPoint): number {
  const dx = Math.max(area.x - point.x, 0, point.x - (area.x + area.width));
  const dy = Math.max(area.y - point.y, 0, point.y - (area.y + area.height));
  return dx * dx + dy * dy;
}

/** Work area containing the point, or the nearest one. */
export function pickWorkArea(workAreas: readonly Rect[], point: ScreenPoint): Rect | null {
  if (workAreas.length === 0) return null;
  const hit = workAreas.find((area) => contains(area, point));
  if (hit) return hit;
  return [...workAreas].sort((a, b) => distanceSq(a, point) - distanceSq(b, point))[0] ?? null;
}

export function clampToArea(position: ScreenPoint, size: Size, area: Rect): ScreenPoint {
  const maxX = area.x + Math.max(area.width - size.width, 0);
  const maxY = area.y + Math.max(area.height - size.height, 0);
  return {
    x: Math.round(Math.min(Math.max(position.x, area.x), maxX)),
    y: Math.round(Math.min(Math.max(position.y, area.y), maxY)),
  };
}

/**
 * New window position while dragging: the window follows the pointer delta
 * and stays fully inside the work area of the display under the pointer.
 */
export function computeDragPosition(
  windowStart: ScreenPoint,
  pointerStart: ScreenPoint,
  pointerNow: ScreenPoint,
  size: Size,
  workAreas: readonly Rect[],
): ScreenPoint {
  const target = {
    x: windowStart.x + (pointerNow.x - pointerStart.x),
    y: windowStart.y + (pointerNow.y - pointerStart.y),
  };
  const area = pickWorkArea(workAreas, pointerNow);
  return area ? clampToArea(target, size, area) : target;
}

/** Default spot: bottom-right corner of the primary work area with a margin. */
export function defaultAvatarPosition(size: Size, workArea: Rect, margin = 24): ScreenPoint {
  return clampToArea(
    {
      x: workArea.x + workArea.width - size.width - margin,
      y: workArea.y + workArea.height - size.height - margin,
    },
    size,
    workArea,
  );
}
