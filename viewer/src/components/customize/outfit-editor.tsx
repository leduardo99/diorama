import { useMemo } from 'react';
import NiceModal from '@ebay/nice-modal-react';
import type { Announcements, ScreenReaderInstructions } from '@dnd-kit/core';
import type { GearCatalog, OutfitData, PartInfo } from '@core/rig';
import { PlusIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { FieldLegend, FieldSet } from '@/components/ui/field';
import { Sortable, SortableContent, SortableItem, SortableOverlay } from '@/components/ui/sortable';
import { addPiece, movePiece, partOf, pieceKeys, removePiece, reorderPiece, setHost } from '@/lib/outfit/edit';
import { useT } from '@/i18n';
import { AddPieceModal, type Placement } from '@/modals/add-piece-modal';
import type { Edit } from '@/lib/outfit/use-draft';
import { PieceCard } from './piece-card';
import { OutfitBasics } from './outfit-basics';

interface Props {
  project: string;
  catalog: GearCatalog;
  outfit: OutfitData;
  onEdit: Edit;
}

/**
 * The outfit as a form: the body underneath, a material for each role, and the pieces in drawing order. The order changes
 * by dragging a piece by its handle (or with the keyboard: Space on the handle, the arrows, Space again) or with its arrows;
 * either way it is one undo step, and a move that would put a piece before the one it rests on is refused.
 */
export function OutfitEditor({ project, catalog, outfit, onEdit }: Props) {
  const { t, plural } = useT();
  // Keys that stay with each piece when the order changes: the card keeps its folded state and dnd-kit follows it.
  const keys = useMemo(() => pieceKeys(outfit), [outfit]);
  const accessibility = useReorderAnnouncements(catalog, outfit, keys);
  const reorder = (from: number, to: number) => {
    if (reorderPiece(outfit, from, to) === outfit) {
      toast(t('customize.editor.reorderRefused'));
      return;
    }
    onEdit((o) => reorderPiece(o, from, to));
  };
  const remove = (index: number) => {
    const { removed } = removePiece(outfit, catalog, index);
    onEdit((o) => removePiece(o, catalog, index).outfit);
    if (removed > 1) toast(plural('customize.editor.alsoRemoved', removed - 1));
  };

  const add = () =>
    void NiceModal.show(AddPieceModal, {
      project,
      catalog,
      outfit,
      onAdd: (info: PartInfo, where: Placement) =>
        onEdit((o) => {
          const start = o.pieces.length;
          let next = addPiece(o, info, { slot: where.slot, sides: where.sides });
          if (where.host !== undefined) for (let i = start; i < next.pieces.length; i++) next = setHost(next, i, where.host);
          return next;
        }),
    });

  return (
    <div className="flex flex-col gap-5">
      <OutfitBasics catalog={catalog} outfit={outfit} onEdit={onEdit} />

      <FieldSet className="min-w-0">
        <div className="flex items-center justify-between gap-2">
          <FieldLegend variant="label" className="mb-0">{t('customize.editor.pieces')} <span className="font-normal text-muted-foreground tabular-nums">{outfit.pieces.length}</span></FieldLegend>
          <Button size="sm" variant="outline" onClick={add}>
            <PlusIcon data-icon="inline-start" />
            {t('customize.editor.add')}
          </Button>
        </div>
        {outfit.pieces.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyTitle>{t('customize.editor.none')}</EmptyTitle>
              <EmptyDescription>{t('customize.editor.noneHint')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Sortable value={keys} onMove={({ activeIndex, overIndex }) => reorder(activeIndex, overIndex)} accessibility={accessibility}>
            <SortableContent className="flex flex-col gap-1.5">
              {outfit.pieces.map((_, index) => (
                <SortableItem key={keys[index]} value={keys[index]}>
                  <PieceCard
                    catalog={catalog}
                    outfit={outfit}
                    index={index}
                    onEdit={onEdit}
                    onMove={(delta) => onEdit((o) => movePiece(o, index, delta))}
                    onRemove={() => remove(index)}
                  />
                </SortableItem>
              ))}
            </SortableContent>
            {/* The piece being dragged, folded; its place in the list stays faded until it is dropped. */}
            <SortableOverlay>
              {({ value }) => {
                const index = keys.indexOf(String(value));
                return index < 0 ? null : (
                  <SortableItem value={value}>
                    <PieceCard catalog={catalog} outfit={outfit} index={index} onEdit={onEdit} onMove={() => {}} onRemove={() => {}} />
                  </SortableItem>
                );
              }}
            </SortableOverlay>
          </Sortable>
        )}
      </FieldSet>
    </div>
  );
}

/** What a screen reader hears while a piece is moved with the keyboard: the piece by its name, and where it is in the order. */
function useReorderAnnouncements(catalog: GearCatalog, outfit: OutfitData, keys: string[]): { announcements: Announcements; screenReaderInstructions: ScreenReaderInstructions } {
  const { t } = useT();
  return useMemo(() => {
    const total = keys.length;
    const nameOf = (key: string | number) => {
      const piece = outfit.pieces[keys.indexOf(String(key))];
      return piece ? (partOf(catalog, piece.part)?.label ?? piece.part) : String(key);
    };
    const at = (id: string | number) => keys.indexOf(String(id)) + 1;
    return {
      screenReaderInstructions: { draggable: t('customize.editor.dragInstructions') },
      announcements: {
        onDragStart: ({ active }) => t('customize.editor.dragStart', { name: nameOf(active.id), position: at(active.id), total }),
        onDragOver: ({ active, over }) => (over ? t('customize.editor.dragOver', { name: nameOf(active.id), position: at(over.id), total }) : undefined),
        onDragEnd: ({ active, over }) => {
          if (!over) return t('customize.editor.dragCancel', { name: nameOf(active.id), position: at(active.id), total });
          const moved = reorderPiece(outfit, at(active.id) - 1, at(over.id) - 1) !== outfit || active.id === over.id;
          return moved ? t('customize.editor.dragEnd', { name: nameOf(active.id), position: at(over.id), total }) : t('customize.editor.reorderRefused');
        },
        onDragCancel: ({ active }) => t('customize.editor.dragCancel', { name: nameOf(active.id), position: at(active.id), total }),
      },
    };
  }, [catalog, outfit, keys, t]);
}
