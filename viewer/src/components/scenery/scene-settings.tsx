import { useState } from 'react';
import type { SceneData, SceneryCatalog } from '@core/volume';
import { FilePlusIcon } from 'lucide-react';
import { RoleFields } from '@/components/customize/role-fields';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useT } from '@/i18n';
import { splitRoles } from '@/lib/outfit/edit';
import type { SavedScene } from '@/lib/scenery/catalog';
import { MAX_SIZE, MIN_SIZE, clampSize, countCells, emptyScene, resize, rolesInScene, setSceneMaterial } from '@/lib/scenery/edit';

interface Props {
  catalog: SceneryCatalog;
  scene: SceneData;
  saved: SavedScene[];
  /** The saved scene the current one came from, if any. */
  loaded: string | null;
  onEdit: (update: (scene: SceneData) => SceneData) => void;
  /** Replaces the scene with a loaded or a new one: a normal edit, so it can be undone. */
  onLoad: (scene: SceneData, name: string | null) => void;
}

/** A size field that applies when it is left or confirmed: typing "12" must not pass through a scene of 1. */
function SizeField({ id, label, value, onCommit }: { id: string; label: string; value: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null) onCommit(clampSize(Number(draft)));
    setDraft(null);
  };
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="number"
        min={MIN_SIZE}
        max={MAX_SIZE}
        className="font-mono"
        value={draft ?? value}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </Field>
  );
}

/** Which scene is open, its size and the materials its pieces are made of. */
export function SceneSettings({ catalog, scene, saved, loaded, onEdit, onLoad }: Props) {
  const { t, plural } = useT();
  const roles = splitRoles(rolesInScene(scene, catalog));

  return (
    <div className="flex flex-col gap-5">
      <FieldGroup className="gap-3">
        <Field>
          <FieldLabel htmlFor="scene-open">{t('scenery.settings.scene')}</FieldLabel>
          <Select value={loaded ?? ''} onValueChange={(name) => { const found = saved.find((s) => s.name === name); if (found) onLoad(found.scene, found.name); }} disabled={saved.length === 0}>
            <SelectTrigger id="scene-open" className="w-full"><SelectValue placeholder={saved.length === 0 ? t('scenery.settings.none') : t('scenery.settings.open')} /></SelectTrigger>
            <SelectContent>
              <SelectGroup>{saved.map((s) => <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>)}</SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>{t('scenery.settings.replaces')}</FieldDescription>
        </Field>
        <Button variant="outline" size="sm" onClick={() => onLoad(emptyScene(catalog, scene.cols, scene.rows), null)}>
          <FilePlusIcon data-icon="inline-start" />
          {t('scenery.settings.blank')}
        </Button>
      </FieldGroup>

      <FieldSet className="min-w-0">
        <FieldLegend variant="label">{t('scenery.settings.size')}</FieldLegend>
        <div className="grid grid-cols-2 gap-3">
          <SizeField id="scene-cols" label={t('scenery.settings.columns')} value={scene.cols} onCommit={(cols) => onEdit((s) => resize(s, catalog, cols, s.rows))} />
          <SizeField id="scene-rows" label={t('scenery.settings.rows')} value={scene.rows} onCommit={(rows) => onEdit((s) => resize(s, catalog, s.cols, rows))} />
        </div>
        <p className="text-muted-foreground tabular-nums">
          {plural('scenery.settings.floorCells', countCells(scene.floor))} · {plural('scenery.settings.walls', countCells(scene.walls))} · {plural('scenery.settings.props', scene.props.length)}
        </p>
      </FieldSet>

      <FieldSet className="min-w-0">
        <FieldLegend variant="label">{t('scenery.settings.materials')}</FieldLegend>
        {roles.main.length + roles.advanced.length === 0 ? (
          <p className="text-muted-foreground">{t('scenery.settings.paintFirst')}</p>
        ) : (
          <RoleFields
            idPrefix="scene-mat"
            main={roles.main}
            advanced={roles.advanced}
            materials={catalog.materials}
            value={scene.materials}
            noneLabel={(role) => (catalog.defaultMaterials[role] ? t('scenery.settings.defaultWith', { material: catalog.defaultMaterials[role] }) : t('scenery.settings.default'))}
            noneMaterial={(role) => catalog.defaultMaterials[role]}
            advancedTitle={t('scenery.settings.advanced')}
            onChange={(role, name) => onEdit((s) => setSceneMaterial(s, role, name))}
          />
        )}
      </FieldSet>
    </div>
  );
}
