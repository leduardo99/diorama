import { useMemo, useState } from 'react';
import NiceModal from '@ebay/nice-modal-react';
import { partRequires, type GearCatalog, type OutfitData, type PartInfo, type Slot } from '@core/rig';
import { PlusIcon, SearchIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrimmedImage } from '@/components/trimmed-image';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { hostCandidates, isPaired, partOf, partsBySlot, type Side } from '@/lib/outfit/edit';
import { useT } from '@/i18n';
import { groupLabel, sideLabel, slotLabel } from '@/lib/outfit/labels';
import { useModalDialog } from '@/lib/use-modal-dialog';
import { useGearThumbs } from '@/components/customize/use-gear-thumbs';

/** Where a new part goes: its slot, a side for each piece to add, and the index of the piece it rests on. */
export interface Placement {
  slot: Slot;
  sides: Side[];
  host?: number;
}

interface Props {
  /** The project whose exported gear items give the parts their thumbnails. */
  project: string;
  catalog: GearCatalog;
  outfit: OutfitData;
  onAdd: (info: PartInfo, where: Placement) => void;
}

/** Pick a part of the kit, say where it goes (and on which sides), and it is added to the outfit. */
export const AddPieceModal = NiceModal.create(({ project, catalog, outfit, onAdd }: Props) => {
  const { modal, rootProps, contentProps } = useModalDialog();
  const { t, list } = useT();
  // A part without an exported sheet simply has no thumbnail.
  const sheets = useGearThumbs(project);
  const [query, setQuery] = useState('');
  const [partId, setPartId] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [sides, setSides] = useState<string[]>(['1']);
  const [host, setHost] = useState<string | null>(null);

  const groups = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return partsBySlot(catalog)
      .map(({ group, parts }) => ({ group, parts: parts.filter((p) => words.every((w) => `${p.label} ${p.id} ${groupLabel(t, p.group)}`.toLowerCase().includes(w))) }))
      .filter((g) => g.parts.length > 0);
  }, [catalog, query, t]);

  const info = partId ? partOf(catalog, partId) : undefined;
  const chosenSlot = info ? (slot && info.slots.includes(slot) ? slot : info.slots[0]) : null;
  // An add-on rests on a piece already in the outfit.
  const hosts = info?.requires ? hostCandidates({ ...outfit, pieces: [...outfit.pieces, { part: info.id, slot: info.slots[0] }] }, outfit.pieces.length, info) : [];
  const chosenHost = info?.requires ? (host !== null && hosts.includes(Number(host)) ? Number(host) : (hosts[0] ?? null)) : null;
  const missingHost = info?.requires !== undefined && chosenHost === null;
  const paired = chosenSlot !== null && isPaired(chosenSlot);

  const add = () => {
    if (!info || !chosenSlot) return;
    onAdd(info, { slot: chosenSlot, sides: sides.map(Number) as Side[], host: chosenHost ?? undefined });
    modal.hide();
  };

  return (
    <Dialog {...rootProps}>
      <DialogContent {...contentProps} className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('modals.addPiece.title')}</DialogTitle>
          <DialogDescription>{t('modals.addPiece.description')}</DialogDescription>
        </DialogHeader>

        <FieldGroup className="gap-4">
          <InputGroup>
            <InputGroupAddon><SearchIcon /></InputGroupAddon>
            <InputGroupInput aria-label={t('modals.addPiece.search')} placeholder={t('modals.addPiece.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
          </InputGroup>

          {groups.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{t('modals.addPiece.noResults')}</EmptyTitle>
                <EmptyDescription>{t('modals.addPiece.tryAnother')}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex max-h-64 flex-col gap-3 overflow-auto">
              {groups.map(({ group, parts }) => (
                <Field key={group}>
                  <FieldTitle>{groupLabel(t, group)}</FieldTitle>
                  <ToggleGroup type="single" variant="outline" size="sm" orientation="vertical" spacing={1} className="w-full" value={partId ?? ''} onValueChange={(next) => { setPartId(next || null); setSlot(null); }}>
                    {parts.map((part) => (
                      <ToggleGroupItem key={part.id} value={part.id} className="h-auto w-full justify-between py-1 data-[state=on]:border-primary data-[state=on]:bg-primary/10">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="checker grid size-9 shrink-0 place-items-center overflow-hidden rounded-sm ring-1 ring-foreground/10">
                            {sheets.has(part.id) && <TrimmedImage asset={sheets.get(part.id)!} className="max-h-8 max-w-8" />}
                          </span>
                          <span className="truncate">{part.label}</span>
                        </span>
                        <span className="flex gap-1">
                          {part.requires && <Badge variant="outline">{t('modals.addPiece.addOn')}</Badge>}
                          {part.slots.slice(0, 2).map((s) => <Badge key={s} variant="secondary">{slotLabel(t, s)}</Badge>)}
                        </span>
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </Field>
              ))}
            </div>
          )}

          {info && chosenSlot && (
            <FieldGroup className="gap-3 border-t pt-3">
              {info.slots.length > 1 && (
                <Field>
                  <FieldLabel htmlFor="add-piece-slot">{t('modals.addPiece.position')}</FieldLabel>
                  <Select value={chosenSlot} onValueChange={(next) => setSlot(next as Slot)}>
                    <SelectTrigger id="add-piece-slot" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>{info.slots.map((s) => <SelectItem key={s} value={s}>{slotLabel(t, s)}</SelectItem>)}</SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              )}
              {paired && (
                <Field>
                  <FieldLabel id="add-piece-sides">{t('modals.addPiece.sides')}</FieldLabel>
                  <ToggleGroup type="multiple" variant="outline" size="sm" aria-labelledby="add-piece-sides" value={sides} onValueChange={(next) => next.length > 0 && setSides(next)}>
                    <ToggleGroupItem value="-1">{sideLabel(t, -1)}</ToggleGroupItem>
                    <ToggleGroupItem value="1">{sideLabel(t, 1)}</ToggleGroupItem>
                  </ToggleGroup>
                  <FieldDescription>{t('modals.addPiece.bothSides')}</FieldDescription>
                </Field>
              )}
              {info.requires && (
                <Field data-invalid={missingHost || undefined}>
                  <FieldLabel htmlFor="add-piece-host">{t('modals.addPiece.restsOn')}</FieldLabel>
                  <Select value={chosenHost === null ? '' : String(chosenHost)} onValueChange={setHost} disabled={hosts.length === 0}>
                    <SelectTrigger id="add-piece-host" className="w-full" aria-invalid={missingHost}><SelectValue placeholder={t('modals.addPiece.noPiece')} /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {hosts.map((i) => <SelectItem key={i} value={String(i)}>{partOf(catalog, outfit.pieces[i].part)?.label ?? outfit.pieces[i].part}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {missingHost && <FieldError>{t('modals.addPiece.missingHost', { needs: list(partRequires(info), 'or') })}</FieldError>}
                </Field>
              )}
            </FieldGroup>
          )}
        </FieldGroup>

        <DialogFooter>
          <Button variant="outline" onClick={() => modal.hide()}>{t('common.cancel')}</Button>
          <Button disabled={!info || missingHost} onClick={add}>
            <PlusIcon data-icon="inline-start" />
            {t('modals.addPiece.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
