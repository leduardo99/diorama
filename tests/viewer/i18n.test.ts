import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { createTranslator, DEFAULT_LANG, isLang, LANG_NAMES, LANGS, placeholdersOf, stringsOf } from '../../viewer/src/i18n/core';
import { langStore, LANG_STORAGE_KEY, readStoredLang, setLang } from '../../viewer/src/i18n/store';

console.log('🧪 Checking the interface languages (both dictionaries agree, formats follow the language, nothing is left hard-coded)...\n');

const en = stringsOf('en');
const pt = stringsOf('pt-BR');

// 1. The two dictionaries have exactly the same keys. (The types already say so; this is the same check for a run without tsc.)
assert.deepEqual(LANGS, ['en', 'pt-BR']);
assert.equal(DEFAULT_LANG, 'en', 'English is the default');
assert.deepEqual([...en.keys()].filter((key) => !pt.has(key)), [], 'every English key has a Portuguese string');
assert.deepEqual([...pt.keys()].filter((key) => !en.has(key)), [], 'no Portuguese key is left over');
assert.ok(en.size > 600, `the dictionaries are not empty (${en.size} strings)`);

// 2. A string and its translation carry the same {placeholders} and the same markup, and no string is empty.
const tagsOf = (text: string) => [...text.matchAll(/<(\w+)>[^<]*<\/\1>/g)].map((m) => m[1]).sort();
const KNOWN_TAGS = new Set(['code', 'b', 'kbd', 'mono']);
for (const [key, text] of en) {
  const other = pt.get(key)!;
  assert.ok(text.trim() !== '' && other.trim() !== '', `${key}: not empty`);
  assert.deepEqual([...new Set(placeholdersOf(other))].sort(), [...new Set(placeholdersOf(text))].sort(), `${key}: the same {placeholders} in both languages`);
  assert.deepEqual(tagsOf(other), tagsOf(text), `${key}: the same markup in both languages`);
  for (const tag of tagsOf(text)) assert.ok(KNOWN_TAGS.has(tag), `${key}: <${tag}> is a markup the screen knows`);
}

// 3. A plural (a key with a .one) has both forms.
for (const lang of LANGS) {
  const strings = stringsOf(lang);
  for (const key of strings.keys()) {
    if (!key.endsWith('.one')) continue;
    const base = key.slice(0, -4);
    assert.ok(strings.has(`${base}.other`), `${lang} ${key}: a plural needs its .other`);
  }
}
// The forms are the same in both languages: a key that is a plural in one is a plural in the other.
assert.deepEqual([...en.keys()].filter((key) => key.endsWith('.one')), [...pt.keys()].filter((key) => key.endsWith('.one')));

// 4. Interpolation, plural and a key that is not there.
const english = createTranslator('en');
const portuguese = createTranslator('pt-BR');
assert.equal(english.t('projects.menu.label', { project: 'forge' }), 'Actions for project forge');
assert.equal(portuguese.t('projects.menu.label', { project: 'forge' }), 'Ações do projeto forge');
assert.equal(english.plural('counts.assets', 1), '1 asset');
assert.equal(english.plural('counts.assets', 2), '2 assets');
assert.equal(english.plural('counts.assets', 0), '0 assets');
assert.equal(portuguese.plural('counts.files', 1), '1 arquivo');
assert.equal(portuguese.plural('counts.files', 0), '0 arquivo', 'Portuguese counts zero as one');
assert.equal(portuguese.plural('counts.files', 3), '3 arquivos');
assert.equal(english.plural('counts.assets', 1234), '1,234 assets', 'the count is written the way the language writes numbers');
assert.equal(portuguese.plural('counts.assets', 1234), '1.234 assets');
assert.equal(english.t('assets.filtered', { shown: 3 }), '3 of {total}', 'a placeholder with no value is left as written');
assert.equal(english.t('no.such.key' as never), 'no.such.key', 'a missing key shows itself');
assert.equal(createTranslator('en'), english, 'a translator is made once per language');

