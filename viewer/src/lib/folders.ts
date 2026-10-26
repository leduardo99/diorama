import { dirname } from './format';

/** One folder of a project's assets, as the folder picker lists it. */
export interface FolderRow {
  /** The folder's path from the project's root, the value of the `folder` filter (`characters/captain`). */
  path: string;
  /** Its last part (`captain`). */
  name: string;
  /** How deep it is: 0 for a folder at the root. */
  depth: number;
  /** The assets in it and below it. */
  count: number;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * Every folder that holds assets, with the assets below it, in tree order: each folder comes right after its parent,
 * among its siblings by name. Sorting the whole paths would not do: `a-b` sorts between `a` and `a/b`.
 */
export function folderTree(subpaths: string[]): FolderRow[] {
  const counts = new Map<string, number>();
  const children = new Map<string, string[]>();
  for (const subpath of subpaths) {
    const parts = dirname(subpath).split('/').filter(Boolean);
    parts.forEach((_, i) => {
      const path = parts.slice(0, i + 1).join('/');
      if (!counts.has(path)) {
        const parent = parts.slice(0, i).join('/');
        children.set(parent, [...(children.get(parent) ?? []), path]);
      }
      counts.set(path, (counts.get(path) ?? 0) + 1);
    });
  }
  const rows: FolderRow[] = [];
  const visit = (parent: string, depth: number) => {
    const names = (children.get(parent) ?? []).map((path) => ({ path, name: path.slice(parent ? parent.length + 1 : 0) }));
    for (const { path, name } of names.sort((a, b) => collator.compare(a.name, b.name))) {
      rows.push({ path, name, depth, count: counts.get(path)! });
      visit(path, depth + 1);
    }
  };
  visit('', 0);
  return rows;
}

/** The folders whose path holds every word of the query, in any case; all of them for an empty query. */
export function searchFolders(rows: FolderRow[], query: string): FolderRow[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return words.length === 0 ? rows : rows.filter((row) => words.every((word) => row.path.toLowerCase().includes(word)));
}
