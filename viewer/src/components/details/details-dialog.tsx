import { useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FrameCount } from '@/components/frame-counts';
import { Kbd } from '@/components/ui/kbd';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { roleOf } from '@/lib/asset-role';
import { useT } from '@/i18n';
import { basename, stripExtension } from '@/lib/format';
import { clipsOf } from '@/lib/groups';
import { isTyping, useWindowKeydown } from '@/lib/hotkeys';
import { digitRow, keyedAxis, stepRow } from '@/lib/rows';
import type { AssetFileMeta } from '@/lib/types';
import { IconDetails } from './icon-details';
import { Inspector } from './inspector';
import { DetailsHeader, DetailsShell, usePeers } from './details-shell';
import { Stage } from './stage';
import { Transport } from './transport';
import { UiDetails } from './ui-details';
import { usePlayer, type Backdrop } from './use-player';
import { VfxSection, useVfx } from './vfx-section';

interface Props {
  asset: AssetFileMeta;
  /** Every asset of the project: the other animations of a character are found here. */
  projectAssets: AssetFileMeta[];
  /** The assets in the order the list shows them, for stepping through the list. */
  visibleAssets: AssetFileMeta[];
  onClose: () => void;
  onSelect: (asset: AssetFileMeta) => void;
}

export function DetailsDialog({ asset, projectAssets, visibleAssets, onClose, onSelect }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  // The facing direction survives switching between the animations of one character.
  const [directionIndex, setDirectionIndex] = useState(0);
  const clips = useMemo(() => clipsOf(projectAssets, asset), [projectAssets, asset]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        ref={contentRef}
        showCloseButton={false}
        tabIndex={-1}
        aria-describedby={undefined}
        className="flex h-[92vh] w-[94vw] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
        // Keep focus on the dialog itself so no toolbar button shows a focus ring on open.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          contentRef.current?.focus();
        }}
      >
        <DetailsBody
          key={`${asset.project}/${asset.subpath}/${asset.mtime}`}
          asset={asset}
          clips={clips}
          projectAssets={projectAssets}
          visibleAssets={visibleAssets}
          directionIndex={directionIndex}
          onDirection={setDirectionIndex}
          onSelect={onSelect}
        />
      </DialogContent>
    </Dialog>
  );
}

interface BodyProps {
  asset: AssetFileMeta;
  /** Every asset of the project: the other animations of a character, the icons of an inventory and the effect an effect follows are found here. */
  projectAssets: AssetFileMeta[];
  clips: AssetFileMeta[];
  visibleAssets: AssetFileMeta[];
  directionIndex: number;
  onDirection: (index: number) => void;
  onSelect: (asset: AssetFileMeta) => void;
}

/** What the Details window shows depends on what the asset is: an item icon in an inventory, an interface piece stretched or filled, anything else played frame by frame. */
function DetailsBody(props: BodyProps) {
  const { asset, clips, visibleAssets, projectAssets, onSelect } = props;
  const peers = usePeers(asset, clips, visibleAssets, onSelect);
  const { t } = useT();
  const role = roleOf(asset);
  if (role === 'icon') {
    return (
      <DetailsShell asset={asset} peers={peers} hints={<span>{t('details.iconHint')}</span>}>
        <IconDetails asset={asset} projectAssets={projectAssets} onSelect={onSelect} />
      </DetailsShell>
    );
  }
  if (role === 'ui') {
    return (
      <DetailsShell asset={asset} peers={peers} hints={<span><Kbd>B</Kbd> {t('details.footer.background')}</span>}>
        <UiDetails asset={asset} />
      </DetailsShell>
    );
  }
  return <PlayerBody {...props} peers={peers} />;
}