// 4b. The app with no project (routes/index.tsx) speaks both languages: what Diorama is, "New project", "Try the sample"
//     with its progress and its failure, the command a terminal runs instead, and the copy once it is there (after a run
//     whose export failed, or one that ended elsewhere) with "Open soulkeeper".
const EMPTY_STATE = ['title', 'description', 'where', 'create', 'sample', 'sampleRunning', 'sampleHint', 'copying', 'exporting', 'terminal', 'copyCommand', 'commandLabel', 'sampleFailed', 'sampleReady', 'sampleThere', 'sampleThereHint', 'sampleExportFailed', 'sampleRetryHint', 'open'];
for (const key of EMPTY_STATE.map((name) => `projects.none.${name}`)) {
  assert.ok(en.has(key) && pt.has(key), `${key} is in both dictionaries`);
  assert.notEqual(pt.get(key), en.get(key), `${key} is translated`);
}
assert.deepEqual([...en.keys()].filter((key) => key.startsWith('projects.none.')), EMPTY_STATE.map((name) => `projects.none.${name}`), 'the empty state has these strings and no others');
for (const translator of [english, portuguese]) {
  assert.match(translator.t('projects.none.sampleHint'), /<code>examples\/soulkeeper<\/code>.*<code>projects\/soulkeeper<\/code>/, 'the sample comes from examples/ into projects/');
}
for (const translator of [english, portuguese]) {
  assert.match(translator.t('projects.none.sampleThereHint'), /<code>projects\/soulkeeper<\/code>.*<code>examples\/soulkeeper<\/code>/, 'the copy is in projects/, the sample stays in examples/');
}
assert.deepEqual([english.t('projects.none.open', { project: 'soulkeeper' }), portuguese.t('projects.none.open', { project: 'soulkeeper' })], ['Open soulkeeper', 'Abrir soulkeeper']);
assert.equal(english.t('projects.none.exporting', { done: 3, total: 163 }), 'Exporting the sheets: 3 of 163 done');
assert.equal(portuguese.t('projects.none.exporting', { done: 3, total: 163 }), 'Exportando as sheets: 3 de 163 prontas');
assert.ok(!en.has('projects.switcher.example') && !en.has('modals.new.exampleOption'), 'no project is marked as an example: the viewer lists projects/ only');

// 5. Numbers, dates, sizes, lists and times follow the language.
assert.equal(english.number(1234.5), '1,234.5');
assert.equal(portuguese.number(1234.5), '1.234,5');
assert.equal(english.number(0.256, { maximumFractionDigits: 2 }), '0.26');
assert.equal(portuguese.number(0.256, { maximumFractionDigits: 2 }), '0,26');
assert.deepEqual([english.bytes(812), english.bytes(1536), english.bytes(2.5 * 1024 * 1024)], ['812 B', '1.5 kB', '2.50 MB']);
assert.deepEqual([portuguese.bytes(812), portuguese.bytes(1536), portuguese.bytes(2.5 * 1024 * 1024)], ['812 B', '1,5 kB', '2,50 MB']);
assert.equal(english.list(['a', 'b', 'c']), 'a, b, and c');
assert.equal(portuguese.list(['a', 'b', 'c']), 'a, b e c');
assert.equal(english.list(['blade', 'polearm'], 'or'), 'blade or polearm');
assert.equal(portuguese.list(['lâmina', 'haste'], 'or'), 'lâmina ou haste');
const when = new Date(2026, 2, 7, 14, 5, 9).getTime();
assert.match(english.date(when), /3\/7\/26.*2:05:09/, 'month first, 12-hour clock');
assert.match(portuguese.date(when), /07\/03\/2026.*14:05:09/, 'day first, 24-hour clock');
assert.equal(english.relative(Date.now()), 'now');
assert.equal(portuguese.relative(Date.now()), 'agora');
assert.match(english.relative(Date.now() - 3 * 3_600_000), /3 hr\. ago/);
assert.match(portuguese.relative(Date.now() - 3 * 3_600_000), /há 3 h/);

// 6. The choice of language: remembered under diorama.lang, tolerant of storage that is blocked or holds nonsense.
assert.equal(LANG_STORAGE_KEY, 'diorama.lang');
assert.equal(readStoredLang(), 'en', 'no storage at all: the default');
const storage = new Map<string, string>();
const html = { lang: '' };
Object.assign(globalThis, {
  localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => void storage.set(key, value) },
  document: { documentElement: html },
});
assert.equal(readStoredLang(), 'en', 'nothing remembered yet');
setLang('pt-BR');
assert.equal(storage.get('diorama.lang'), 'pt-BR');
assert.equal(html.lang, 'pt-BR', '<html lang> follows');
assert.equal(langStore.state, 'pt-BR');
assert.equal(readStoredLang(), 'pt-BR', 'the next visit reads it back');
storage.set('diorama.lang', 'klingon');
assert.equal(readStoredLang(), 'en', 'an unknown language is ignored');
Object.assign(globalThis, { localStorage: { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } } });
assert.equal(readStoredLang(), 'en', 'blocked storage is not an error');
setLang('en');
assert.equal(html.lang, 'en', 'the language still applies when it cannot be remembered');
assert.deepEqual(LANGS.map((lang) => LANG_NAMES[lang]), ['English', 'Português (Brasil)']);
assert.ok(LANGS.every(isLang) && !isLang('fr') && !isLang(undefined));
assert.match(readFileSync('viewer/index.html', 'utf8'), /<html lang="en"/, 'the page starts in the default language');

