/**
 * PF-08: dockable detached panels — pure position clamp for a floating
 * panel inside the viewport. No app imports (unit-anchored).
 */

export interface PanelPos {
  x: number;
  y: number;
}

/** Viewport margin the floating panel never crosses. */
export const PANEL_MARGIN = 8;

/**
 * Clamp a floating panel of `w × h` css px so it stays fully inside a
 * `vw × vh` viewport (PANEL_MARGIN on every side). Panels larger than the
 * viewport pin to the top-left margin; degenerate sizes clamp like
 * zero-size points (callers reject them upstream, this is defensive).
 */
export function clampPanelPos(x: number, y: number, w: number, h: number, vw: number, vh: number): PanelPos {
  const cw = Math.max(0, w);
  const ch = Math.max(0, h);
  const maxX = Math.max(PANEL_MARGIN, vw - cw - PANEL_MARGIN);
  const maxY = Math.max(PANEL_MARGIN, vh - ch - PANEL_MARGIN);
  return {
    x: Math.min(maxX, Math.max(PANEL_MARGIN, x)),
    y: Math.min(maxY, Math.max(PANEL_MARGIN, y)),
  };
}
