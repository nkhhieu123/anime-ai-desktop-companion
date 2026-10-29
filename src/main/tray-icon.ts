/**
 * Generates the tray icon as a raw BGRA bitmap so no binary asset is needed
 * yet: a pink disc with a soft white highlight. Stage 8 replaces this with
 * proper .ico assets for the installer.
 */
export function createTrayBitmap(size = 32): Buffer {
  const buffer = Buffer.alloc(size * size * 4);
  const center = (size - 1) / 2;
  const radius = size / 2 - 1;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;
      const distance = Math.hypot(x - center, y - center);
      if (distance > radius) continue; // fully transparent

      // Anti-aliased edge.
      const alpha = Math.round(Math.min(1, radius - distance + 0.5) * 255);
      const highlight = Math.hypot(x - center * 0.7, y - center * 0.6) < radius * 0.35;
      const [r, g, b] = highlight ? [255, 240, 246] : [236, 108, 160];
      buffer[offset] = b;
      buffer[offset + 1] = g;
      buffer[offset + 2] = r;
      buffer[offset + 3] = alpha;
    }
  }
  return buffer;
}
