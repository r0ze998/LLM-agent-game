import { useCallback, useRef, useState } from 'react';
import { TILE_SIZE, CHUNK_SIZE } from '@murasato/shared';

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export function useViewport() {
  const [viewport, setViewport] = useState<Viewport>({ x: 64 * TILE_SIZE, y: 64 * TILE_SIZE, zoom: 2 });
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const pan = useCallback((dx: number, dy: number) => {
    setViewport((v) => ({ ...v, x: v.x - dx / v.zoom, y: v.y - dy / v.zoom }));
  }, []);

  const zoomTo = useCallback((delta: number, centerX?: number, centerY?: number) => {
    setViewport((v) => {
      const newZoom = Math.max(0.5, Math.min(8, v.zoom * (1 + delta * 0.1)));
      return { ...v, zoom: newZoom };
    });
  }, []);

  const centerOn = useCallback((tileX: number, tileY: number) => {
    setViewport((v) => ({
      ...v,
      x: tileX * TILE_SIZE,
      y: tileY * TILE_SIZE,
    }));
  }, []);

  const getVisibleChunks = useCallback((screenWidth: number, screenHeight: number): { cx: number; cy: number }[] => {
    const halfW = (screenWidth / viewport.zoom) / 2;
    const halfH = (screenHeight / viewport.zoom) / 2;

    const minTileX = Math.floor((viewport.x - halfW) / TILE_SIZE);
    const maxTileX = Math.ceil((viewport.x + halfW) / TILE_SIZE);
    const minTileY = Math.floor((viewport.y - halfH) / TILE_SIZE);
    const maxTileY = Math.ceil((viewport.y + halfH) / TILE_SIZE);

    const minCX = Math.floor(minTileX / CHUNK_SIZE);
    const maxCX = Math.floor(maxTileX / CHUNK_SIZE);
    const minCY = Math.floor(minTileY / CHUNK_SIZE);
    const maxCY = Math.floor(maxTileY / CHUNK_SIZE);

    const chunks: { cx: number; cy: number }[] = [];
    for (let cy = minCY; cy <= maxCY; cy++) {
      for (let cx = minCX; cx <= maxCX; cx++) {
        if (cx >= 0 && cy >= 0) chunks.push({ cx, cy });
      }
    }
    return chunks;
  }, [viewport]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    pan(e.clientX - lastPos.current.x, e.clientY - lastPos.current.y);
    lastPos.current = { x: e.clientX, y: e.clientY };
  }, [pan]);

  const onMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    zoomTo(-Math.sign(e.deltaY));
  }, [zoomTo]);

  return {
    viewport,
    pan,
    zoomTo,
    centerOn,
    getVisibleChunks,
    handlers: { onMouseDown, onMouseMove, onMouseUp, onWheel },
  };
}
