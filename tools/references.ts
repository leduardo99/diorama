/**
 * Diorama - what a file of a project loads: every module specifier and URL in its code, its CSS and its HTML, found the
 * way the tools that load them read them (TypeScript's parser for code, a tokenizer for HTML), for the layout rules
 * (tools/layout.ts, rule 8). Comments never count; strings that are only data (a URL handed to fetch or to Phaser's loader
 * at run time) are not references.
 */

import ts from 'typescript';

/**
 * How a file refers to another:
 * - `module`: a module specifier (`import`, `export ... from`, `import x = require()`, `require()`, a type's `import()`,
 *   `/// <reference types>`): a bare name is a package;
 * - `dynamic`: `import()` of a value;
 * - `glob`: a pattern of `import.meta.glob`;
 * - `url`: a URL, relative to the file when it has no scheme and no leading `/` (`new URL(x, import.meta.url)`, CSS's
 *   `url()`, `@import` and `image-set()`, an HTML attribute, an import map, `/// <reference path>`).
 */
export type ReferenceKind = 'module' | 'dynamic' | 'glob' | 'url';

export interface Reference {
  kind: ReferenceKind;
  /** The specifier, pattern or URL as written (entities decoded in HTML); null when it is computed, not a string. */
  spec: string | null;
  /** The text of a computed one (`` `../src/${name}` ``), else `spec` quoted. */
  text: string;
  /** For a template literal with substitutions: its text before the first one. */
  prefix?: string;
  /** How it is written, for messages: `import`, `import()`, `import.meta.glob`, `new URL(..., import.meta.url)`, `url()`, `<script src>`... */
  how: string;
  /** Where in a page it is, for messages: `an inline module script`, `a <style>`, `an onclick attribute`. */
  where?: string;
  /** 1-based line in the file. */
  line: number;
}

const lineAt = (text: string, offset: number) => text.slice(0, offset).split('\n').length;

/** The value of a string literal, or of a template without substitutions; undefined for anything else. */
function stringOf(node: ts.Node | undefined): string | undefined {
  if (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) return node.text;
  return undefined;
}

const isImportMeta = (node: ts.Node): boolean => ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword && node.name.text === 'meta';

/** The script kind TypeScript parses a file of this name as. */
function scriptKindOf(fileName: string): ts.ScriptKind {
  if (/\.tsx$/i.test(fileName)) return ts.ScriptKind.TSX;
  if (/\.[mc]?ts$/i.test(fileName)) return ts.ScriptKind.TS;
  if (/\.jsx$/i.test(fileName)) return ts.ScriptKind.JSX;
  return ts.ScriptKind.JS;
}

/** Every module specifier and URL of a script (TypeScript or JavaScript), by TypeScript's parser. `firstLine` places an inline script in its page. */
export function codeReferences(source: string, fileName: string, firstLine = 1): Reference[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKindOf(fileName));
  const out: Reference[] = [];
  const line = (node: ts.Node | ts.TextRange) => file.getLineAndCharacterOfPosition('getStart' in node ? (node as ts.Node).getStart(file) : node.pos).line + firstLine;
  const add = (kind: ReferenceKind, node: ts.Node | undefined, how: string, at: ts.Node) => {
    const spec = stringOf(node);
    const reference: Reference = { kind, spec: spec ?? null, text: spec !== undefined ? `"${spec}"` : (node?.getText(file) ?? '(nothing)'), how, line: line(at) };
    if (spec === undefined && node && ts.isTemplateExpression(node)) reference.prefix = node.head.text;
    out.push(reference);
  };
  for (const ref of file.referencedFiles) out.push({ kind: 'url', spec: ref.fileName, text: `"${ref.fileName}"`, how: '/// <reference path>', line: line(ref) });
  for (const ref of file.typeReferenceDirectives) out.push({ kind: 'module', spec: ref.fileName, text: `"${ref.fileName}"`, how: '/// <reference types>', line: line(ref) });
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      add('module', node.moduleSpecifier, ts.isImportDeclaration(node) ? 'import' : 'export ... from', node);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add('module', node.moduleReference.expression, 'import = require()', node);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add('module', node.argument.literal, 'a type\'s import()', node);
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const [first] = node.arguments;
      if (callee.kind === ts.SyntaxKind.ImportKeyword) {
        add('dynamic', first, 'import()', node);
      } else if (ts.isIdentifier(callee) && callee.text === 'require' && node.arguments.length === 1) {
        add('module', first, 'require()', node);
      } else if (ts.isPropertyAccessExpression(callee) && isImportMeta(callee.expression) && /^glob/.test(callee.name.text)) {
        const how = `import.meta.${callee.name.text}`;
        if (first && ts.isArrayLiteralExpression(first)) for (const element of first.elements) add('glob', element, how, node);
        else add('glob', first, how, node);
      }
    } else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'URL' && node.arguments?.length === 2) {
      const base = node.arguments[1];
      if (ts.isPropertyAccessExpression(base) && isImportMeta(base.expression) && base.name.text === 'url') add('url', node.arguments[0], 'new URL(..., import.meta.url)', node);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return out;
}

