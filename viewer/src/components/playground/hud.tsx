import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Kbd } from '@/components/ui/kbd';
import { useT } from '@/i18n';
import type { HudInfo } from '@/lib/playground/actor';

/** What the controlled character is playing: the clip, its frame and the last event it fired (a stride only when asked); with a scene, the last thing a piece of it did, and what E would use. */
export function Hud({ info, onUse }: { info: HudInfo | null; onUse: () => void }) {
  const { t } = useT();
  if (!info) return null;
  return (
    <Card size="sm" className="pointer-events-none absolute bottom-3 left-3 w-56 gap-1 bg-card/60">
      <CardHeader>
        <CardTitle>{t('playground.hud.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">{t('playground.hud.clip')}</dt>
            <dd className="flex items-center gap-1.5">
              <span className="font-medium">{info.clip}</span>
              <Badge variant="outline">{info.kind}</Badge>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">{t('playground.hud.state')}</dt>
            <dd>{t(`playground.hud.states.${info.state}`)} · {info.direction}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">{t('playground.hud.frame')}</dt>
            <dd className="font-mono tabular-nums">f{info.frame} / f{info.frames - 1}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">{t('playground.hud.event')}</dt>
            <dd className="truncate font-mono">{info.event ?? '—'}</dd>
          </div>
          {info.world && (
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">{t('playground.hud.scene')}</dt>
              <dd className="truncate font-mono">{info.scene ?? '—'}</dd>
            </div>
          )}
        </dl>
        {info.use && (
          <Button size="sm" className="pointer-events-auto mt-2 w-full" onClick={onUse}>
            {info.use} <Kbd>E</Kbd>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
