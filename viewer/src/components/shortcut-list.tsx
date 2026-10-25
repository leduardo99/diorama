import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { useT } from '@/i18n';
import { keyLabel, type ShortcutSection } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';

/**
 * A titled list of shortcuts (`lib/shortcuts.ts`): the keys in one column, lined up whatever their number, and what they
 * do in the other. The shortcuts window and the painter's keyboard popover both draw their lists with it. A long row of
 * caps wraps after four (the Playground's W A S D over its arrows). `columns={2}` lays the rows out two by two.
 */
export function ShortcutList({ section, columns = 1 }: { section: ShortcutSection; columns?: 1 | 2 }) {
  const { t } = useT();
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h3 className="text-xs font-medium text-muted-foreground uppercase">{t(section.title)}</h3>
      <dl className={cn('grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5', columns === 2 && 'sm:grid-cols-[auto_1fr_auto_1fr]')}>
        {section.items.map(({ keys, what }) => (
          <div key={keys.join(' ')} className="col-span-2 grid grid-cols-subgrid items-center">
            <dt>
              <KbdGroup className="max-w-28 flex-wrap">
                {keys.map((key) => <Kbd key={key}>{keyLabel(t, key)}</Kbd>)}
              </KbdGroup>
            </dt>
            <dd className="text-muted-foreground">{t(what)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
