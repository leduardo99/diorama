import { useMemo } from 'react';
import NiceModal from '@ebay/nice-modal-react';
import { useSuspenseQuery } from '@tanstack/react-query';
import type { OutfitCharacterInfo } from '@core/rig';
import { ChevronRightIcon, Redo2Icon, RefreshCwIcon, RotateCcwIcon, SaveIcon, ShirtIcon, Undo2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Rich, useT } from '@/i18n';
import { isTyping, useWindowKeydown } from '@/lib/hotkeys';
import { useRefreshGearItems } from '@/lib/mutations';
import { kitQuery, type GearKit } from '@/lib/outfit/catalog';
import { projectsQuery } from '@/lib/queries';
import { useDraft } from '@/lib/outfit/use-draft';
import { wieldReport } from '@/lib/outfit/wield';
import { customizeRoute } from '@/lib/routes';
import { usePref } from '@/lib/use-pref';
import { cn } from '@/lib/utils';
import { SaveOutfitModal } from '@/modals/save-outfit-modal';
import { OutfitBasics } from './outfit-basics';
import { OutfitEditor } from './outfit-editor';
import { PreviewPanel } from './preview-panel';
import { SlotBoard } from './slot-board';
import { WieldNotes } from './wield-notes';

/** Dress a character of the project's gear kit and watch the result live; save it as a new character. */
export function CustomizeView() {
  const { project } = customizeRoute.useParams();
  const { character: characterId, fixture = false } = customizeRoute.useSearch();
  const { data: projects } = useSuspenseQuery(projectsQuery);
  const meta = projects.find((p) => p.name === project);
  const { data: kit } = useSuspenseQuery(kitQuery(project, fixture, meta?.hasGearKit ?? false));
  const { t } = useT();

  if (!kit) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon"><ShirtIcon /></EmptyMedia>
          <EmptyTitle>{t('customize.noKit.title')}</EmptyTitle>
          <EmptyDescription>
            <Rich id="customize.noKit.description" />
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  if (kit.characters.length === 0) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon"><ShirtIcon /></EmptyMedia>
          <EmptyTitle>{t('customize.noCharacters.title')}</EmptyTitle>
          <EmptyDescription><Rich id="customize.noCharacters.description" /></EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const character = kit.characters.find((c) => c.id === characterId) ?? kit.characters[0];
  return <Customizer key={`${project}:${character.id}`} project={project} kit={kit} character={character} />;
}

function Customizer({ project, kit, character }: { project: string; kit: GearKit; character: OutfitCharacterInfo }) {
  const navigate = customizeRoute.useNavigate();
  const i18n = useT();
  const { t, plural } = i18n;
  const { outfit, edit, reset, changed, undo, redo, canUndo, canRedo } = useDraft(`${project}:${character.id}`, character.outfit);
  const refreshItems = useRefreshGearItems();
  // The outfit by place on the body (swap a piece in one click), or the flat list of pieces in drawing order.
  const [mode, setMode] = usePref<string>('customize.mode', 'slots');
  const [basics, setBasics] = usePref<boolean>('customize.basics', false);
  // What the character holds against the clips made for it: warned about after every edit.
  const wield = useMemo(() => wieldReport(character.clips, outfit, kit.catalog, i18n), [character.clips, outfit, kit.catalog, i18n]);

  useWindowKeydown((e) => {
    if (isTyping(e.target) || document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) return;
    const key = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (e.ctrlKey && key === 'y') {
      e.preventDefault();
      redo();
    }
  });

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-88 shrink-0 flex-col border-r" aria-label={t('customize.outfitLabel')}>
        <div className="flex flex-col gap-3 border-b p-3">
          <Field>
            <FieldLabel htmlFor="customize-character">{t('customize.character')}</FieldLabel>
            <Select value={character.id} onValueChange={(id) => void navigate({ search: (prev) => ({ ...prev, character: id }), replace: true })}>
              <SelectTrigger id="customize-character" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {kit.characters.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-center justify-between gap-2">
            <p className="text-muted-foreground">
              {plural('customize.clips', Object.keys(character.clips).length)} · {plural('customize.pieces', outfit.pieces.length)}
            </p>
            <div className="flex items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-xs" aria-label={t('customize.undo')} disabled={!canUndo} onClick={undo}><Undo2Icon /></Button>
                </TooltipTrigger>
                <TooltipContent>{t('customize.undo')} <kbd className="font-mono">⌘Z</kbd></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-xs" aria-label={t('customize.redo')} disabled={!canRedo} onClick={redo}><Redo2Icon /></Button>
                </TooltipTrigger>
                <TooltipContent>{t('customize.redo')} <kbd className="font-mono">⇧⌘Z</kbd></TooltipContent>
              </Tooltip>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Tabs value={mode} onValueChange={setMode}>
              <TabsList>
                <TabsTrigger value="slots">{t('customize.modeSlots')}</TabsTrigger>
                <TabsTrigger value="list">{t('customize.modeList')}</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="ghost" size="xs" disabled={refreshItems.isPending} onClick={() => refreshItems.mutate({ project })} title={t('customize.updateItemsHint')}>
              {refreshItems.isPending ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
              {t('customize.updateItems')}
            </Button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
          <WieldNotes report={wield} />
          {mode === 'list' ? (
            <OutfitEditor project={project} catalog={kit.catalog} outfit={outfit} onEdit={edit} />
          ) : (
            <div className="flex flex-col gap-5">
              <SlotBoard project={project} catalog={kit.catalog} outfit={outfit} skeleton={character.skeleton} onEdit={edit} onUndo={undo} />
              <Collapsible open={basics} onOpenChange={setBasics} className="border-t pt-3">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-start">
                    <ChevronRightIcon data-icon="inline-start" className={cn('transition-transform', basics && 'rotate-90')} />
                    {t('customize.bodyAndMaterials')}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <OutfitBasics catalog={kit.catalog} outfit={outfit} onEdit={edit} />
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 border-t p-3">
          <Button variant="outline" size="sm" disabled={!changed} onClick={reset}>
            <RotateCcwIcon data-icon="inline-start" />
            {t('customize.restore')}
          </Button>
          <Button size="sm" className="ml-auto" onClick={() => void NiceModal.show(SaveOutfitModal, { project, characterId: character.id, outfit, skipped: [...wield.unusable] })}>
            <SaveIcon data-icon="inline-start" />
            {t('customize.saveAsCharacter')}
          </Button>
        </div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col" aria-label={t('customize.previewLabel')}>
        <PreviewPanel key={character.id} character={character} catalog={kit.catalog} outfit={outfit} unusable={wield.unusable} />
      </section>
    </div>
  );
}

