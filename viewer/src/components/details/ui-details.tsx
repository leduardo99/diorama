import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { capPlacement, fillRect, layoutText, minimumSize, nineSlice, stretchFill } from '@diorama/runtime';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel, FieldTitle } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Rich, useT } from '@/i18n';
import { clipFrames, type Atlas, type Rect } from '@/lib/atlas';
import { isTyping, useWindowKeydown } from '@/lib/hotkeys';
import type { AssetFileMeta } from '@/lib/types';
import { usePref } from '@/lib/use-pref';
import { cn } from '@/lib/utils';
import { DetailsColumns } from './details-shell';
import { Section } from './inspector';
import { useSheet } from './use-sheet';
import type { Backdrop } from './use-player';

const backdrops = { checker: 'checker', dark: 'bg-background', light: 'bg-foreground' } as const;
const ZOOMS = [1, 2, 3, 4, 6, 8] as const;
const NEXT_BACKDROP: Record<Backdrop, Backdrop> = { checker: 'dark', dark: 'light', light: 'checker' };

/** What every demo of an interface piece is given. */
interface Demo {
  atlas: Atlas;
  image: HTMLImageElement;
  /** Exported px per logical px. */
  scale: number;
  zoom: number;
}

interface ControlsProps {
  zoom: number;
  onZoom: (zoom: number) => void;
  backdrop: Backdrop;
  onBackdrop: (backdrop: Backdrop) => void;
}

/** Zoom and backdrop, which every demo shares. */
function ViewControls({ zoom, onZoom, backdrop, onBackdrop }: ControlsProps) {
  const { t } = useT();
  return (
    <Section title={t('details.inspector.view')}>
      <Field orientation="horizontal">
        <FieldTitle id="details-ui-zoom">{t('details.inspector.zoom')}</FieldTitle>
        <ToggleGroup type="single" variant="outline" size="sm" spacing={0} aria-labelledby="details-ui-zoom" value={String(zoom)} onValueChange={(value) => value && onZoom(Number(value))}>
          {ZOOMS.map((z) => <ToggleGroupItem key={z} value={String(z)}>{t('units.times', { value: z })}</ToggleGroupItem>)}
        </ToggleGroup>
      </Field>
      <Field orientation="horizontal">
        <FieldTitle id="details-ui-backdrop">{t('details.inspector.background')}</FieldTitle>
        <ToggleGroup type="single" variant="outline" size="sm" spacing={0} aria-labelledby="details-ui-backdrop" value={backdrop} onValueChange={(value) => value && onBackdrop(value as Backdrop)}>
          <ToggleGroupItem value="checker">{t('details.inspector.checker')}</ToggleGroupItem>
          <ToggleGroupItem value="dark">{t('details.inspector.dark')}</ToggleGroupItem>
          <ToggleGroupItem value="light">{t('details.inspector.light')}</ToggleGroupItem>
        </ToggleGroup>
      </Field>
    </Section>
  );
}

/** The stage on the left and the controls on the right, as in the other Details windows. */
function Layout({ stage, controls, backdrop }: { stage: ReactNode; controls: ReactNode; backdrop: Backdrop }) {
  return (
    <DetailsColumns
      stage={
        <section className="relative min-h-0 min-w-0 flex-1">
          <div className={cn('absolute inset-0 flex overflow-auto p-6', backdrops[backdrop])}>
            <div className="m-auto flex flex-col items-center gap-6">{stage}</div>
          </div>
        </section>
      }
      inspector={<div className="min-h-0 flex-1 overflow-y-auto bg-card/40">{controls}</div>}
    />
  );
}

/** A canvas drawn by `draw` whenever the inputs change, shown at `zoom` with hard edges. */
function Painted({ width, height, zoom, draw, className, children }: { width: number; height: number; zoom: number; draw: (ctx: CanvasRenderingContext2D) => void; className?: string; children?: ReactNode }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);
    draw(ctx);
  }, [width, height, draw]);
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: width * zoom, height: height * zoom }}>
      <canvas ref={ref} className="pixelated block size-full" />
      {children}
    </div>
  );
}

/** The rectangles of a row of the sheet (a state's frame, a bar's layers, a font's glyphs). */
const rowRects = (atlas: Atlas, row: number): Rect[] => clipFrames(atlas, 'default', row);

const Value = ({ children }: { children: ReactNode }) => <span className="font-mono text-muted-foreground tabular-nums">{children}</span>;

