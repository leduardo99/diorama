import { Redo2Icon, Undo2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useT } from '@/i18n';

interface Props {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  className?: string;
}

/**
 * Undo and redo, the same on every bar that edits (the outfit, the scene): outline icon buttons of the bar's control size in
 * a group, each with its shortcut in a tooltip. A disabled button gets no pointer events, so each one sits in a `span` the
 * tooltip hangs on, as shadcn's tooltip docs show: the shortcut still shows while there is nothing to undo. The span is the
 * group's child, so the joined corners are set on the buttons.
 */
export function HistoryButtons({ canUndo, canRedo, onUndo, onRedo, className }: Props) {
  const { t } = useT();
  return (
    <ButtonGroup aria-label={t('common.history')} className={className}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Button variant="outline" size="icon-sm" className="rounded-r-none" aria-label={t('common.undo')} disabled={!canUndo} onClick={onUndo}><Undo2Icon /></Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{t('common.undo')} <Kbd>⌘Z</Kbd></TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Button variant="outline" size="icon-sm" className="rounded-l-none border-l-0" aria-label={t('common.redo')} disabled={!canRedo} onClick={onRedo}><Redo2Icon /></Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{t('common.redo')} <Kbd>⇧⌘Z</Kbd></TooltipContent>
      </Tooltip>
    </ButtonGroup>
  );
}
