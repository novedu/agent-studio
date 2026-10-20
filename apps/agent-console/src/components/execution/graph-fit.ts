/**
 * Zoom math for the runtime graph.
 *
 * The graph is a fixed-size canvas (columns of nodes) shown inside a small
 * viewport, so the scale has to be derived from both dimensions. Returning a
 * clamped value keeps a single node readable when the viewport is tiny and
 * avoids blowing the graph up when everything already fits.
 */

export const GRAPH_MIN_SCALE = 0.45;
export const GRAPH_MAX_SCALE = 1.3;
export const GRAPH_FIT_PADDING = 14;

export function computeFitScale(
  contentWidth: number,
  contentHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): number {
  if (contentWidth <= 0 || contentHeight <= 0) return GRAPH_MAX_SCALE;
  const availableWidth = viewportWidth - GRAPH_FIT_PADDING * 2;
  const availableHeight = viewportHeight - GRAPH_FIT_PADDING * 2;
  if (availableWidth <= 0 || availableHeight <= 0) return GRAPH_MIN_SCALE;

  const fitted = Math.min(availableWidth / contentWidth, availableHeight / contentHeight);
  const clamped = Math.max(GRAPH_MIN_SCALE, Math.min(GRAPH_MAX_SCALE, fitted));
  return Number(clamped.toFixed(2));
}
