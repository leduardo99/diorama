import type { ComponentType, ReactNode } from 'react';
import NiceModal from '@ebay/nice-modal-react';
import { CopyIcon, ExternalLinkIcon, EyeIcon, FileJsonIcon, MoreHorizontalIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut, ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';
import { copyText } from '@/lib/clipboard';
import { useReexport } from '@/lib/mutations';
import { stripExtension } from '@/lib/format';
import { projectFile, projectUrl } from '@/lib/project-paths';
import type { AssetGroup } from '@/lib/groups';
import type { AssetFileMeta } from '@/lib/types';
import { DeleteAssetsModal } from '@/modals/delete-assets-modal';

interface ItemProps {
  variant?: 'default' | 'destructive';
  disabled?: boolean;
  onSelect?: () => void;
  children?: ReactNode;
}

/** The dropdown and the right-click menu share their items; only the primitives differ. */
interface MenuParts {
  Group: ComponentType<{ children?: ReactNode }>;
  Item: ComponentType<ItemProps>;
  Separator: ComponentType;
  Shortcut: ComponentType<{ children?: ReactNode }>;
}

const dropdownParts: MenuParts = {
  Group: DropdownMenuGroup, Item: DropdownMenuItem, Separator: DropdownMenuSeparator, Shortcut: DropdownMenuShortcut,
};
const contextParts: MenuParts = {
  Group: ContextMenuGroup, Item: ContextMenuItem, Separator: ContextMenuSeparator, Shortcut: ContextMenuShortcut,
};

const askDelete = (assets: AssetFileMeta[]) => void NiceModal.show(DeleteAssetsModal, { assets });

interface AssetProps {
  asset: AssetFileMeta;
  onPreview?: (asset: AssetFileMeta) => void;
}

function AssetItems({ asset, onPreview, parts: { Group, Item, Separator, Shortcut } }: AssetProps & { parts: MenuParts }) {
  const reexport = useReexport();
  const { t } = useT();
  const sheetPath = asset.sheet ? projectFile(asset.project, `sheets/${asset.sheet}`) : null;
  return (
    <>
      <Group>
        {onPreview && (
          <Item onSelect={() => onPreview(asset)}>
            <EyeIcon />
            {t('assets.menu.preview')}
            <Shortcut>↵</Shortcut>
          </Item>
        )}
        <Item disabled={!asset.sheet} onSelect={() => reexport.mutate(asset)}>
          <RefreshCwIcon />
          {t('assets.menu.exportAgain')}
        </Item>
      </Group>
      <Separator />
      <Group>
        <Item disabled={!sheetPath} onSelect={() => sheetPath && void copyText(sheetPath, t('assets.menu.sheetPathLabel'))}>
          <CopyIcon />
          {t('assets.menu.copySheetPath')}
        </Item>
        <Item onSelect={() => void copyText(projectFile(asset.project, `assets/${asset.subpath}`), t('assets.menu.filePathLabel'))}>
          <CopyIcon />
          {t('assets.menu.copyFilePath')}
        </Item>
        <Item disabled={!asset.atlas} onSelect={() => window.open(projectUrl(asset.project, `assets/${asset.atlas}`), '_blank', 'noopener')}>
          <FileJsonIcon />
          {t('assets.menu.openAtlas')}
        </Item>
        <Item onSelect={() => window.open(`${asset.url}?t=${asset.mtime}`, '_blank', 'noopener')}>
          <ExternalLinkIcon />
          {t('assets.menu.openImage')}
        </Item>
      </Group>
      <Separator />
      <Group>
        <Item variant="destructive" onSelect={() => askDelete([asset])}>
          <Trash2Icon />
          {t('assets.menu.delete')}
          <Shortcut>⌫</Shortcut>
        </Item>
      </Group>
    </>
  );
}

export function AssetMenuButton({ asset, onPreview }: AssetProps) {
  const { t } = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('assets.menu.actionsFor', { name: stripExtension(asset.subpath) })}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      {/* The menu is portaled, but React still bubbles its clicks to the card that renders it. */}
      <DropdownMenuContent align="end" className="w-64" onClick={(e) => e.stopPropagation()} onCloseAutoFocus={(e) => e.preventDefault()}>
        <AssetItems asset={asset} onPreview={onPreview} parts={dropdownParts} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Right-click menu around a card or row, with the same actions as the ⋯ button. */
export function AssetContextMenu({ asset, onPreview, children }: AssetProps & { children: ReactNode }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-64" onCloseAutoFocus={(e) => e.preventDefault()}>
        <AssetItems asset={asset} onPreview={onPreview} parts={contextParts} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

interface GroupProps {
  group: AssetGroup;
  onOpen: (asset: AssetFileMeta) => void;
}

function GroupItems({ group, onOpen, parts: { Group, Item, Separator, Shortcut } }: GroupProps & { parts: MenuParts }) {
  const reexport = useReexport();
  const { t, plural } = useT();
  const [first] = group.assets;
  return (
    <>
      <Group>
        <Item onSelect={() => onOpen(first)}>
          <EyeIcon />
          {t('assets.menu.group.open')}
          <Shortcut>↵</Shortcut>
        </Item>
        <Item onSelect={() => group.assets.filter((a) => a.sheet).forEach((a) => reexport.mutate(a))}>
          <RefreshCwIcon />
          {t('assets.menu.group.exportAll')}
        </Item>
      </Group>
      <Separator />
      <Group>
        <Item onSelect={() => void copyText(projectFile(first.project, `assets/${group.folder}/`), t('assets.menu.group.folderPathLabel'))}>
          <CopyIcon />
          {t('assets.menu.group.copyFolderPath')}
        </Item>
      </Group>
      <Separator />
      <Group>
        <Item variant="destructive" onSelect={() => askDelete(group.assets)}>
          <Trash2Icon />
          {plural('assets.menu.group.deleteAll', group.assets.length)}
        </Item>
      </Group>
    </>
  );
}

export function GroupMenuButton({ group, onOpen }: GroupProps) {
  const { t } = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t('assets.menu.actionsFor', { name: group.name })} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64" onClick={(e) => e.stopPropagation()} onCloseAutoFocus={(e) => e.preventDefault()}>
        <GroupItems group={group} onOpen={onOpen} parts={dropdownParts} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function GroupContextMenu({ group, onOpen, children }: GroupProps & { children: ReactNode }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-64" onCloseAutoFocus={(e) => e.preventDefault()}>
        <GroupItems group={group} onOpen={onOpen} parts={contextParts} />
      </ContextMenuContent>
    </ContextMenu>
  );
}