function PlayerBody({ asset, clips, projectAssets, peers, directionIndex, onDirection, onSelect }: BodyProps & { peers: ReturnType<typeof usePeers> }) {
  const player = usePlayer(asset, directionIndex);
  const { t, plural } = useT();
  const [highlight, setHighlight] = useState<string | null>(null);
  const { rows, frames } = player;
  // ↑ ↓ and the digits turn the facings, or step through a scenery clip's variants or a wall's heights when the rows are those.
  const keyed = keyedAxis(rows);
  // An effect shows its reach and, for a projectile, flies at its own speed.
  const vfx = useVfx(player, directionIndex);
  const { go } = peers;

  useWindowKeydown((e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
    const turn = (offset: number) => keyed && onDirection(stepRow(rows, directionIndex, offset));
    switch (e.key) {
      case ' ': player.setPlaying(!player.playing); break;
      case 'ArrowRight': player.seek(player.index + 1); break;
      case 'ArrowLeft': player.seek(player.index - 1); break;
      case 'ArrowUp': turn(-1); break;
      case 'ArrowDown': turn(1); break;
      case '[': go(-1); break;
      case ']': go(1); break;
      case 'p': case 'P': player.setShowPivot(!player.showPivot); break;
      case 'g': case 'G': player.setShowBounds(!player.showBounds); break;
      case 'b': case 'B': player.setBackdrop((({ checker: 'dark', dark: 'light', light: 'checker' }) as Record<Backdrop, Backdrop>)[player.backdrop]); break;
      case '+': case '=': player.stepZoom(1); break;
      case '-': player.stepZoom(-1); break;
      case '0': player.setZoom('fit'); break;
      default: {
        const row = /^[1-9]$/.test(e.key) ? digitRow(rows, directionIndex, Number(e.key)) : null;
        if (row === null) return;
        onDirection(row);
      }
    }
    e.preventDefault();
  });

  return (
    <>
      <DetailsHeader asset={asset} peers={peers} />

      {clips.length > 1 && (
        <div className="flex items-center gap-3 border-b px-4 py-1.5">
          <span className="text-xs text-muted-foreground">{t('details.clips')}</span>
          <Tabs value={asset.subpath} onValueChange={(subpath) => { const next = clips.find((c) => c.subpath === subpath); if (next) onSelect(next); }}>
            <TabsList variant="line">
              {clips.map((clip) => (
                <TabsTrigger key={clip.subpath} value={clip.subpath}>
                  {basename(stripExtension(clip.subpath))}
                  {/* The tooltip sits on the count inside the tab: a TooltipTrigger round the tab would take its data-state. */}
                  {clip.atlasInfo && <FrameCount info={clip.atlasInfo} className="text-muted-foreground tabular-nums" />}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_20rem]">
        <section className="flex min-h-0 min-w-0 flex-col">
          <Stage player={player} asset={asset} highlight={highlight} ring={vfx.ringRadius} flight={vfx.flight} />
          <Transport player={player} />
        </section>
        <Inspector
          player={player}
          asset={asset}
          directionIndex={directionIndex}
          onDirection={onDirection}
          onHighlight={setHighlight}
          top={vfx.effect && <VfxSection vfx={vfx} projectAssets={projectAssets} onSelect={onSelect} />}
        />
      </div>

      <footer className="flex items-center gap-4 border-t px-4 py-1.5 text-xs text-muted-foreground">
        <span><Kbd>{t('keys.space')}</Kbd> {t('details.footer.play')}</span>
        <span><Kbd>←</Kbd> <Kbd>→</Kbd> {t('details.footer.frame')}</span>
        {keyed && <span><Kbd>↑</Kbd> <Kbd>↓</Kbd> {keyed === 'step' && rows.axis ? t(`details.footer.${rows.axis}`) : t('details.footer.direction')}</span>}
        <span><Kbd>[</Kbd> <Kbd>]</Kbd> {peers.stepsClips ? t('details.footer.animation') : t('details.footer.asset')}</span>
        <span><Kbd>B</Kbd> {t('details.footer.background')}</span>
        <span><Kbd>+</Kbd> <Kbd>−</Kbd> <Kbd>0</Kbd> {t('details.footer.zoom')}</span>
        <span className="ml-auto tabular-nums">{plural('counts.frames', frames.length)}</span>
      </footer>
    </>
  );
}