/** A panel, a button, a slot: stretched to any size larger than its borders, in any of its states, with the border lines to see where it stretches. */
function NineSliceDemo({ atlas, image, scale, zoom, controls, backdrop }: Demo & { controls: ReactNode; backdrop: Backdrop }) {
  const { t } = useT();
  const insets = atlas.meta.data!.nineSlice!;
  const states = atlas.meta.data?.states ?? ['normal'];
  const [state, setState] = useState(states[0]);
  const row = Math.max(0, states.indexOf(state));
  const rect = rowRects(atlas, row)[0] ?? { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
  const source = { w: rect.width / scale, h: rect.height / scale };
  const minimum = minimumSize(insets);
  // It starts a little larger than it was drawn: the point of the Details window is the stretch.
  const [size, setSize] = useState({ w: Math.round(source.w * 2), h: Math.round(source.h * 1.5) });
  const [guides, setGuides] = usePref<boolean>('details.ui.insets', true);
  const max = { w: Math.max(400, Math.round(source.w * 6)), h: Math.max(300, Math.round(source.h * 6)) };
  const clamp = (w: number, h: number) => setSize({ w: Math.max(minimum.width, Math.min(max.w, Math.round(w))), h: Math.max(minimum.height, Math.min(max.h, Math.round(h))) });
  const draw = useMemo(
    () => (ctx: CanvasRenderingContext2D) => {
      for (const p of nineSlice(rect, insets, scale, size.w * scale, size.h * scale)) ctx.drawImage(image, p.sx, p.sy, p.sw, p.sh, p.dx, p.dy, p.dw, p.dh);
    },
    [image, rect.x, rect.y, rect.width, rect.height, insets, scale, size.w, size.h],
  );
  // The handle at the corner resizes it the way a window is resized.
  const drag = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  return (
    <Layout
      backdrop={backdrop}
      stage={
        <Painted width={size.w * scale} height={size.h * scale} zoom={zoom} draw={draw}>
          {guides && (
            <>
              {[insets.left, size.w - insets.right].map((x, i) => <div key={`x${i}`} className="pointer-events-none absolute inset-y-0 w-px border-l border-dashed border-primary/80" style={{ left: x * scale * zoom }} />)}
              {[insets.top, size.h - insets.bottom].map((y, i) => <div key={`y${i}`} className="pointer-events-none absolute inset-x-0 h-px border-t border-dashed border-primary/80" style={{ top: y * scale * zoom }} />)}
            </>
          )}
          <div
            role="presentation"
            aria-label={t('details.ui.resize')}
            className="absolute -right-2 -bottom-2 size-4 cursor-nwse-resize touch-none rounded-xs border border-primary-foreground bg-primary"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h };
            }}
            onPointerMove={(e) => {
              const start = drag.current;
              if (start) clamp(start.w + (e.clientX - start.x) / (scale * zoom), start.h + (e.clientY - start.y) / (scale * zoom));
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
          />
        </Painted>
      }
      controls={
        <>
          <Section title={t('details.ui.stretch.title')}>
            <Field>
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="ui-width">{t('details.ui.stretch.width')}</FieldLabel>
                <Value>{t('units.px', { value: size.w })}</Value>
              </div>
              <Slider id="ui-width" min={minimum.width} max={max.w} step={1} value={[size.w]} aria-label={t('details.ui.stretch.width')} onValueChange={([w]) => clamp(w, size.h)} />
            </Field>
            <Field>
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="ui-height">{t('details.ui.stretch.height')}</FieldLabel>
                <Value>{t('units.px', { value: size.h })}</Value>
              </div>
              <Slider id="ui-height" min={minimum.height} max={max.h} step={1} value={[size.h]} aria-label={t('details.ui.stretch.height')} onValueChange={([h]) => clamp(size.w, h)} />
            </Field>
            <Field orientation="horizontal">
              <Button variant="outline" size="sm" onClick={() => clamp(source.w, source.h)}>{t('details.ui.stretch.original')}</Button>
              <Button variant="outline" size="sm" onClick={() => clamp(minimum.width, minimum.height)}>{t('details.ui.stretch.minimum')}</Button>
            </Field>
            <FieldDescription>{t('details.ui.stretch.hint')}</FieldDescription>
          </Section>
          {states.length > 1 && (
            <Section title={t('details.ui.state')}>
              <ToggleGroup type="single" variant="outline" size="sm" aria-label={t('details.ui.state')} value={state} onValueChange={(value) => value && setState(value)} className="flex-wrap">
                {states.map((name) => <ToggleGroupItem key={name} value={name}>{name}</ToggleGroupItem>)}
              </ToggleGroup>
            </Section>
          )}
          <Section title={t('details.ui.borders.title')}>
            <Field orientation="horizontal">
              <Switch id="ui-insets" checked={guides} onCheckedChange={setGuides} />
              <FieldLabel htmlFor="ui-insets">{t('details.ui.borders.insetLines')}</FieldLabel>
            </Field>
            <dl className="flex flex-col gap-1.5">
              {(['left', 'top', 'right', 'bottom'] as const).map((side) => (
                <div key={side} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{t(`details.ui.borders.${side}`)}</dt>
                  <dd className="font-mono tabular-nums">{t('units.px', { value: insets[side] })}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t('details.ui.borders.original')}</dt>
                <dd className="font-mono tabular-nums">{t('units.px', { value: `${Math.round(source.w)}×${Math.round(source.h)}` })}</dd>
              </div>
            </dl>
          </Section>
          {controls}
        </>
      }
    />
  );
}

/**
 * A bar the way a game draws it (core/ui.ts): the back, the fill clipped to the value inside its box (growing the way it grows),
 * the cap moved to where the fill ends and clipped to the box, then the frame over them; longer or taller by stretching. The
 * frames are found by the names in `layers`: the cap, when there is one, comes last in the sheet.
 */
function BarDemo({ atlas, image, scale, zoom, controls, backdrop }: Demo & { controls: ReactNode; backdrop: Backdrop }) {
  const { t } = useT();
  const data = atlas.meta.data!;
  const insets = data.nineSlice ?? { left: 0, top: 0, right: 0, bottom: 0 };
  const fillBox = data.fillBox ?? { x: 0, y: 0, w: (atlas.meta.frameWidth ?? 0) / scale, h: (atlas.meta.frameHeight ?? 0) / scale };
  const grows = data.grows ?? 'right';
  const horizontal = grows === 'right' || grows === 'left';
  const layerRects = rowRects(atlas, 0);
  const layerNames = data.layers ?? ['back', 'fill', 'frame'];
  const [back, fill, frame] = ['back', 'fill', 'frame'].map((name) => layerRects[layerNames.indexOf(name)]);
  const cap = data.cap ? layerRects[layerNames.indexOf('cap')] : undefined;
  const [value, setValue] = useState(70);
  const [extra, setExtra] = useState(0);
  const [guides, setGuides] = usePref<boolean>('details.ui.insets', true);
  const sourceW = (back?.width ?? 0) / scale;
  const sourceH = (back?.height ?? 0) / scale;
  const width = sourceW + (horizontal ? extra : 0);
  const height = sourceH + (horizontal ? 0 : extra);
  const box = stretchFill(fillBox, horizontal ? extra : 0, horizontal ? 0 : extra);
  const part = fillRect(box, value / 100, grows);
  const capAt = capPlacement(box, value / 100, grows);
  const draw = useMemo(
    () => (ctx: CanvasRenderingContext2D) => {
      if (!back || !fill || !frame) return;
      const layer = (rect: Rect) => {
        for (const p of nineSlice(rect, insets, scale, width * scale, height * scale)) ctx.drawImage(image, p.sx, p.sy, p.sw, p.sh, p.dx, p.dy, p.dw, p.dh);
      };
      layer(back);
      ctx.save();
      ctx.beginPath();
      ctx.rect(part.x * scale, part.y * scale, part.w * scale, part.h * scale);
      ctx.clip();
      layer(fill);
      ctx.restore();
      if (cap) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(box.x * scale, box.y * scale, box.w * scale, box.h * scale);
        ctx.clip();
        ctx.translate(capAt.dx * scale, capAt.dy * scale);
        layer(cap);
        ctx.restore();
      }
      layer(frame);
    },
    [image, back, fill, frame, cap, insets, scale, width, height, part.x, part.y, part.w, part.h, box.x, box.y, box.w, box.h, capAt.dx, capAt.dy],
  );
  const range = horizontal ? 400 : 300;

  return (
    <Layout
      backdrop={backdrop}
      stage={
        <Painted width={width * scale} height={height * scale} zoom={zoom} draw={draw}>
          {guides && <div className="pointer-events-none absolute border border-dashed border-primary/80" style={{ left: box.x * scale * zoom, top: box.y * scale * zoom, width: box.w * scale * zoom, height: box.h * scale * zoom }} />}
        </Painted>
      }
      controls={
        <>
          <Section title={t('details.ui.bar.value')}>
            <Field>
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="ui-bar-value">{data.measure ?? t('details.ui.bar.value')}</FieldLabel>
                <Value>{value}%</Value>
              </div>
              <Slider id="ui-bar-value" min={0} max={100} step={1} value={[value]} aria-label={t('details.ui.bar.barValue')} onValueChange={([next]) => setValue(next)} />
            </Field>
            <div role="group" aria-label={t('details.ui.bar.values')} className="flex gap-1">
              {[0, 1, 25, 50, 75, 100].map((v) => <Button key={v} variant={value === v ? 'secondary' : 'outline'} size="sm" className="flex-1 px-0" onClick={() => setValue(v)}>{v}%</Button>)}
            </div>
            <FieldDescription>{t('details.ui.bar.growsHint', { direction: t(`details.ui.bar.growsTo.${grows}`) })}{cap ? t('details.ui.bar.capHint') : ''}</FieldDescription>
          </Section>
          <Section title={horizontal ? t('details.ui.bar.length') : t('details.ui.bar.height')}>
            <Field>
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="ui-bar-extra">{horizontal ? t('details.ui.bar.longer') : t('details.ui.bar.taller')}</FieldLabel>
                <Value>+{t('units.px', { value: extra })}</Value>
              </div>
              <Slider id="ui-bar-extra" min={0} max={range} step={1} value={[extra]} aria-label={t('details.ui.bar.stretch')} onValueChange={([next]) => setExtra(next)} />
            </Field>
            <Field orientation="horizontal">
              <Switch id="ui-bar-box" checked={guides} onCheckedChange={setGuides} />
              <FieldLabel htmlFor="ui-bar-box">{t('details.ui.bar.fillBox')}</FieldLabel>
            </Field>
          </Section>
          <Section title={t('details.ui.bar.data')}>
            <dl className="flex flex-col gap-1.5">
              {[
                [t('details.ui.bar.measures'), data.measure],
                [t('details.ui.bar.growsRow'), t(`details.ui.bar.grows.${grows}`)],
                [t('details.ui.bar.box'), `${fillBox.x}, ${fillBox.y} · ${fillBox.w}×${fillBox.h}`],
                [t('details.ui.bar.cap'), data.cap ? t('units.px', { value: data.cap.width }) : t('details.ui.bar.noCap')],
                [t('details.ui.bar.size'), t('units.px', { value: `${Math.round(width)}×${Math.round(height)}` })],
              ].map(([key, text]) => (
                <div key={key} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{key}</dt>
                  <dd className="text-right font-mono tabular-nums">{text}</dd>
                </div>
              ))}
            </dl>
          </Section>
          {controls}
        </>
      }
    />
  );
}

const SAMPLES = ['-128', '+45', '1234', '99%', '-56'];

/** A bitmap font: text set glyph by glyph with each one's advance, so a narrow "1" takes less room. */
function FontDemo({ atlas, image, scale, zoom, controls, backdrop }: Demo & { controls: ReactNode; backdrop: Backdrop }) {
  const { t, number } = useT();
  const font = atlas.meta.data!.font!;
  const glyphs = useMemo(() => rowRects(atlas, 0), [atlas]);
  const [text, setText] = useState('-128 +45 1234 99%');
  const [cells, setCells] = usePref<boolean>('details.ui.cells', false);
  const laid = useMemo(() => layoutText(font, text), [font, text]);
  const width = Math.max(1, Math.ceil(laid.width * scale));
  const height = Math.max(1, Math.ceil(laid.height * scale));
  const draw = useMemo(
    () => (ctx: CanvasRenderingContext2D) => {
      for (const g of laid.glyphs) {
        const rect = glyphs[g.index];
        if (!rect) continue;
        ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height, Math.round(g.x * scale), Math.round(g.y * scale), rect.width, rect.height);
      }
    },
    [image, glyphs, laid, scale],
  );
  const missing = [...new Set([...text].filter((ch) => ch !== '\n' && ch !== ' ' && !font.chars.includes(ch)))];

  return (
    <Layout
      backdrop={backdrop}
      stage={
        <Painted width={width} height={height} zoom={zoom} draw={draw}>
          {cells &&
            laid.glyphs.map((g, i) => (
              <div key={i} className="pointer-events-none absolute border border-primary/40" style={{ left: g.x * scale * zoom, top: g.y * scale * zoom, width: (font.advances[g.char] ?? font.cell.w) * scale * zoom, height: font.cell.h * scale * zoom }}>
                <div className="absolute inset-x-0 border-t border-dashed border-primary/70" style={{ top: font.baseline * scale * zoom }} />
              </div>
            ))}
        </Painted>
      }
      controls={
        <>
          <Section title={t('details.ui.font.text')}>
            <Field>
              <FieldLabel htmlFor="ui-font-text">{t('details.ui.font.text')}</FieldLabel>
              <Input id="ui-font-text" value={text} spellCheck={false} className="font-mono" onChange={(e) => setText(e.target.value)} />
              <FieldDescription>
                {missing.length > 0 ? <Rich id="details.ui.font.missing" nodes={{ chars: missing.map((ch) => <Kbd key={ch}>{ch}</Kbd>) }} /> : t('details.ui.font.laidOut')}
              </FieldDescription>
            </Field>
            <div className="flex flex-wrap gap-1.5">
              {SAMPLES.map((sample) => <Button key={sample} variant="outline" size="sm" className="font-mono" onClick={() => setText(sample)}>{sample}</Button>)}
            </div>
            <Field orientation="horizontal">
              <Switch id="ui-font-cells" checked={cells} onCheckedChange={setCells} />
              <FieldLabel htmlFor="ui-font-cells">{t('details.ui.font.advances')}</FieldLabel>
            </Field>
          </Section>
          <Section title={t('details.ui.font.font')}>
            <dl className="flex flex-col gap-1.5">
              {[
                [t('details.ui.font.glyphs'), String([...font.chars].length)],
                [t('details.ui.font.cell'), t('units.px', { value: `${font.cell.w}×${font.cell.h}` })],
                [t('details.ui.font.baseline'), t('units.px', { value: font.baseline })],
                [t('details.ui.font.lineHeight'), t('units.px', { value: font.lineHeight })],
                [t('details.ui.font.spacing'), t('units.px', { value: font.spacing })],
              ].map(([key, value]) => (
                <div key={key} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{key}</dt>
                  <dd className="text-right font-mono tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-wrap gap-1.5">
              {[...font.chars].map((ch) => (
                <Badge key={ch} variant="secondary" className="font-mono tabular-nums" title={`${ch} · ${t('details.ui.font.advance', { value: number(font.advances[ch] ?? font.cell.w, { maximumFractionDigits: 2 }) })}`}>
                  {ch}<span className="text-muted-foreground">{number(font.advances[ch] ?? font.cell.w, { maximumFractionDigits: 2 })}</span>
                </Badge>
              ))}
            </div>
          </Section>
          {controls}
        </>
      }
    />
  );
}

/** A plain interface image (a cursor, a portrait frame): its states, and the point it is held by. A cursor can be tried over targets. */
function ImageDemo({ atlas, image, scale, zoom, controls, backdrop }: Demo & { controls: ReactNode; backdrop: Backdrop }) {
  const { t, number } = useT();
  const data = atlas.meta.data!;
  const states = data.states ?? ['normal'];
  const [state, setState] = useState(states[0]);
  const row = Math.max(0, states.indexOf(state));
  const rect = (atlas.meta.directions?.length ?? 1) > 1 ? (rowRects(atlas, row)[0] ?? null) : { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
  const pivot = atlas.meta.pivot;
  const isCursor = data.kind === 'cursor';
  const draw = useMemo(
    () => (ctx: CanvasRenderingContext2D) => {
      if (rect) ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
    },
    [image, rect?.x, rect?.y, rect?.width, rect?.height],
  );
  const follower = useRef<HTMLDivElement>(null);
  const [hotspot, setHotspot] = useState(true);
  if (!rect) return null;

  return (
    <Layout
      backdrop={backdrop}
      stage={
        <>
          <Painted width={rect.width} height={rect.height} zoom={zoom} draw={draw}>
            {hotspot && pivot && (
              <>
                <div className="pointer-events-none absolute inset-y-0 w-px bg-primary/80" style={{ left: pivot.x * zoom }} />
                <div className="pointer-events-none absolute inset-x-0 h-px bg-primary/80" style={{ top: pivot.y * zoom }} />
                <div className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary-foreground bg-primary" style={{ left: pivot.x * zoom, top: pivot.y * zoom }} />
              </>
            )}
          </Painted>
          {isCursor && pivot && (
            <div
              role="presentation"
              className="relative flex h-40 w-72 cursor-none items-center justify-around overflow-hidden rounded-md border bg-card/60"
              onPointerMove={(e) => {
                const box = e.currentTarget.getBoundingClientRect();
                if (follower.current) follower.current.style.transform = `translate(${e.clientX - box.left - pivot.x * zoom}px, ${e.clientY - box.top - pivot.y * zoom}px)`;
              }}
              onPointerLeave={() => {
                if (follower.current) follower.current.style.transform = 'translate(-9999px, -9999px)';
              }}
            >
              <Button variant="outline" size="sm" className="cursor-none">{t('details.ui.image.target')}</Button>
              <Button size="sm" className="cursor-none">{t('details.ui.image.other')}</Button>
              <span className="pointer-events-none absolute top-1.5 left-2 text-xs text-muted-foreground">{t('details.ui.image.tryIt')}</span>
              <div ref={follower} className="pointer-events-none absolute top-0 left-0" style={{ transform: 'translate(-9999px, -9999px)' }}>
                <Painted width={rect.width} height={rect.height} zoom={zoom} draw={draw} />
              </div>
            </div>
          )}
        </>
      }
      controls={
        <>
          {states.length > 1 && (
            <Section title={t('details.ui.state')}>
              <ToggleGroup type="single" variant="outline" size="sm" aria-label={t('details.ui.state')} value={state} onValueChange={(value) => value && setState(value)} className="flex-wrap">
                {states.map((name) => <ToggleGroupItem key={name} value={name}>{name}</ToggleGroupItem>)}
              </ToggleGroup>
            </Section>
          )}
          <Section title={isCursor ? t('details.ui.image.hotspot') : t('details.ui.image.pivot')}>
            <Field orientation="horizontal">
              <Switch id="ui-hotspot" checked={hotspot} disabled={!pivot} onCheckedChange={setHotspot} />
              <FieldLabel htmlFor="ui-hotspot">{isCursor ? t('details.ui.image.showHotspot') : t('details.ui.image.showPivot')}</FieldLabel>
            </Field>
            <dl className="flex flex-col gap-1.5">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{isCursor ? t('details.ui.image.hotspot') : t('details.ui.image.pivot')}</dt>
                <dd className="font-mono tabular-nums">{pivot ? t('units.px', { value: `${number(pivot.logical?.x ?? pivot.x / scale, { maximumFractionDigits: 2 })}, ${number(pivot.logical?.y ?? pivot.y / scale, { maximumFractionDigits: 2 })}` }) : '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t('details.ui.image.size')}</dt>
                <dd className="font-mono tabular-nums">{t('units.px', { value: `${Math.round(rect.width / scale)}×${Math.round(rect.height / scale)}` })}</dd>
              </div>
            </dl>
          </Section>
          {controls}
        </>
      }
    />
  );
}

/**
 * An interface piece shown the way a game uses it: a nine-slice stretched, a bar filled to a value, a bitmap font setting
 * text, a cursor held by its hotspot. What the sheet says (`meta.data`: `kind`, `nineSlice`, `fillBox`, `font`, `pivot`) decides which.
 */
export function UiDetails({ asset }: { asset: AssetFileMeta }) {
  const { atlas, atlasError, image, failed } = useSheet(asset);
  const { t } = useT();
  const [zoom, setZoom] = usePref<number>('details.ui.zoom', 3);
  const [backdrop, setBackdrop] = usePref<Backdrop>('details.backdrop', 'checker');
  useWindowKeydown((e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
    if (e.key === 'b' || e.key === 'B') setBackdrop(NEXT_BACKDROP[backdrop]);
    else if (e.key === '+' || e.key === '=') setZoom(ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, ZOOMS.indexOf(zoom as (typeof ZOOMS)[number]) + 1))]);
    else if (e.key === '-') setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom as (typeof ZOOMS)[number]) - 1)]);
    else return;
    e.preventDefault();
  });

  if (failed || atlasError) {
    return (
      <Alert variant="destructive" className="m-4 w-auto">
        <AlertDescription>{failed ? t('errors.loadFile', { url: asset.url }) : atlasError?.message}</AlertDescription>
      </Alert>
    );
  }
  if (!atlas || !image) return null;
  const data = atlas.meta.data;
  const scale = atlas.meta.scale ?? 1;
  const controls = <ViewControls zoom={zoom} onZoom={setZoom} backdrop={backdrop} onBackdrop={setBackdrop} />;
  const demo = { atlas, image, scale, zoom, controls, backdrop };
  if (data?.kind === 'bar') return <BarDemo {...demo} />;
  if (data?.kind === 'font' && data.font) return <FontDemo {...demo} />;
  if (data?.nineSlice) return <NineSliceDemo {...demo} />;
  return <ImageDemo {...demo} />;
}
