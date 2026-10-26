import { useState } from 'react';
import type { GearCatalog, OutfitData, PartInfo, Slot } from '@core/rig';
import { ArrowDownIcon, ArrowUpIcon, ChevronRightIcon, GripVerticalIcon, TriangleAlertIcon, XIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Card } from '@/components/ui/card';
import { SortableItemHandle } from '@/components/ui/sortable';
import { canMove, hostCandidates, isPaired, optionValue, partOf, setHost, setOption, setPieceMaterial, setSide, setSlot, splitRoles, type Piece, type Side } from '@/lib/outfit/edit';
import { useT } from '@/i18n';
import { sideLabel, slotLabel } from '@/lib/outfit/labels';
import type { TFn } from '@/i18n';
import { cn } from '@/lib/utils';
import type { Edit } from '@/lib/outfit/use-draft';
import { OptionField } from './option-field';
import { RoleFields } from './role-fields';

const NO_HOST = '__none';

interface Props {
  catalog: GearCatalog;
  outfit: OutfitData;
  index: number;
  /** Applies a change to the outfit; the editor owns the state. */
  onEdit: Edit;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}

const sideOf = (piece: Piece, t: TFn) => (isPaired(piece.slot) ? ` · ${sideLabel(t, piece.side ?? 1).toLowerCase()}` : '');

/** One piece of the outfit: its place, options and materials, folded away until opened; a handle to drag it to another place in the order. Lives in a `SortableItem`. */
export function PieceCard({ catalog, outfit, index, onEdit, onMove, onRemove }: Props) {
  const { t } = useT();
  const piece = outfit.pieces[index];
  const info = partOf(catalog, piece.part);
  const [open, setOpen] = useState(false);
  const uid = `piece-${index}`;

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <Card size="sm" className={cn('gap-0 py-0', !info && 'ring-destructive/50')}>
        <div className="flex items-center gap-1 p-1.5">
          <SortableItemHandle asChild>
            <Button variant="ghost" size="icon-xs" aria-label={t('customize.piece.drag', { name: info?.label ?? piece.part })}>
              <GripVerticalIcon />
            </Button>
          </SortableItemHandle>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="min-w-0 flex-1 justify-start" aria-label={t(open ? 'customize.piece.close' : 'customize.piece.open', { name: info?.label ?? piece.part })}>
              <ChevronRightIcon data-icon="inline-start" className={cn('transition-transform', open && 'rotate-90')} />
              <span className="truncate font-medium">{info?.label ?? piece.part}</span>
              <span className="truncate font-normal text-muted-foreground">{slotLabel(t, piece.slot)}{sideOf(piece, t)}</span>
              {!info && <Badge variant="destructive"><TriangleAlertIcon data-icon="inline-start" />{t('customize.piece.unknown')}</Badge>}
            </Button>
          </CollapsibleTrigger>
          <Button variant="ghost" size="icon-xs" aria-label={t('customize.piece.moveUp')} disabled={!canMove(outfit, index, -1)} onClick={() => onMove(-1)}>
            <ArrowUpIcon />
          </Button>
          <Button variant="ghost" size="icon-xs" aria-label={t('customize.piece.moveDown')} disabled={!canMove(outfit, index, 1)} onClick={() => onMove(1)}>
            <ArrowDownIcon />
          </Button>
          <Button variant="ghost" size="icon-xs" aria-label={t('customize.piece.remove')} onClick={onRemove}>
            <XIcon />
          </Button>
        </div>
        <CollapsibleContent>
          {info && <PieceFields uid={uid} catalog={catalog} outfit={outfit} index={index} info={info} onEdit={onEdit} />}
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

/** The fields of one piece. `compact` leaves out what the slot board decides for itself: the piece it rests on, when only one could carry it. */
export function PieceFields({ uid, catalog, outfit, index, info, onEdit, compact = false }: Pick<Props, 'catalog' | 'outfit' | 'index' | 'onEdit'> & { uid: string; info: PartInfo; compact?: boolean }) {
  const { t } = useT();
  const piece = outfit.pieces[index];
  const hosts = hostCandidates(outfit, index, info);
  const hostIndex = piece.on ? outfit.pieces.findIndex((p) => p.id === piece.on) : -1;
  const showHost = (info.requires !== undefined || piece.on !== undefined) && !(compact && hosts.length <= 1);

  return (
    <FieldGroup className="gap-3 border-t p-2.5">
      {info.slots.length > 1 && (
        <Field>
          <FieldLabel htmlFor={`${uid}-slot`}>{t('customize.piece.position')}</FieldLabel>
          <Select value={piece.slot} onValueChange={(slot) => onEdit((o) => setSlot(o, index, slot as Slot))}>
            <SelectTrigger id={`${uid}-slot`} size="sm" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {info.slots.map((slot) => <SelectItem key={slot} value={slot}>{slotLabel(t, slot)}</SelectItem>)}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      )}
      {isPaired(piece.slot) && (
        <Field>
          <FieldLabel id={`${uid}-side`}>{t('customize.piece.side')}</FieldLabel>
          <ToggleGroup type="single" variant="outline" size="sm" aria-labelledby={`${uid}-side`} value={String(piece.side ?? 1)} onValueChange={(side) => side && onEdit((o) => setSide(o, index, Number(side) as Side))}>
            <ToggleGroupItem value="-1">{sideLabel(t, -1)}</ToggleGroupItem>
            <ToggleGroupItem value="1">{sideLabel(t, 1)}</ToggleGroupItem>
          </ToggleGroup>
        </Field>
      )}
      {showHost && (
        <Field>
          <FieldLabel htmlFor={`${uid}-host`}>{t('customize.piece.restsOn')}</FieldLabel>
          <Select
            value={hostIndex >= 0 ? String(hostIndex) : NO_HOST}
            onValueChange={(next) => onEdit((o) => setHost(o, index, next === NO_HOST ? null : Number(next)))}
          >
            <SelectTrigger id={`${uid}-host`} size="sm" className="w-full" aria-invalid={info.requires !== undefined && hostIndex < 0}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {!info.requires && <SelectItem value={NO_HOST}>{t('customize.piece.nothing')}</SelectItem>}
                {hosts.map((i) => (
                  <SelectItem key={i} value={String(i)}>
                    {partOf(catalog, outfit.pieces[i].part)?.label ?? outfit.pieces[i].part}{sideOf(outfit.pieces[i], t)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      )}
      {(info.options ?? []).map((option) => (
        <OptionField
          key={option.key}
          id={`${uid}-opt-${option.key}`}
          option={option}
          value={optionValue(piece, option)}
          onChange={(value) => onEdit((o) => setOption(o, index, option, value), `option:${piece.id ?? index}:${option.key}`)}
        />
      ))}
      {info.roles.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground">{t('customize.piece.materials')}</span>
          <RoleFields
            idPrefix={`${uid}-mat`}
            {...splitRoles(info.roles)}
            materials={catalog.materials}
            value={piece.materials}
            noneLabel={(role) => (outfit.materials[role] ? t('customize.piece.fromOutfitWith', { material: outfit.materials[role] }) : t('customize.piece.fromOutfit'))}
            noneMaterial={(role) => outfit.materials[role]}
            advancedTitle={t('customize.piece.moreRoles')}
            onChange={(role, name) => onEdit((o) => setPieceMaterial(o, index, role, name))}
          />
        </div>
      )}
    </FieldGroup>
  );
}
