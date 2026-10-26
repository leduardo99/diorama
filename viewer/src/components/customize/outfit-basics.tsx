import type { GearCatalog, OutfitData } from '@core/rig';
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useT } from '@/i18n';
import { rolesOf, setBase, setMaterial } from '@/lib/outfit/edit';
import type { Edit } from '@/lib/outfit/use-draft';
import { RoleFields } from './role-fields';

const NO_BASE = '__none';

/** The body underneath and the material that plays each role, for the whole outfit: what both views of the editor start with. */
export function OutfitBasics({ catalog, outfit, onEdit }: { catalog: GearCatalog; outfit: OutfitData; onEdit: Edit }) {
  const { t } = useT();
  const roles = rolesOf(outfit, catalog);
  return (
    <div className="flex flex-col gap-5">
      <FieldGroup className="gap-3">
        <Field>
          <FieldLabel htmlFor="outfit-base">{t('customize.basics.body')}</FieldLabel>
          <Select value={outfit.base ?? NO_BASE} onValueChange={(base) => onEdit((o) => setBase(o, base === NO_BASE ? undefined : base))}>
            <SelectTrigger id="outfit-base" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={NO_BASE}>{t('customize.basics.noBody')}</SelectItem>
                {catalog.bases.map((base) => <SelectItem key={base.id} value={base.id}>{base.label}</SelectItem>)}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>

      <FieldSet className="min-w-0">
        <FieldLegend variant="label">{t('customize.basics.materials')}</FieldLegend>
        {roles.main.length + roles.advanced.length === 0 ? (
          <p className="text-muted-foreground">{t('customize.basics.noRoles')}</p>
        ) : (
          <RoleFields
            idPrefix="outfit-mat"
            main={roles.main}
            advanced={roles.advanced}
            materials={catalog.materials}
            value={outfit.materials}
            noneLabel={() => t('common.none')}
            advancedTitle={t('customize.basics.advanced')}
            onChange={(role, name) => onEdit((o) => setMaterial(o, role, name))}
          />
        )}
      </FieldSet>
    </div>
  );
}
