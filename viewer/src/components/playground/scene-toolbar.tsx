import { useRef } from 'react';
import { Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel, FieldTitle } from '@/components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useT } from '@/i18n';
import type { Armed } from '@/lib/playground/library';
import { ZOOMS, type Zoom } from '@/lib/playground/view';
import type { SceneOptions } from './scene';

const SPEEDS = [['1', 'normal'], ['0.25', 'quarter'], ['0.1', 'tenth'], ['0', 'pause']] as const;

/** Radix Select cannot hold an empty value: "no scene" is this sentinel. */
const NO_SCENE = '__none';

interface Props {
  options: SceneOptions;
  /** The zoom chosen, "fit" included; `options.zoom` is the one in effect. */
  zoom: Zoom;
  onZoom: (zoom: Zoom) => void;
  /** Saved scenes of the project that can stand behind the actors, and the one chosen. */
  scenes: string[];
  scene: string;
  onScene: (name: string) => void;
  onOptions: (patch: Partial<SceneOptions>) => void;
  armed: Armed | null;
  onReset: () => void;
}

export function SceneToolbar({ options, zoom, onZoom, scenes, scene, onScene, onOptions, armed, onReset }: Props) {
  const { t } = useT();
  // Whether the scene list was last closed from the keyboard: the canvas it hands the keys to then shows its focus ring, as after Tab.
  const closedByKeyboard = useRef(false);
  // Where characters can go is the scene's: it has none without one.
  const toggles: Array<keyof Pick<SceneOptions, 'shadow' | 'anchor' | 'bounds' | 'sockets' | 'stepEvents' | 'navigation'>> = ['shadow', 'anchor', 'bounds', 'sockets', 'stepEvents', ...(scene ? (['navigation'] as const) : [])];
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b px-4 py-2">
      <Field orientation="horizontal" className="w-auto">
        <FieldTitle id="playground-zoom">{t('playground.toolbar.zoom')}</FieldTitle>
        {/* Fit is the whole scene in view, so it is offered with one; a Fit kept without a scene shows the zoom it falls back to. */}
        <ToggleGroup type="single" variant="outline" size="sm" spacing={0} aria-labelledby="playground-zoom" value={zoom === 'fit' && !scene ? String(options.zoom) : String(zoom)} onValueChange={(value) => value && onZoom(value === 'fit' ? 'fit' : (Number(value) as Zoom))}>
          {scene && <ToggleGroupItem value="fit">{t('playground.toolbar.fit')}</ToggleGroupItem>}
          {ZOOMS.map((z) => <ToggleGroupItem key={z} value={String(z)}>{t('units.times', { value: z })}</ToggleGroupItem>)}
        </ToggleGroup>
      </Field>
      <Field orientation="horizontal" className="w-auto">
        <FieldTitle id="playground-speed">{t('playground.toolbar.speed')}</FieldTitle>
        <ToggleGroup type="single" variant="outline" size="sm" spacing={0} aria-labelledby="playground-speed" value={String(options.speed)} onValueChange={(speed) => speed !== '' && onOptions({ speed: Number(speed) })}>
          {SPEEDS.map(([value, name]) => <ToggleGroupItem key={value} value={value}>{t(`playground.toolbar.speeds.${name}`)}</ToggleGroupItem>)}
        </ToggleGroup>
      </Field>
      {toggles.map((key) => (
        <Field key={key} orientation="horizontal" className="w-auto">
          <Switch id={`playground-${key}`} checked={options[key]} onCheckedChange={(checked) => onOptions({ [key]: checked })} />
          <FieldLabel htmlFor={`playground-${key}`}>{t(`playground.toolbar.${key}`)}</FieldLabel>
        </Field>
      ))}
      {scenes.length > 0 && (
        <Field orientation="horizontal" className="w-auto">
          <FieldLabel htmlFor="playground-scene">{t('playground.toolbar.scene')}</FieldLabel>
          <Select value={scene || NO_SCENE} onValueChange={(name) => onScene(name === NO_SCENE ? '' : name)}>
            <SelectTrigger id="playground-scene" size="sm" className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent
              onKeyDownCapture={() => (closedByKeyboard.current = true)}
              onEscapeKeyDown={() => (closedByKeyboard.current = true)}
              onPointerUpCapture={() => (closedByKeyboard.current = false)}
              onPointerDownOutside={() => (closedByKeyboard.current = false)}
              onCloseAutoFocus={(e) => {
                // Closing the list (a pick, Esc, a click outside) hands the keys to the scene. Radix would focus the select
                // again, whose typeahead picks a scene by its letter and whose Space and arrows open the list.
                e.preventDefault();
                // `focusVisible` is not in TypeScript's FocusOptions yet; a browser without it falls back to its own guess.
                document.getElementById('playground-canvas')?.focus({ focusVisible: closedByKeyboard.current } as FocusOptions);
              }}
            >
              <SelectGroup>
                <SelectItem value={NO_SCENE}>{t('playground.toolbar.none')}</SelectItem>
                {scenes.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      )}
      {armed && <span className="text-muted-foreground">{t('playground.toolbar.placing')}</span>}
      <Button variant="outline" size="sm" className="ml-auto" onClick={onReset}>
        <Trash2Icon data-icon="inline-start" />
        {t('playground.toolbar.clear')}
      </Button>
    </div>
  );
}
