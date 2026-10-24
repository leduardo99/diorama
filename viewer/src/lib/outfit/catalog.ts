import { queryOptions } from '@tanstack/react-query';
import type { GearCatalog, OutfitCharacterInfo } from '@core/rig';
import { kitCatalogUrl } from '../project-paths';

/** What a project's `src/gear/catalog.ts` exports: its parts and materials, and the characters that can be dressed. */
export interface GearKit {
  catalog: GearCatalog;
  characters: OutfitCharacterInfo[];
}

/**
 * The gear kit of a project, or null when it has none (`available` comes from the server catalog, which looks at the disk:
 * a kit created while the viewer runs shows up at the next refresh). `fixture` loads the built-in kit instead, to develop
 * the tab without a project kit. The kit holds functions and class instances: it is kept as is.
 */
export const kitQuery = (project: string, fixture: boolean, available: boolean) =>
  queryOptions({
    queryKey: ['gear-kit', project, fixture, available],
    staleTime: Infinity,
    structuralSharing: false,
    queryFn: async (): Promise<GearKit | null> => {
      if (fixture) return (await import('./fixture')).FIXTURE_KIT;
      if (!available) return null;
      // The dev server transforms the source on request.
      const { CATALOG, CHARACTERS } = (await import(/* @vite-ignore */ kitCatalogUrl(project, 'gear'))) as { CATALOG: GearCatalog; CHARACTERS: OutfitCharacterInfo[] };
      return { catalog: CATALOG, characters: CHARACTERS };
    },
  });
