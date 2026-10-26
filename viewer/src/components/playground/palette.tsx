import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Field, FieldDescription, FieldLegend, FieldSet, FieldTitle } from '@/components/ui/field';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Rich, useT } from '@/i18n';
import type { Entry } from '@/lib/playground/catalog';
import { controlRows, placeHintVars } from '@/lib/playground/controls';
import type { Armed, Character, Library } from '@/lib/playground/library';
import { keyLabel } from '@/lib/shortcuts';
import { PlacementList } from './placement-list';
import { PlayerPicker } from './player-picker';

interface Props {
  library: Library;
  entries: Entry[];
  recent: string[];
  player: Character | null;
  onPlayer: (id: string) => void;
  armed: Armed | null;
  onArm: (item: Armed | null) => void;
}

export function Palette({ library, entries, recent, player, onPlayer, armed, onArm }: Props) {
  const { t } = useT();
  const directions = armed?.type === 'sprite' ? (armed.clip.atlas.meta.directions ?? []) : [];
  return (
    <aside data-tour="playground" className="flex min-h-0 flex-1 flex-col gap-5 p-4">
      {library.characters.length > 0 && (
        <FieldSet>
          <FieldLegend variant="label" className="mb-0 text-muted-foreground uppercase">{t('playground.palette.character')}</FieldLegend>
          <PlayerPicker characters={library.characters} player={player} onPlayer={onPlayer} />
          {player && <Controls character={player} />}
        </FieldSet>
      )}

      <FieldSet className="min-h-0 flex-1">
        <FieldLegend variant="label" className="mb-0 text-muted-foreground uppercase">{t('playground.palette.place')}</FieldLegend>
        <FieldDescription><Rich id="playground.palette.placeHint" vars={placeHintVars(t)} /></FieldDescription>
        <PlacementList
          entries={entries}
          recent={recent}
          armedKey={armed?.key ?? null}
          playerId={player?.id ?? null}
          onArm={onArm}
          onControl={onPlayer}
        />
        {armed?.type === 'sprite' && directions.length > 1 && (
          <Field>
            <FieldTitle id="playground-facing">{t('playground.palette.direction')}</FieldTitle>
            <ToggleGroup type="single" variant="outline" size="sm" spacing={0} aria-labelledby="playground-facing" value={String(armed.row)} onValueChange={(row) => row && onArm({ ...armed, row: Number(row) })} className="flex-wrap">
              {directions.map((name, row) => <ToggleGroupItem key={name} value={String(row)}>{name}</ToggleGroupItem>)}
            </ToggleGroup>
          </Field>
        )}
      </FieldSet>
    </aside>
  );
}

/** The keys of the controlled character, as the shortcuts window shows them (`lib/playground/controls.ts`), with the clip each one plays. */
function Controls({ character }: { character: Character }) {
  const { t } = useT();
  const rows = controlRows(character, t);
  return (
    <>
      <dl className="flex flex-col gap-1.5 text-muted-foreground">
        {rows.map(({ keys, label, kind }) => (
          <div key={`${keys.join('')}-${label}`} className="flex items-center justify-between gap-2">
            <dt className="flex items-center gap-1.5">
              <span>{label}</span>
              {kind && kind !== label && <Badge variant="outline">{kind}</Badge>}
            </dt>
            {/* W A S D over the arrows: the caps wrap after four, as in the shortcuts window. */}
            <dd>
              <KbdGroup className="max-w-28 flex-wrap justify-end">
                {keys.map((key) => <Kbd key={key}>{keyLabel(t, key)}</Kbd>)}
              </KbdGroup>
            </dd>
          </div>
        ))}
      </dl>
      {character.warnings.length > 0 && (
        <Alert>
          <AlertDescription>
            <ul className="flex list-disc flex-col gap-0.5 pl-4">
              {character.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