/** CSS without its comments, line breaks kept. */
const stripCssComments = (css: string) => css.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, (comment) => comment.replace(/[^\n]/g, ' '));

/** Every URL a style sheet loads: `url()`, `@import` and the strings of `image-set()`. `firstLine` places a `<style>` or a `style` attribute in its page. */
export function cssReferences(css: string, firstLine = 1): Reference[] {
  const code = stripCssComments(css);
  const out: Reference[] = [];
  const add = (spec: string, how: string, at: number) => out.push({ kind: 'url', spec, text: `"${spec}"`, how, line: lineAt(code, at) + firstLine - 1 });
  for (const m of code.matchAll(/\burl\(\s*(?:"([^"]*)"|'([^']*)'|([^)"'\s]*))\s*\)/gi)) add(m[1] ?? m[2] ?? m[3] ?? '', 'url()', m.index!);
  for (const m of code.matchAll(/@import\s+(?:"([^"]*)"|'([^']*)')/gi)) add(m[1] ?? m[2], '@import', m.index!);
  for (const m of code.matchAll(/\b(?:-webkit-)?image-set\(([^;{}]*)\)/gi)) {
    for (const s of m[1].matchAll(/(?<!url\(\s*)(?:"([^"]*)"|'([^']*)')/g)) add(s[1] ?? s[2], 'image-set()', m.index! + m[0].indexOf(m[1]) + s.index!);
  }
  return out;
}

const NAMED: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', sol: '/', period: '.', colon: ':', num: '#', quest: '?', equals: '=', lpar: '(', rpar: ')', nbsp: ' ', tab: '\t', newline: '\n' };

/** An attribute's value as the browser reads it: character references decoded. */
function decodeEntities(value: string): string {
  return value.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));?/gi, (match, dec: string, hex: string, name: string) => {
    if (dec) return String.fromCodePoint(Number(dec));
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    return NAMED[name.toLowerCase()] ?? match;
  });
}

interface Tag {
  name: string;
  attributes: { name: string; value: string; at: number }[];
  /** The text of a `<script>` or `<style>`, and where it starts. */
  content?: { text: string; at: number };
}

/** The tags of a page, as a browser's tokenizer finds them: comments skipped, attributes quoted or not, `<script>` and `<style>` with their text. */
function tagsOf(html: string): Tag[] {
  const tags: Tag[] = [];
  let i = 0;
  while ((i = html.indexOf('<', i)) >= 0) {
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    const open = /^<([a-zA-Z][^\s/>]*)/.exec(html.slice(i, i + 256));
    if (!open) {
      i++;
      continue;
    }
    const tag: Tag = { name: open[1].toLowerCase(), attributes: [] };
    let j = i + open[0].length;
    while (j < html.length && html[j] !== '>') {
      if (/[\s/]/.test(html[j])) {
        j++;
        continue;
      }
      const name = /^[^\s/>=]+/.exec(html.slice(j))?.[0] ?? html[j];
      j += name.length;
      while (/\s/.test(html[j] ?? '')) j++;
      let value = '';
      let at = j;
      if (html[j] === '=') {
        j++;
        while (/\s/.test(html[j] ?? '')) j++;
        const quote = html[j];
        if (quote === '"' || quote === "'") {
          const end = html.indexOf(quote, j + 1);
          at = j + 1;
          value = html.slice(j + 1, end < 0 ? html.length : end);
          j = end < 0 ? html.length : end + 1;
        } else {
          at = j;
          value = /^[^\s>]*/.exec(html.slice(j))![0];
          j += value.length;
        }
      }
      tag.attributes.push({ name: name.toLowerCase(), value: decodeEntities(value), at });
    }
    j++;
    if (tag.name === 'script' || tag.name === 'style') {
      const close = new RegExp(`</${tag.name}[\\s/>]`, 'i').exec(html.slice(j));
      const end = close ? j + close.index : html.length;
      tag.content = { text: html.slice(j, end), at: j };
      j = end;
    }
    tags.push(tag);
    i = j;
  }
  return tags;
}

/** Script types a browser runs (or Vite bundles): none, a JavaScript MIME type, or `module`. */
const SCRIPT_TYPES = /^(|module|text\/javascript|application\/javascript|text\/ecmascript|application\/ecmascript|text\/jsx|text\/babel)$/i;

/**
 * Every URL and module specifier a page loads: its tags' `src`, `srcset`, `poster`, `data`, `action`, `formaction` and
 * `href` (a link `<a>`/`<area>` aside: it is followed, not loaded), `style` attributes and `<style>` (as CSS), inline
 * scripts and `on...` attributes (as code), and the URLs of an import map.
 */
export function htmlReferences(html: string): Reference[] {
  const out: Reference[] = [];
  for (const tag of tagsOf(html)) {
    const type = tag.attributes.find((a) => a.name === 'type')?.value.trim() ?? '';
    for (const { name, value, at } of tag.attributes) {
      const line = lineAt(html, at);
      const how = `<${tag.name} ${name}>`;
      if (['src', 'poster', 'data', 'action', 'formaction'].includes(name) || (name === 'href' && tag.name !== 'a' && tag.name !== 'area')) {
        if (value.trim()) out.push({ kind: 'url', spec: value.trim(), text: `"${value.trim()}"`, how, line });
      } else if (name === 'srcset' || name === 'imagesrcset') {
        for (const candidate of value.split(',')) {
          const url = candidate.trim().split(/\s+/)[0];
          if (url) out.push({ kind: 'url', spec: url, text: `"${url}"`, how, line });
        }
      } else if (name === 'style') {
        out.push(...cssReferences(value, line).map((r) => ({ ...r, where: `a style attribute of <${tag.name}>` })));
      } else if (name.startsWith('on')) {
        out.push(...codeReferences(value, 'attribute.js', line).map((r) => ({ ...r, where: `an ${name} attribute` })));
      }
    }
    if (!tag.content) continue;
    const first = lineAt(html, tag.content.at);
    if (tag.name === 'style') {
      out.push(...cssReferences(tag.content.text, first).map((r) => ({ ...r, where: 'a <style>' })));
    } else if (type.toLowerCase() === 'importmap') {
      let map: { imports?: Record<string, unknown>; scopes?: Record<string, Record<string, unknown>> } = {};
      try {
        map = JSON.parse(tag.content.text);
      } catch {
        out.push({ kind: 'url', spec: null, text: 'an import map that is not JSON', how: '<script type="importmap">', line: first });
      }
      const urls = [...Object.values(map.imports ?? {}), ...Object.values(map.scopes ?? {}).flatMap((scope) => Object.values(scope ?? {}))];
      for (const url of urls) out.push({ kind: 'url', spec: typeof url === 'string' ? url : null, text: JSON.stringify(url), how: '<script type="importmap">', line: first });
    } else if (SCRIPT_TYPES.test(type)) {
      const where = type.toLowerCase() === 'module' ? 'an inline module script' : 'an inline script';
      out.push(...codeReferences(tag.content.text, 'inline.ts', first).map((r) => ({ ...r, where })));
    }
  }
  return out;
}
