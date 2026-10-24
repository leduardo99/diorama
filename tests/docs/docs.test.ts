import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

console.log('🧪 Checking skill and guide snippets, links and paths...\n');

// Guides describe choices, not templates. A fenced `ts` block may hold a basic one-line form only.
const MAX_LINES = 3;
const ALLOW_MARKER = '<!-- docs:allow-long -->';
const ROOT = resolve('.');
const SNIPPET_DIR = resolve('tests/docs/.snippets');

const guideDir = (dir: string) =>
  readdirSync(resolve(dir))
    .filter(name => name.endsWith('.md'))
    .map(name => resolve(dir, name));

const docFiles = [
  resolve('README.md'),
  resolve('docs/ARCHITECTURE.md'),
  resolve('docs/guides/README.md'),
  ...guideDir('docs/guides/volume'),
  ...guideDir('docs/guides/rig'),
  resolve('core/draw/README.md'),
  resolve('packages/runtime/README.md'),
  resolve('packages/phaser/README.md'),
  resolve('projects/README.md'),
  resolve('templates/optional/STYLE.md'),
  resolve('.agents/skills/diorama/SKILL.md'),
  resolve('.agents/skills/diorama-setup/SKILL.md'),
  resolve('.agents/skills/diorama-review/SKILL.md'),
  resolve('.agents/skills/diorama-volume/SKILL.md'),
  ...guideDir('.agents/skills/diorama-volume/references'),
  resolve('.agents/skills/diorama-rig/SKILL.md'),
];

interface Snippet {
  file: string;
  line: number;
  code: string;
  allowLong: boolean;
}

function extractSnippets(file: string): Snippet[] {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const snippets: Snippet[] = [];
  let inside = false;
  let start = 0;
  let buffer: string[] = [];
  let allowLong = false;
  let previous = '';

  lines.forEach((text, index) => {
    const trimmed = text.trim();
    if (!inside) {
      if (trimmed === '```ts') {
        inside = true;
        start = index + 1;
        buffer = [];
        allowLong = previous === ALLOW_MARKER;
      }
      if (trimmed !== '') previous = trimmed;
    } else if (trimmed === '```') {
      inside = false;
      snippets.push({ file, line: start, code: buffer.join('\n'), allowLong });
      previous = '';
    } else {
      buffer.push(text);
    }
  });

  return snippets;
}

// Imports are hoisted, `export` is dropped, and the body goes into a function so
// top-level statements compile. `ctx` is the only ambient name a snippet may use.
function toModule(code: string): string {
  const imports: string[] = [];
  const rest = code.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?/gm, match => {
    imports.push(match);
    return '';
  });
  const body = rest.replace(/^export\s+/gm, '');
  return [
    ...imports,
    'declare const ctx: CanvasRenderingContext2D;',
    'export function snippet(): void {',
    body,
    '}',
    '',
  ].join('\n');
}

const snippets = docFiles.flatMap(extractSnippets);
const problems: string[] = [];

for (const snippet of snippets) {
  const lineCount = snippet.code.split('\n').filter(line => line.trim() !== '').length;
  if (lineCount > MAX_LINES && !snippet.allowLong) {
    problems.push(`${snippet.file}:${snippet.line} has ${lineCount} lines; fenced ts blocks in guides are limited to ${MAX_LINES}.`);
  }
}

// Typecheck every snippet against the repo's own tsconfig, so `@core` paths resolve.
rmSync(SNIPPET_DIR, { recursive: true, force: true });
mkdirSync(SNIPPET_DIR, { recursive: true });
try {
  const files = snippets.map((snippet, index) => {
    const path = join(SNIPPET_DIR, `snippet-${index}.ts`);
    writeFileSync(path, toModule(snippet.code), 'utf8');
    return path;
  });

  const config = ts.readConfigFile(resolve('tsconfig.json'), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, ROOT);
  const program = ts.createProgram(files, { ...parsed.options, noEmit: true });
  const diagnostics = ts.getPreEmitDiagnostics(program).filter(d => d.file && files.some(f => resolve(d.file!.fileName) === resolve(f)));

  for (const diagnostic of diagnostics) {
    const index = files.findIndex(f => resolve(diagnostic.file!.fileName) === resolve(f));
    const origin = snippets[index];
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
    problems.push(`${origin.file}:${origin.line} does not compile: ${message}`);
  }
} finally {
  rmSync(SNIPPET_DIR, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------
// Links and paths. Every markdown file of the repository (the third-party skills in .claude/ and
// node_modules aside) must link only to files and headings that exist, and a backticked path that
// starts at the repository root (`docs/api/volume.md`, `core/draw/`) must exist too.
// ---------------------------------------------------------------------------------------------

const MARKDOWN_SKIP = new Set(['node_modules', '.git', '.claude', '.tanstack', 'dist', '.diorama-trash', '.snippets']);

function markdownFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (MARKDOWN_SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...markdownFiles(full));
    else if (entry.endsWith('.md')) out.push(full);
  }
  return out.sort();
}

