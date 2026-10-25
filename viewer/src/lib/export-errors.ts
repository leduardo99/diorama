/**
 * Reading a failed export's output (tools/export.ts) for what the viewer shows.
 *
 * The export runs the project's type check first and refuses on errors, printing
 * "Error: <project> has N type error(s), so nothing was exported:", the errors in tsc's
 * format and "Fix them (npm run check -- <project> ...), or pass --force to export anyway."
 * The viewer cannot pass --force, so the hint is misleading here: the failure text below
 * swaps it for a localized "Fix these type errors to export" line and the error list.
 */

/** The type errors a refused export printed, in tsc's file(line,col) format; null when it failed some other way. */
export function exportTypeErrors(output: string): string[] | null {
  // Colours (when FORCE_COLOR is set) and Windows line ends must not hide the refusal.
  const plain = output.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r\n/g, '\n');
  const block = /has \d+ type error\(s\), so nothing was exported:\n([\s\S]+?)\nFix them \(/.exec(plain);
  if (!block) return null;
  const errors = block[1].split('\n').map(line => line.trim()).filter(Boolean);
  return errors.length ? errors : null;
}

/**
 * What a toast or alert shows for a failed export: the type errors the viewer cannot skip
 * (fixLine, then the file:line list), or the output's last lines like before.
 */
export function exportFailureText(output: string, fixLine: string): string {
  const errors = exportTypeErrors(output);
  return errors ? `${fixLine}\n${errors.join('\n')}` : output.split('\n').slice(-4).join('\n');
}
