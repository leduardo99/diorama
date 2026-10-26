import { useMemo } from 'react';
import NiceModal from '@ebay/nice-modal-react';
import { useSuspenseQuery } from '@tanstack/react-query';
import type { OutfitCharacterInfo } from '@core/rig';
import { Link } from '@tanstack/react-router';
import { ChevronRightIcon, FlaskConicalIcon, RefreshCwIcon, RotateCcwIcon, SaveIcon, ShirtIcon } from 'lucide-react';
import { HistoryButtons } from '@/components/history-buttons';
import { NoKit } from '@/components/no-kit';
import { SidePanelLayout } from '@/components/side-panel-layout';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Rich, useT } from '@/i18n';
import { historyCommand, isTyping, useWindowKeydown } from '@/lib/hotkeys';
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
import { useWarnOnUnload } from '@/lib/unsaved';

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
      <NoKit
        icon={<ShirtIcon />}
        title={t('customize.noKit.title')}
        description={<Rich id="customize.noKit.description" />}
        command={`npm run new-kit -- ${project} gear`}
        tryBuiltIn={
          <Button variant="outline" asChild>
            <Link to="/p/$project/customize" params={{ project }} search={{ fixture: true }}>
              <FlaskConicalIcon data-icon="inline-start" />
              {t('noKit.tryBuiltIn')}
            </Link>
          </Button>
        }
      />
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
  useWarnOnUnload(changed);
  const refreshGear = useRefreshGearItems();
  // The outfit by place on the body (swap a piece in one click), or the flat list of pieces in drawing order.
  const [mode, setMode] = usePref<string>('customize.mode', 'slots');
  const [basics, setBasics] = usePref<boolean>('customize.basics', false);
  // What the character holds against the clips made for it: warned about after every edit.
  const wield = useMemo(() => wieldReport(character.clips, outfit, kit.catalog, i18n), [character.clips, outfit, kit.catalog, i18n]);

  useWindowKeydown((e) => {
    if (isTyping(e.target) || document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) return;
    const step = historyCommand(e);
    if (!step) return;
    e.preventDefault();
    if (step === 'redo') redo();
    else undo();
  });

  // The outfit's column can be widened for long piece names and deep slot trees; the preview takes the rest.
  const outfitPanel = (
    <aside data-tour="customize" className="flex min-h-0 flex-1 flex-col" aria-label={t('customize.outfitLabel')}>
      <div className="flex flex-col gap-3 border-b p-3">
        <Field>
          <FieldLabel htmlFor="customize-character">{t('customize.character')}</FieldLabel>
          <Select value={character.id} onValueChange={(id) => void navigate({ search: (prev) => ({ ...prev, character: id }), replace: true })}>
            <SelectTrigger id="customize-character" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {/* The kit's label with its id, in the list and in the trigger; typing picks by the label. */}
                {kit.characters.map((c) => (
                  <SelectItem key={c.id} value={c.id} textValue={c.label}>
                    {c.label}
                    <span className="text-muted-foreground">{c.id}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground">
            {plural('customize.clips', Object.keys(character.clips).length)} · {plural('customize.pieces', outfit.pieces.length)}
          </p>
          <HistoryButtons canUndo={canUndo} canRedo={canRedo} onUndo={undo} onRedo={redo} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Tabs value={mode} onValueChange={setMode}>
            <TabsList>
              <TabsTrigger value="slots">{t('customize.modeSlots')}</TabsTrigger>
              <TabsTrigger value="list">{t('customize.modeList')}</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="xs" disabled={refreshGear.isPending} onClick={() => refreshGear.mutate({ project })}>
                {refreshGear.isPending ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
                {t('customize.updateGear')}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('customize.updateGearHint')}</TooltipContent>
          </Tooltip>
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
  );

  return (
    <SidePanelLayout id="customize" side="start" size={{ initial: '22rem', min: '18rem', max: '36rem' }} panel={outfitPanel}>
      <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label={t('customize.previewLabel')}>
        <PreviewPanel key={character.id} character={character} catalog={kit.catalog} outfit={outfit} unusable={wield.unusable} />
      </section>
    </SidePanelLayout>
  );
}

