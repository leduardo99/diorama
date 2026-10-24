/**
 * Diorama - the determinism lint of a project (docs/ARCHITECTURE.md, "Determinism"), run by `npm run check`.
 *
 * The same source must export the same pixels, so the code of `src/` and `sheets/` may not read the clock
 * (`new Date`, `Date()`, `Date.now`, `performance.now`) or `Math.random` (nor call `createRng()` without the seed that
 * would otherwise come from the clock), and colors are chosen in one place:
 * raw `#hex`, `rgb()`/`rgba()` and `hsl()`/`hsla()` literals belong in `src/theme.ts` (the palette), and every
 * other file composes its tokens (or, in a kit piece, the ramp of the material that plays a role).
 *
 * Each file is parsed with TypeScript, so comments (and color codes written in them) never count, and a color is
 * only a color inside a string or template literal.
 *
 * A project's `game/` is not linted: it exports nothing, and a game reads the clock and rolls dice by design (rule 8).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { LAYOUT, walkFiles } from './project.js';

export interface LintIssue {
  /** `random` (Math.random, createRng() without a seed), `clock` (Date, performance.now) or `color` (a raw color literal). */
  rule: 'random' | 'clock' | 'color';
  /** Project-relative path: `src/props/crate.ts`. */
  path: string;
  /** 1-based line. */
  line: number;
  message: string;
}

/** The one file where raw color literals are allowed: the theme, which holds the palette. */
export const THEME_FILE = `${LAYOUT.src}/theme.ts`;

/** `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, standing alone (not `#bad-id`, not part of a longer word). */
const HEX = /(?<![\w#&])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/i;
/** A CSS color function: `rgb(`, `rgba(`, `hsl(`, `hsla(`. */
const COLOR_FN = /\b(?:rgba?|hsla?)\s*\(/i;

const MESSAGES = {
  random: (what: string) => `${what} gives a different result on every export: take variation from createRng(seed) of @core with a fixed seed (in a scenery piece pieceRng(ctx), in an effect effectRng(ctx, salt), both of @core/volume), so the same source exports the same pixels.`,
  clock: (what: string) => `${what} reads the clock (and the machine's time zone), so a re-export draws something else: animate with frameIndex and frameCount (or the clip's t), and seed variation with createRng(seed) of @core.`,
  color: (what: string) => `${what} is a raw color: colors live in ${THEME_FILE} (PALETTES, RAMPS, VOLUMES). Add a token there and use it here; a kit piece reads the material of its role instead (ctx.materials.<role>.ramp).`,
};

/** The issues of one file's source. `path` is project-relative; color literals are allowed in the theme only. */
export function lintSource(path: string, source: string): LintIssue[] {
  const kind = path.endsWith('.tsx') ? ts.ScriptKind.TSX : path.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, kind);
  const issues: LintIssue[] = [];
  const colorsAllowed = path === THEME_FILE;
  const report = (rule: LintIssue['rule'], node: ts.Node, what: string) => {
    const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
    issues.push({ rule, path, line, message: `${path}:${line}: ${MESSAGES[rule](what)}` });
  };
  const named = (node: ts.Expression, name: string) => ts.isIdentifier(node) && node.text === name;
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node)) {
      const member = node.name.text;
      if (member === 'random' && named(node.expression, 'Math')) report('random', node, 'Math.random');
      else if (member === 'now' && named(node.expression, 'Date')) report('clock', node, 'Date.now');
      else if (member === 'now' && (named(node.expression, 'performance') || (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'performance'))) report('clock', node, 'performance.now');
    } else if (ts.isElementAccessExpression(node) && named(node.expression, 'Math') && ts.isStringLiteralLike(node.argumentExpression) && node.argumentExpression.text === 'random') {
      report('random', node, 'Math.random');
    } else if (ts.isNewExpression(node) && named(node.expression, 'Date')) {
      report('clock', node, 'new Date');
    } else if (ts.isCallExpression(node) && named(node.expression, 'Date')) {
      report('clock', node, 'Date()');
    } else if (ts.isCallExpression(node) && named(node.expression, 'createRng') && node.arguments.length === 0) {
      // createRng's seed defaults to the clock (Date.now()).
      report('random', node, 'createRng() without a seed (it seeds itself from the clock)');
    } else if (!colorsAllowed && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node))) {
      // Import and export specifiers are module names, never colors.
      const inModuleName = ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent) || ts.isExternalModuleReference(node.parent);
      const color = inModuleName ? undefined : (HEX.exec(node.text) ?? COLOR_FN.exec(node.text))?.[0];
      if (color) report('color', node, color.startsWith('#') ? `"${color}"` : `"${color.replace(/\s*\($/, '')}(...)"`);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return issues;
}

/** The issues of every code file in a project's `src/` and `sheets/` (never `game/`), by path and line. */
export function lintProject(projectDir: string): LintIssue[] {
  const issues: LintIssue[] = [];
  for (const place of [LAYOUT.src, LAYOUT.sheets]) {
    for (const rel of walkFiles(join(projectDir, place))) {
      if (!/\.(ts|tsx|js|mjs)$/.test(rel) || rel.endsWith('.d.ts')) continue;
      issues.push(...lintSource(`${place}/${rel}`, readFileSync(join(projectDir, place, rel), 'utf8')));
    }
  }
  return issues;
}
