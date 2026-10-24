import { useState, type ReactNode } from 'react';
import NiceModal from '@ebay/nice-modal-react';
import { useNavigate } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Rich, useT } from '@/i18n';
import type { TFn } from '@/i18n';
import { exportFailureText, exportTypeErrors } from '@/lib/export-errors';
import { projectsQuery } from '@/lib/queries';
import { useCli } from '@/lib/mutations';
import { useModalDialog } from '@/lib/use-modal-dialog';
import type { Engine, NewTab } from '@/lib/types';

/** The engines, for the engine select (what each makes is in the dictionary). */
const ENGINES: Engine[] = ['volume', 'rig'];

/** Frames a new asset starts with: a prop is still, a clip of a character is a cycle. */
const DEFAULT_FRAMES: Record<Engine, string> = { volume: '1', rig: '8' };

/** The skeletons and clips `new-asset --engine rig` can start from (`@core/rig` presets). */
const SKELETONS = ['humanoid', 'quadruped'] as const;
const CLIPS = ['walk', 'run', 'idle', 'attack', 'hit', 'death'] as const;
/** The clip's file name picks the preset when it is one of CLIPS, else walk. */
const AUTO_CLIP = 'auto';

/** What `new-asset` accepts as a subpath: kebab-case names (lowercase letters, digits and "-") joined by "/". */
const KEBAB_PATH = '[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*)*';

interface FormState {
  name: string;
  style: boolean;
  project: string;
  subpath: string;
  engine: Engine;
  size: string;
  frames: string;
  fps: string;
  directions: string;
  skeleton: (typeof SKELETONS)[number];
  clip: typeof AUTO_CLIP | (typeof CLIPS)[number];
  exportNow: boolean;
  sheet: 'none' | 'grid' | 'compact';
  gap: string;
  cols: string;
  both: boolean;
  mockup: boolean;
}

interface Props {
  tab?: NewTab;
  /** Project the new asset or export belongs to; defaults to the project whose page is open. */
  project?: string;
  subpath?: string;
}

const tabs: Array<{ id: NewTab; label: 'project' | 'asset' | 'export' }> = [
  { id: 'new-project', label: 'project' },
  { id: 'new-asset', label: 'asset' },
  { id: 'export', label: 'export' },
];

/** Mirrors the npm script the request becomes, so the dialog doubles as a CLI cheat sheet. */
function cliLine(tab: NewTab, v: FormState, t: TFn): string {
  const placeholderProject = t('modals.new.cliProject');
  switch (tab) {
    case 'new-project':
      return `npm run new-project -- ${v.name || placeholderProject}${v.style ? ' --style' : ''}`;
    case 'new-asset': {
      const frames = Number(v.frames) > 1 ? ` --frames ${v.frames}` : '';
      const dirs = v.directions ? ` --directions ${v.directions}` : '';
      const base = `npm run new-asset -- ${v.project || placeholderProject} ${v.subpath || t('modals.new.cliPath')} --engine ${v.engine}`;
      if (v.engine === 'rig') return `${base} --skeleton ${v.skeleton}${v.clip === AUTO_CLIP ? '' : ` --clip ${v.clip}`}${frames}${dirs}`;
      return `${base} --size ${v.size}${dirs}${frames}${Number(v.frames) > 1 ? ` --fps ${v.fps}` : ''}`;
    }
    case 'export': {
      const sheet = v.sheet === 'none' ? '' : ` --${v.sheet}${v.gap ? ` --gap=${v.gap}` : ''}${v.cols ? ` --cols=${v.cols}` : ''}${v.both ? ' --both' : ''}`;
      return `npm run export -- ${v.project || placeholderProject}${v.subpath ? ` ${v.subpath}` : ''}${sheet}${v.mockup ? ' --mockup' : ''}`;
    }
  }
}

