import type { ReactNode } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, RefreshCwIcon, XIcon } from 'lucide-react';
import { AssetMenuButton } from '@/components/asset-menu';
import { SidePanelLayout } from '@/components/side-panel-layout';
import { EngineBadge } from '@/components/engine-badge';
import { StaleBadge } from '@/components/stale-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DialogClose, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { Spinner } from '@/components/ui/spinner';
import { detailsTitle } from '@/lib/asset-role';
import { isStale } from '@/lib/export-state';
import { useT } from '@/i18n';
import { basename, dirname, stripExtension } from '@/lib/format';
import { peersOf } from '@/lib/groups';
import { isTyping, useWindowKeydown } from '@/lib/hotkeys';
import { useReexport } from '@/lib/mutations';
import type { AssetFileMeta } from '@/lib/types';

/** The assets [ and ] step through (`lib/groups.ts: peersOf`): a character's other animations, or the list the Details window was opened from. */
export function usePeers(asset: AssetFileMeta, clips: AssetFileMeta[], visibleAssets: AssetFileMeta[], onSelect: (asset: AssetFileMeta) => void) {
  const { peers, position, stepsClips, at } = peersOf(asset, clips, visibleAssets);
  const go = (offset: number) => {
    const next = at(offset);
    if (next) onSelect(next);
  };
  return { peers, position, go, stepsClips };
}

export type Peers = ReturnType<typeof usePeers>;

/**
 * The top of every Details window: the asset's name, where it is, its size and export state, stepping through its peers,
 * exporting again, closing. The name is the character's for a clip (`detailsTitle`); the file, the clip of a character,
 * comes last in the path, unless it is the name already.
 */
export function DetailsHeader({ asset, peers }: { asset: AssetFileMeta; peers: Peers }) {
  const reexport = useReexport();
  const { t, bytes } = useT();
  const title = detailsTitle(asset);
  const folder = dirname(asset.subpath);
  const file = basename(stripExtension(asset.subpath));
  const { position, go, stepsClips } = peers;
  return (
    <header className="flex items-center justify-between gap-4 border-b py-2 pr-3 pl-4">
      <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
        <DialogTitle className="truncate">{title}</DialogTitle>
        <span className="flex min-w-0 shrink-[4] items-center gap-2 text-muted-foreground">
          <span className="truncate">{asset.project}</span>
          {folder && <><span className="text-muted-foreground/60">/</span><span className="truncate">{folder}</span></>}
          {file !== title && <><span className="text-muted-foreground/60">/</span><span className="truncate">{file}</span></>}
        </span>
        {asset.engine && <EngineBadge engine={asset.engine} />}
        {asset.width && asset.height && <Badge variant="secondary" className="tabular-nums">{asset.width}×{asset.height}</Badge>}
        <Badge variant="secondary" className="tabular-nums">{bytes(asset.size)}</Badge>
        {isStale(asset) && <StaleBadge />}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon-sm" aria-label={stepsClips ? t('details.shell.previousAnimation') : t('details.shell.previousAsset')} disabled={stepsClips && peers.peers.length === 1 ? true : !stepsClips && position <= 0} onClick={() => go(-1)}>
          <ChevronLeftIcon />
        </Button>
        <span className="text-muted-foreground tabular-nums">{position + 1}/{peers.peers.length}</span>
        <Button variant="ghost" size="icon-sm" aria-label={stepsClips ? t('details.shell.nextAnimation') : t('details.shell.nextAsset')} disabled={!stepsClips && (position < 0 || position >= peers.peers.length - 1)} onClick={() => go(1)}>
          <ChevronRightIcon />
        </Button>
        <Button variant="outline" size="sm" className="ml-2" disabled={!asset.sheet || reexport.isPending} onClick={() => reexport.mutate(asset)}>
          {reexport.isPending ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
          {t('details.shell.exportAgain')}
        </Button>
        <AssetMenuButton asset={asset} />
        <DialogClose asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t('details.shell.close')}>
            <XIcon />
          </Button>
        </DialogClose>
      </div>
    </header>
  );
}

/** The stage of a Details window beside its inspector, which can be widened (one width remembered for every kind of asset). */
export function DetailsColumns({ stage, inspector }: { stage: ReactNode; inspector: ReactNode }) {
  return (
    <SidePanelLayout id="details" side="end" size={{ initial: '20rem', min: '16rem', max: '40rem' }} panel={inspector}>
      {stage}
    </SidePanelLayout>
  );
}

/** The Details window of an asset that is not played frame by frame: the header, its own body, and the keys it answers to. */
export function DetailsShell({ asset, peers, hints, children }: { asset: AssetFileMeta; peers: Peers; hints: ReactNode; children: ReactNode }) {
  const { t } = useT();
  useWindowKeydown((e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
    if (e.key === '[') peers.go(-1);
    else if (e.key === ']') peers.go(1);
    else return;
    e.preventDefault();
  });
  return (
    <>
      <DetailsHeader asset={asset} peers={peers} />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      <footer className="flex items-center gap-4 border-t px-4 py-1.5 text-xs text-muted-foreground">
        <span><Kbd>[</Kbd> <Kbd>]</Kbd> {peers.stepsClips ? t('details.footer.animation') : t('details.footer.asset')}</span>
        {hints}
      </footer>
    </>
  );
}
