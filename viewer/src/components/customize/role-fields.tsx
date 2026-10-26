import { useState } from 'react';
import type { VolumeStyle } from '@core/volume';
import { ChevronRightIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { useT } from '@/i18n';
import { roleLabel } from '@/lib/outfit/labels';
import { cn } from '@/lib/utils';
import { MaterialSelect } from './material-select';

interface Props {
  /** Prefix of the ids of the selects. */
  idPrefix: string;
  /** Roles a material should be chosen for, and the refinements that fall back to another role. */
  main: string[];
  advanced: string[];
  /** The theme materials, by name. */
  materials: Record<string, VolumeStyle>;
  /** The material chosen for each role. */
  value: Record<string, string> | undefined;
  /** What "no material" means for a role: nothing, or the outfit's own. */
  noneLabel: (role: string) => string;
  /** The material "no material" stands for in a role, when it names one: its tones are shown with it. */
  noneMaterial?: (role: string) => string | undefined;
  /** Title of the folded section. */
  advancedTitle: string;
  onChange: (role: string, name: string | undefined) => void;
}

/** A material for each role. Refinements ('metal accent') wait in a folded section: left alone they take the base role's. */
export function RoleFields({ idPrefix, main, advanced, materials, value, noneLabel, noneMaterial, advancedTitle, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const { t } = useT();
  const row = (role: string) => (
    <Field key={role} orientation="horizontal" className="items-center">
      <FieldLabel htmlFor={`${idPrefix}-${role}`} className="w-24 shrink-0 font-normal">{roleLabel(role)}</FieldLabel>
      <MaterialSelect id={`${idPrefix}-${role}`} materials={materials} value={value?.[role]} noneLabel={noneLabel(role)} noneMaterial={noneMaterial?.(role)} onChange={(name) => onChange(role, name)} />
    </Field>
  );
  const set = advanced.filter((role) => value?.[role]).length;

  return (
    <FieldGroup className="gap-2">
      {main.map(row)}
      {advanced.length > 0 && (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="xs" className="-ml-2">
              <ChevronRightIcon data-icon="inline-start" className={cn('transition-transform', open && 'rotate-90')} />
              {advancedTitle}
              <Badge variant="secondary" className="tabular-nums">{set > 0 ? t('customize.roles.setOf', { set, total: advanced.length }) : advanced.length}</Badge>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <FieldGroup className="gap-2 pt-2">{advanced.map(row)}</FieldGroup>
          </CollapsibleContent>
        </Collapsible>
      )}
    </FieldGroup>
  );
}