function CheckField({ id, checked, onChange, children }: { id: string; checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  return (
    <Field orientation="horizontal">
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      <FieldLabel htmlFor={id}>{children}</FieldLabel>
    </Field>
  );
}

export const NewModal = NiceModal.create(({ tab: initialTab = 'new-asset', project: initialProject, subpath }: Props) => {
  const { modal, rootProps, contentProps } = useModalDialog();
  const { t } = useT();
  const { data: projects } = useSuspenseQuery(projectsQuery);
  const navigate = useNavigate();
  const cli = useCli();
  const [tab, setTab] = useState<NewTab>(projects.length ? initialTab : 'new-project');
  const [values, setValues] = useState<FormState>({
    name: '', style: false,
    project: projects.find((p) => p.name === initialProject)?.name ?? projects[0]?.name ?? '',
    subpath: subpath ?? '',
    engine: 'volume', size: '128x128', frames: DEFAULT_FRAMES.volume, fps: '6', directions: '8', skeleton: 'humanoid', clip: AUTO_CLIP, exportNow: true,
    sheet: 'none', gap: '', cols: '', both: false, mockup: false,
  });
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    // The last result belongs to the previous values.
    if (cli.data || cli.isError) cli.reset();
  };
  // Switching engine moves the frames to what that engine starts with, unless they were edited.
  const setEngine = (engine: Engine) => {
    setValues((v) => ({ ...v, engine, frames: v.frames === DEFAULT_FRAMES[v.engine] ? DEFAULT_FRAMES[engine] : v.frames }));
    if (cli.data || cli.isError) cli.reset();
  };
  const text = (key: 'name' | 'subpath' | 'size' | 'frames' | 'fps' | 'directions' | 'gap' | 'cols') => ({
    value: values[key],
    onChange: (e: { target: { value: string } }) => set(key, e.target.value),
  });

  const submit = async () => {
    const payload = { command: tab, ...values, sheet: values.sheet === 'none' ? '' : values.sheet, clip: values.clip === AUTO_CLIP ? '' : values.clip };
    const created = await cli.mutateAsync(payload);
    if (!created.ok) return;
    if (tab === 'new-project') {
      toast.success(t('modals.new.projectCreated'), { description: values.name });
      void navigate({ to: '/p/$project', params: { project: values.name } });
      modal.hide();
    } else if (tab === 'new-asset') {
      // The asset lands in its project right away; exporting makes it show up in the list.
      if (values.exportNow) {
        const exported = await cli.mutateAsync({ command: 'export', project: values.project, subpath: values.subpath });
        if (!exported.ok) {
          toast.error(t('modals.new.assetExportFailed'), { description: exportFailureText(exported.output, t('toasts.fixTypeErrors')) });
        }
      }
      toast.success(t('modals.new.assetCreated'), { description: `${values.project}/${values.subpath}` });
      void navigate({ to: '/p/$project', params: { project: values.project } });
      modal.hide();
    }
  };

  const projectField = (
    <Field>
      <FieldLabel htmlFor="new-project">{t('modals.new.project')}</FieldLabel>
      <Select value={values.project} onValueChange={(value) => set('project', value)}>
        <SelectTrigger id="new-project" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {projects.map((p) => <SelectItem key={p.name} value={p.name}>{p.root === 'examples' ? t('modals.new.exampleOption', { name: p.name }) : p.name}</SelectItem>)}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );

  const pending = cli.isPending;
  const verb = tab === 'export' ? t('common.export') : t('common.create');
  // The viewer cannot pass --force: on a type refusal, its own hint in the output is misleading.
  const typeErrors = cli.data && !cli.data.ok && tab === 'export' ? exportTypeErrors(cli.data.output) : null;

  return (
    <Dialog {...rootProps}>
      <DialogContent {...contentProps} className="sm:max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t('modals.new.title')}</DialogTitle>
        </DialogHeader>
        <Tabs
          value={tab}
          onValueChange={(value) => {
            setTab(value as NewTab);
            cli.reset();
          }}
        >
          <TabsList>
            {tabs.map((entry) => (
              <TabsTrigger key={entry.id} value={entry.id} disabled={entry.id !== 'new-project' && projects.length === 0}>
                {t(`modals.new.tabs.${entry.label}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <FieldGroup>
            {tab === 'new-project' && (
              <>
                <Field>
                  <FieldLabel htmlFor="new-name">{t('modals.new.projectName')}</FieldLabel>
                  <Input id="new-name" placeholder={t('modals.new.projectNamePlaceholder')} pattern="[a-z0-9][a-z0-9_\-]*" autoFocus {...text('name')} />
                  <FieldDescription>{t('modals.new.projectNameHint')}</FieldDescription>
                </Field>
                <CheckField id="new-style" checked={values.style} onChange={(v) => set('style', v)}>{t('modals.new.addStyle')}</CheckField>
              </>
            )}

            {tab === 'new-asset' && (
              <>
                {projectField}
                <Field>
                  <FieldLabel htmlFor="new-subpath">{t('modals.new.assetPath')}</FieldLabel>
                  <Input id="new-subpath" placeholder={values.engine === 'rig' ? 'characters/wolf/walk' : 'props/barrel'} pattern={KEBAB_PATH} autoFocus {...text('subpath')} />
                  <FieldDescription>
                    <Rich id={values.engine === 'rig' ? 'modals.new.assetPathRig' : 'modals.new.assetPathVolume'} />
                  </FieldDescription>
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field>
                    <FieldLabel htmlFor="new-engine">{t('modals.new.engine')}</FieldLabel>
                    <Select value={values.engine} onValueChange={(value) => setEngine(value as Engine)}>
                      <SelectTrigger id="new-engine" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {ENGINES.map((id) => <SelectItem key={id} value={id}>{t(`modals.new.engines.${id}`)}</SelectItem>)}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  {values.engine === 'rig' ? (
                    <Field>
                      <FieldLabel htmlFor="new-skeleton">{t('modals.new.skeleton')}</FieldLabel>
                      <Select value={values.skeleton} onValueChange={(value) => set('skeleton', value as FormState['skeleton'])}>
                        <SelectTrigger id="new-skeleton" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {SKELETONS.map((id) => <SelectItem key={id} value={id}>{t(`modals.new.skeletons.${id}`)}</SelectItem>)}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                  ) : (
                    <Field>
                      <FieldLabel htmlFor="new-size">{t('modals.new.size')}</FieldLabel>
                      <Input id="new-size" className="font-mono" {...text('size')} />
                    </Field>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <Field>
                    <FieldLabel htmlFor="new-frames">{t('modals.new.frames')}</FieldLabel>
                    <Input id="new-frames" type="number" min={1} className="font-mono" {...text('frames')} />
                  </Field>
                  {values.engine === 'rig' ? (
                    <Field>
                      <FieldLabel htmlFor="new-clip">{t('modals.new.clip')}</FieldLabel>
                      <Select value={values.clip} onValueChange={(value) => set('clip', value as FormState['clip'])}>
                        <SelectTrigger id="new-clip" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value={AUTO_CLIP}>{t('modals.new.clipAuto')}</SelectItem>
                            {CLIPS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FieldDescription>{t('modals.new.clipHint')}</FieldDescription>
                    </Field>
                  ) : (
                    <Field>
                      <FieldLabel htmlFor="new-fps">{t('modals.new.fps')}</FieldLabel>
                      <Input id="new-fps" type="number" min={1} className="font-mono" {...text('fps')} />
                    </Field>
                  )}
                  <Field>
                    <FieldLabel htmlFor="new-directions">{t('modals.new.directions')}</FieldLabel>
                    <Input id="new-directions" type="number" min={1} className="font-mono" {...text('directions')} />
                    <FieldDescription>{t('modals.new.directionsHint')}</FieldDescription>
                  </Field>
                </div>
                <CheckField id="new-export-now" checked={values.exportNow} onChange={(v) => set('exportNow', v)}>
                  {t('modals.new.exportNow')}
                </CheckField>
              </>
            )}

            {tab === 'export' && (
              <>
                {projectField}
                <Field>
                  <FieldLabel htmlFor="new-export-path">{t('modals.new.path')}</FieldLabel>
                  <Input id="new-export-path" placeholder="characters/wolf/" {...text('subpath')} />
                  <FieldDescription>
                    <Rich id="modals.new.exportPathHint" />
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-sheet">{t('modals.new.output')}</FieldLabel>
                  <Select value={values.sheet} onValueChange={(value) => set('sheet', value as FormState['sheet'])}>
                    <SelectTrigger id="new-sheet" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="none">{t('modals.new.individual')}</SelectItem>
                        <SelectItem value="grid">{t('modals.new.grid')}</SelectItem>
                        <SelectItem value="compact">{t('modals.new.compact')}</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                {values.sheet !== 'none' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <Field>
                        <FieldLabel htmlFor="new-gap">{t('modals.new.gap')}</FieldLabel>
                        <Input id="new-gap" type="number" min={0} placeholder="0" className="font-mono" {...text('gap')} />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="new-cols">{t('modals.new.cols')}</FieldLabel>
                        <Input id="new-cols" type="number" min={1} placeholder={t('modals.new.colsPlaceholder')} className="font-mono" {...text('cols')} />
                      </Field>
                    </div>
                    <CheckField id="new-both" checked={values.both} onChange={(v) => set('both', v)}>{t('modals.new.alsoIndividual')}</CheckField>
                  </>
                )}
                <CheckField id="new-mockup" checked={values.mockup} onChange={(v) => set('mockup', v)}>
                  {t('modals.new.mockup')}
                </CheckField>
              </>
            )}
          </FieldGroup>

          <div className="flex items-baseline gap-2 rounded-md bg-muted/50 p-2">
            <Kbd>CLI</Kbd>
            <code className="font-mono text-xs break-all">{cliLine(tab, values, t)}</code>
          </div>

          {(cli.data || cli.isError) && (
            <Alert variant={cli.data?.ok ? 'default' : 'destructive'}>
              <AlertDescription>
                <pre className="max-h-48 overflow-auto font-mono text-xs whitespace-pre-wrap">
                  {cli.data
                    ? typeErrors
                      ? `${t('toasts.fixTypeErrors')}\n${typeErrors.join('\n')}`
                      : cli.data.output || (cli.data.ok ? t('modals.new.done') : t('modals.new.failed'))
                    : cli.error?.message}
                </pre>
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => modal.hide()}>{t('common.close')}</Button>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              {pending ? (tab === 'export' ? t('modals.new.exporting') : t('modals.new.creating')) : verb}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
});