/** Text outside fenced code blocks, with the line numbers kept; fences hold trees and commands, not claims. */
function proseLines(file: string): { line: number; text: string }[] {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const out: { line: number; text: string }[] = [];
  let fence = '';
  lines.forEach((text, index) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(text)?.[1];
    if (marker) {
      if (!fence) fence = marker[0];
      else if (marker[0] === fence) fence = '';
      return;
    }
    if (!fence) out.push({ line: index + 1, text });
  });
  return out;
}

/** The anchors GitHub gives the headings of a markdown file. */
const anchorCache = new Map<string, Set<string>>();
function anchorsOf(file: string): Set<string> {
  const cached = anchorCache.get(file);
  if (cached) return cached;
  const seen = new Map<string, number>();
  const anchors = new Set<string>();
  for (const { text } of proseLines(file)) {
    const heading = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(text);
    if (!heading) continue;
    const slug = heading[1].replace(/[`*]|<[^>]+>/g, '').toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s/g, '-');
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    anchors.add(count ? `${slug}-${count}` : slug);
  }
  anchorCache.set(file, anchors);
  return anchors;
}

/** Top-level names a backticked path can start with. */
const REPO_ROOTS = ['.agents', '.claude', 'core', 'docs', 'packages', 'tools', 'scripts', 'templates', 'tests', 'viewer', 'examples', 'projects'];
const REPO_FILES = new Set(['README.md', 'LICENSE', 'THIRD_PARTY.md', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'index.html', 'dev.sh', 'dev.bat', 'components.json']);

/**
 * Is this code span a path that has to exist? Placeholders (`<project>`, `*`, `...`), command lines,
 * a user's own projects (`projects/my-game/...`) and generated folders (`assets/`, `review/`, which a
 * fresh clone does not have) are left out.
 */
function repoPathOf(span: string): string | undefined {
  const text = span.replace(/:\d+(-\d+)?$/, '').replace(/[.,;:]+$/, '');
  if (/[\s<>*{}()|$=]|\.\.\.|…|\\/.test(text)) return undefined;
  const first = text.split('/')[0];
  const isRoot = text.includes('/') ? REPO_ROOTS.includes(first) : REPO_FILES.has(text);
  if (!isRoot) return undefined;
  if (first === 'projects' && text !== 'projects/' && text !== 'projects/README.md') return undefined;
  if (/(^|\/)(assets|review|\.diorama-trash|\.snippets)(\/|$)/.test(text)) return undefined;
  return text;
}

const markdown = markdownFiles(ROOT);
let links = 0;
let paths = 0;
for (const file of markdown) {
  const shown = relative(ROOT, file).split(sep).join('/');
  for (const { line, text } of proseLines(file)) {
    // Markdown links: [label](target), skipping inline code so `[x](y)` shown as an example is not followed.
    const withoutCode = text.replace(/`[^`]*`/g, match => ' '.repeat(match.length));
    for (const match of withoutCode.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const raw = match[1];
      if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) continue;
      links++;
      const [pathPart, fragment] = raw.split('#');
      const targetFile = pathPart ? resolve(dirname(file), decodeURIComponent(pathPart.split('?')[0])) : file;
      if (!existsSync(targetFile)) {
        problems.push(`${shown}:${line} links to ${raw}, which does not exist.`);
      } else if (fragment && targetFile.endsWith('.md') && !anchorsOf(targetFile).has(fragment.toLowerCase())) {
        problems.push(`${shown}:${line} links to ${raw}, but ${relative(ROOT, targetFile).split(sep).join('/')} has no heading #${fragment}.`);
      }
    }
    // Backticked paths from the repository root.
    for (const match of text.matchAll(/`([^`\n]+)`/g)) {
      const path = repoPathOf(match[1]);
      if (!path) continue;
      paths++;
      if (!existsSync(resolve(ROOT, path))) problems.push(`${shown}:${line} names \`${path}\`, which does not exist.`);
    }
  }
}

assert.equal(problems.length, 0, `Documentation problems:\n${problems.join('\n')}`);

console.log(`✔ ${snippets.length} snippets checked across ${docFiles.length} files.`);
console.log(`✔ ${links} links and ${paths} paths checked across ${markdown.length} markdown files.\n`);
