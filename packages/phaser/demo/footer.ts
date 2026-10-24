/**
 * The page around the canvas: a footer with the bench's name, a project switcher, a link to every character of the
 * project and one back to the viewer, and what the page says when there is nothing to play. It speaks the viewer's
 * language: the viewer remembers its header's choice under `diorama.lang` in this browser, on the same origin.
 */

import { readable } from './bench.js';

export type Lang = 'en' | 'pt-BR';

/** A project of the catalog that has characters, and their ids (`assets/characters/<id>/`). */
export interface BenchProject {
  name: string;
  characters: string[];
}

const WORDS = {
  en: {
    title: 'Phaser test bench',
    project: 'Project',
    characters: 'Characters',
    projects: 'Projects',
    viewer: '← Diorama viewer',
    noCatalog: 'The test bench reads the projects from the dev server\'s catalog: open it under npm run view.',
    noProject: (name: string) => `No project "${name}" has exported characters. Pick one of these:`,
    noCharacter: (id: string, project: string) => `No character "${id}" in the exports of ${project}. Play one of these:`,
  },
  'pt-BR': {
    title: 'Bancada de testes do Phaser',
    project: 'Projeto',
    characters: 'Personagens',
    projects: 'Projetos',
    viewer: '← Viewer do Diorama',
    noCatalog: 'A bancada lê os projetos do catálogo do servidor de desenvolvimento: abra-a com npm run view.',
    noProject: (name: string) => `Nenhum projeto "${name}" tem personagens exportados. Escolha um destes:`,
    noCharacter: (id: string, project: string) => `Nenhum personagem "${id}" nos exports de ${project}. Jogue um destes:`,
  },
} satisfies Record<Lang, unknown>;

/** The viewer's language: Portuguese when it chose 'pt-BR', English otherwise (and when storage is blocked). */
export function language(): Lang {
  try {
    return localStorage.getItem('diorama.lang') === 'pt-BR' ? 'pt-BR' : 'en';
  } catch {
    return 'en';
  }
}

/** This page with a new query: `project` and `character` set (or dropped when null), the renderer and the clock kept. */
function hrefWith(project: string, character: string | null): string {
  const query = new URLSearchParams(location.search);
  query.set('project', project);
  if (character === null) query.delete('character');
  else query.set('character', character);
  return `?${query}`;
}

/** Links to every project (`current` marked as the page's own). */
function projectLinks(projects: BenchProject[], current: string | null, label: string): HTMLElement {
  const nav = document.createElement('nav');
  nav.className = 'links';
  nav.setAttribute('aria-label', label);
  for (const { name } of projects) {
    const link = document.createElement('a');
    link.href = hrefWith(name, null);
    link.textContent = name;
    if (name === current) link.setAttribute('aria-current', 'page');
    nav.append(link);
  }
  return nav;
}

/** Links to the project's characters, the one playing marked as the page's own. */
function characterLinks(project: BenchProject, current: string | null, label: string): HTMLElement {
  const nav = document.createElement('nav');
  nav.className = 'links';
  nav.setAttribute('aria-label', label);
  for (const id of project.characters) {
    const link = document.createElement('a');
    link.href = hrefWith(project.name, id);
    link.textContent = readable(id);
    if (id === current) link.setAttribute('aria-current', 'page');
    nav.append(link);
  }
  return nav;
}

/** The project switcher: choosing one opens it with its first character. */
function projectSelect(projects: BenchProject[], current: BenchProject, label: string): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'project';
  const select = document.createElement('select');
  for (const { name } of projects) select.append(new Option(name, name, false, name === current.name));
  select.addEventListener('change', () => location.assign(hrefWith(select.value, null)));
  wrap.append(`${label} `, select);
  return wrap;
}

/** Fills the footer: the bench's name, the project switcher and its characters (when there is a project), the way back to the viewer. */
export function renderFooter(footer: HTMLElement, lang: Lang, projects: BenchProject[], project: BenchProject | null, character: string | null) {
  const words = WORDS[lang];
  const title = document.createElement('strong');
  title.textContent = words.title;
  const viewer = document.createElement('a');
  viewer.className = 'viewer';
  viewer.href = '/viewer/';
  viewer.textContent = words.viewer;
  const middle = project ? [projectSelect(projects, project, words.project), characterLinks(project, character, words.characters)] : [];
  footer.replaceChildren(title, ...middle, viewer);
}

/** What the page says in place of the canvas when there is nothing to play, with the links that lead to something. */
export type Nothing = { kind: 'catalog' } | { kind: 'project'; name: string } | { kind: 'character'; id: string; project: BenchProject };

export function renderNothing(where: HTMLElement, lang: Lang, projects: BenchProject[], nothing: Nothing) {
  const words = WORDS[lang];
  const message = document.createElement('p');
  if (nothing.kind === 'catalog') {
    message.textContent = words.noCatalog;
    where.replaceChildren(message);
  } else if (nothing.kind === 'project') {
    message.textContent = words.noProject(nothing.name);
    where.replaceChildren(message, projectLinks(projects, null, words.projects));
  } else {
    message.textContent = words.noCharacter(nothing.id, nothing.project.name);
    where.replaceChildren(message, characterLinks(nothing.project, null, words.characters));
  }
  where.hidden = false;
}
