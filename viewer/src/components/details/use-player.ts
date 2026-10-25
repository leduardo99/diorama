import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { atlasQuery } from '@/lib/queries';
import { clipFrames, clipNames, eventsByFrame, playbackKind, type Rect } from '@/lib/atlas';
import { useImage } from '@/lib/use-image';
import { usePref } from '@/lib/use-pref';
import type { AssetFileMeta } from '@/lib/types';

export const ZOOMS = [1, 2, 3, 4, 6, 8] as const;
export type Zoom = 'fit' | (typeof ZOOMS)[number];
export type Backdrop = 'checker' | 'dark' | 'light';

/** Everything the Details window shows is derived from the exported atlas and image of one asset. */
export function usePlayer(asset: AssetFileMeta, directionIndex: number) {
  const atlasResult = useQuery(atlasQuery(asset));
  const atlas = atlasResult.data;
  const kind = playbackKind(atlas);
  const { image, failed } = useImage(`${asset.url}?t=${asset.mtime}`);

  const directions = atlas?.meta.directions ?? [];
  const clips = useMemo(() => (atlas ? clipNames(atlas) : []), [atlas]);
  const events = useMemo(() => eventsByFrame(atlas), [atlas]);

  const [clipChoice, setClipChoice] = useState<string | null>(null);
  const clip = clipChoice && clips.includes(clipChoice) ? clipChoice : clips[0];
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [fpsOverride, setFpsOverride] = useState<number | null>(null);

  const [zoom, setZoom] = usePref<Zoom>('details.zoom', 'fit');
  const [backdrop, setBackdrop] = usePref<Backdrop>('details.backdrop', 'checker');
  const [showPivot, setShowPivot] = usePref<boolean>('details.pivot', true);
  const [showBounds, setShowBounds] = usePref<boolean>('details.bounds', false);

  const frames = useMemo<Rect[]>(() => {
    if (kind === 'animated' && atlas && clip) return clipFrames(atlas, clip, Math.min(directionIndex, Math.max(0, directions.length - 1)));
    return image ? [{ x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight }] : [];
  }, [kind, atlas, clip, directionIndex, directions.length, image]);

  const atlasFps = atlas?.meta.fps ?? 0;
  const fps = fpsOverride ?? (atlasFps || 8);
  const index = Math.min(cursor, Math.max(0, frames.length - 1));
  const current = frames.at(index);

  // Playback clock: accumulates real time so the rate holds even when a frame is late.
  useEffect(() => {
    if (!playing || frames.length < 2) return;
    let raf = 0;
    let last = performance.now();
    let elapsed = 0;
    const tick = (now: number) => {
      elapsed += now - last;
      last = now;
      const interval = 1000 / fps;
      if (elapsed >= interval) {
        const steps = Math.floor(elapsed / interval);
        elapsed -= steps * interval;
        setCursor((i) => (i + steps) % frames.length);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, fps, frames.length]);

  // "Fit" takes the largest whole-number scale that fits the stage, or a fraction when the frame is bigger than it.
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setStage({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const fitScale = current ? Math.min((stage.width - 48) / current.width, (stage.height - 48) / current.height) : 1;
  const scale = zoom === 'fit' ? (fitScale >= 1 ? Math.floor(fitScale) : Math.max(0.1, fitScale)) : zoom;

  const seek = (to: number) => {
    setPlaying(false);
    setCursor(((to % frames.length) + frames.length) % frames.length);
  };
  const stepZoom = (delta: 1 | -1) => {
    const levels: number[] = [...ZOOMS];
    const at = levels.findIndex((z) => z >= scale);
    const next = levels[Math.max(0, Math.min(levels.length - 1, (at < 0 ? levels.length - 1 : at) + delta))];
    setZoom(next as Zoom);
  };

  return {
    atlas, atlasError: atlasResult.error, kind, image, failed, directions, clips, clip, events,
    frames, index, current, fps, atlasFps, scale, stageRef,
    playing, setPlaying, fpsOverride, setFpsOverride, seek,
    selectClip: (name: string) => {
      setClipChoice(name);
      setCursor(0);
    },
    zoom, setZoom, stepZoom, backdrop, setBackdrop, showPivot, setShowPivot, showBounds, setShowBounds,
  };
}

export type Player = ReturnType<typeof usePlayer>;
