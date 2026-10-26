import type { VolumeStyle } from '@core/volume';
import { ColorSwatch } from '@/components/ui/color-swatch';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const NONE = '__none';

interface Props {
  id: string;
  /** The theme materials that may play the role, by name. */
  materials: Record<string, VolumeStyle>;
  value: string | undefined;
  onChange: (name: string | undefined) => void;
  /** What "no material" means here: nothing set, or the outfit's own. */
  noneLabel: string;
  /** The material "no material" stands for, when it names one (the outfit's, the kit's default): its tones are shown with it. */
  noneMaterial?: string;
}

/** A material's tones, dark, base and lit, beside its name: what its faces are painted with, from the shade to the light. */
export function MaterialRamp({ style }: { style: VolumeStyle | undefined }) {
  if (!style) return null;
  const { dark, base, lit } = style.ramp;
  return (
    <span aria-hidden className="flex shrink-0 gap-px">
      {[dark, base, lit].map((color, i) => <ColorSwatch key={i} size="xs" color={color} />)}
    </span>
  );
}

/** A theme material for a role, or none; each one with its tones, in the list and in the field. */
export function MaterialSelect({ id, materials, value, onChange, noneLabel, noneMaterial }: Props) {
  return (
    <Select value={value ?? NONE} onValueChange={(next) => onChange(next === NONE ? undefined : next)}>
      <SelectTrigger id={id} size="sm" className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value={NONE} textValue={noneLabel}>
            <MaterialRamp style={noneMaterial === undefined ? undefined : materials[noneMaterial]} />
            {noneLabel}
          </SelectItem>
          {Object.entries(materials).map(([name, style]) => (
            <SelectItem key={name} value={name} textValue={name}>
              <MaterialRamp style={style} />
              {name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
