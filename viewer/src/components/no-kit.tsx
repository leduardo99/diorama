import type { ReactNode } from 'react';
import { CopyIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useT } from '@/i18n';
import { copyText } from '@/lib/clipboard';

interface Props {
  icon: ReactNode;
  title: string;
  /** What the kit is and what it exports. */
  description: ReactNode;
  /** The command that starts one (`npm run new-kit -- <project> gear`), shown to copy. */
  command: string;
  /** The way to try the tab without one: a link to the same tab with the built-in kit (`?fixture=true`). */
  tryBuiltIn: ReactNode;
}

/**
 * A tab whose kit the project has not got (Customize's gear kit, Scenery's scenery kit): what the kit is, the command that
 * starts one, to copy for a terminal, and the built-in kit to try the tab with. The built-in kit is the viewer's own: what is
 * made with it is not the project's, and saving it fails, since the commands that save read the project's kit.
 */
export function NoKit({ icon, title, description, command, tryBuiltIn }: Props) {
  const { t } = useT();
  return (
    <Empty className="h-full">
      <EmptyHeader className="max-w-md">
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="max-w-md">
        <div className="flex w-full items-center gap-2 rounded-md bg-muted/50 p-2 text-left">
          <Badge variant="outline">CLI</Badge>
          <span className="sr-only">{t('noKit.terminal')}</span>
          <code className="min-w-0 flex-1 truncate font-mono text-xs">{command}</code>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={t('noKit.copyCommand')} onClick={() => void copyText(command, t('noKit.commandLabel'))}>
                <CopyIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('noKit.copyCommand')}</TooltipContent>
          </Tooltip>
        </div>
        {tryBuiltIn}
        <p className="text-muted-foreground">{t('noKit.builtInHint')}</p>
      </EmptyContent>
    </Empty>
  );
}
