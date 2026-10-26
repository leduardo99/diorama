import type { RefObject } from 'react';
import { CopyIcon, GamepadIcon, RotateCcwIcon, RotateCwIcon, Trash2Icon, XIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ButtonGroup, ButtonGroupText } from '@/components/ui/button-group';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useT } from '@/i18n';
import type { SceneHandle, Selection } from './scene';

interface Props {
  selection: Selection | null;
  handle: RefObject<SceneHandle | null>;
  /** The scene sizes and moves this element over the selected sprite, so the popover follows it. */
  anchorRef: RefObject<HTMLDivElement | null>;
  /** The popover stays inside this element instead of spilling over the palette. */
  boundaryRef: RefObject<HTMLElement | null>;
}

/**
 * The few things that can be done with the sprite selected on the scene, in a small popover on top of it.
 * It never takes focus: the keyboard keeps driving the scene (WASD, Space, Delete).
 */
export function SelectionPopover({ selection, handle, anchorRef, boundaryRef }: Props) {
  const { t } = useT();
  // A control keeps focus after it is used, and Space on a focused button would press it again.
  const run = (command: (scene: SceneHandle) => void) => {
    if (handle.current) command(handle.current);
    requestAnimationFrame(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
  };
  const turns = selection?.directions.length ?? 0;
  const turn = (by: 1 | -1) => selection && run((scene) => scene.setRow((selection.row + by + turns) % turns));

  return (
    <Popover open={selection !== null && !selection.busy}>
      <PopoverAnchor asChild>
        <div ref={anchorRef} aria-hidden className="pointer-events-none absolute top-0 left-0" />
      </PopoverAnchor>
      <PopoverContent
        side="top"
        sideOffset={10}
        collisionBoundary={boundaryRef.current ?? undefined}
        collisionPadding={8}
        updatePositionStrategy="always"
        className="w-auto min-w-64 gap-2"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        // The scene decides when to deselect; clicking it must not close the popover on its own.
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {selection && (
          <>
            <div className="flex items-center gap-2">
              <span className="truncate font-medium">{selection.name}</span>
              {selection.isPlayer && <Badge variant="secondary">{t('playground.popover.controlling')}</Badge>}
              <Button variant="ghost" size="icon-xs" className="ml-auto" aria-label={t('playground.popover.close')} onClick={() => run((scene) => scene.deselect())}>
                <XIcon />
              </Button>
            </div>

            {(turns > 1 || (selection.clips.length > 1 && !selection.isPlayer)) && (
              <div className="flex items-center gap-2">
                {turns > 1 && (
                  <ButtonGroup aria-label={t('playground.popover.direction')}>
                    <Button variant="outline" size="icon-sm" aria-label={t('playground.popover.turnLeft')} onClick={() => turn(-1)}>
                      <RotateCcwIcon />
                    </Button>
                    <ButtonGroupText className="min-w-9 justify-center tabular-nums">{selection.directions[selection.row]}</ButtonGroupText>
                    <Button variant="outline" size="icon-sm" aria-label={t('playground.popover.turnRight')} onClick={() => turn(1)}>
                      <RotateCwIcon />
                    </Button>
                  </ButtonGroup>
                )}
                {selection.clips.length > 1 && !selection.isPlayer && (
                  <Select value={selection.clip} onValueChange={(name) => run((scene) => scene.setClip(name))}>
                    <SelectTrigger size="sm" aria-label={t('playground.popover.animation')} className="min-w-0 flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {selection.clips.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Delete is shadcn's destructive button in a group of its own: nested groups stand apart, so its tint never runs into the outline buttons. */}
            <ButtonGroup className="w-full">
              <ButtonGroup className="flex-1">
                {selection.isCharacter && !selection.isPlayer && (
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => run((scene) => scene.control())}>
                    <GamepadIcon data-icon="inline-start" />
                    {t('playground.popover.control')}
                  </Button>
                )}
                <Button variant="outline" size="sm" className="flex-1" onClick={() => run((scene) => scene.duplicate())}>
                  <CopyIcon data-icon="inline-start" />
                  {t('playground.popover.duplicate')}
                </Button>
              </ButtonGroup>
              <ButtonGroup>
                <Button variant="destructive" size="sm" disabled={selection.isPlayer} onClick={() => run((scene) => scene.remove())}>
                  <Trash2Icon data-icon="inline-start" />
                  {t('playground.popover.delete')}
                </Button>
              </ButtonGroup>
            </ButtonGroup>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