// 7. No Portuguese is left in the interface code. JSX text and string literals of viewer/src (outside src/i18n) must not read
//    as Portuguese: accented letters, or words only Portuguese has. Comments are free to quote it. What is legitimately content
//    (a name a project gave) goes in ALLOWED, with the reason.
const ROOT = 'viewer/src';
const ALLOWED = new Map<string, string>([
  // 'file:line text' -> why it is not interface text
]);
const ACCENTED = /[áéíóúâêôãõçàÁÉÍÓÚÂÊÔÃÕÇÀ]/;
const WORDS = new Set([
  'não', 'nao', 'uma', 'dos', 'das', 'nas', 'está', 'são', 'ainda', 'também', 'tambem', 'nenhum', 'nenhuma', 'arquivo', 'arquivos', 'projeto', 'projetos',
  'peça', 'peças', 'cena', 'cenas', 'salvar', 'salvo', 'abrir', 'fechar', 'excluir', 'apagar', 'criar', 'exportar', 'exportado', 'buscar', 'voltar', 'tentar',
  'carregar', 'mostrar', 'esconder', 'desfazer', 'refazer', 'escolha', 'clique', 'arraste', 'segure', 'pincel', 'chão', 'parede', 'paredes', 'porta', 'portas',
  'personagem', 'personagens', 'animação', 'animações', 'direção', 'lado', 'lados', 'altura', 'largura', 'tamanho', 'nome', 'caminho', 'pasta', 'pastas', 'tipo',
  'todas', 'todos', 'sem', 'mais', 'menos', 'agora', 'aqui', 'esta', 'este', 'estes', 'estas', 'pelo', 'pela', 'uso', 'usar', 'junto', 'depois', 'antes',
  'erro', 'falha', 'falhou', 'pronto', 'lixeira', 'aviso', 'ajustes', 'materiais', 'corpo', 'vestir', 'tirar', 'trocar', 'adicionar', 'remover',
]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== 'i18n') out.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(name) && name !== 'routeTree.gen.ts') {
      out.push(path);
    }
  }
  return out;
}

/** Every piece of text the code writes: JSX text and the text of string and template literals. */
function textsOf(file: string): Array<{ line: number; text: string }> {
  const source = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: Array<{ line: number; text: string }> = [];
  const add = (node: ts.Node, text: string) => found.push({ line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, text });
  const visit = (node: ts.Node) => {
    // The path of an import is not text for a reader.
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) return;
    if (ts.isJsxText(node)) add(node, node.text);
    else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) add(node, node.text);
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) add(node, node.text);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

const portugueseIn = (text: string) => {
  if (ACCENTED.test(text)) return 'accented letter';
  const word = text.toLowerCase().split(/[^a-zà-ÿ]+/).find((w) => WORDS.has(w));
  return word ? `the word "${word}"` : null;
};

// The detector itself: it must catch Portuguese and let English and code through.
assert.ok(portugueseIn('Nenhum projeto ainda') && portugueseIn('Exportar tudo') && portugueseIn('Cenário') && portugueseIn('Salvar cena'));
assert.ok(!portugueseIn('No projects yet') && !portugueseIn('src/gear/catalog.ts') && !portugueseIn('flex items-center gap-2') && !portugueseIn('Export again'));

const problems: string[] = [];
let scanned = 0;
for (const file of sourceFiles(ROOT)) {
  for (const { line, text } of textsOf(file)) {
    scanned++;
    const why = portugueseIn(text);
    if (why && !ALLOWED.has(`${relative(ROOT, file)}:${line}`)) problems.push(`${file}:${line} ${why}: ${JSON.stringify(text.trim().slice(0, 80))}`);
  }
}
assert.ok(existsSync(ROOT) && scanned > 2000, `the scan looked at the code (${scanned} texts)`);
assert.deepEqual(problems, [], `Portuguese interface text outside src/i18n: put it in the dictionaries and use t()\n${problems.join('\n')}`);

console.log(`✅ i18n checks passed (${en.size} strings in each language, ${scanned} texts of the code scanned)`);
