---
name: diorama-setup
description: Prepare a Diorama checkout to run the tests, the viewer and asset exports — Node, dependencies, headless Chromium, the type checks and the viewer — and fix a broken environment. Use when the environment is new, when `npm run doctor` fails, or after cloning or copying the repository. To start a project and choose its look, use diorama-style.
---

# Diorama setup

This skill prepares the environment and checks that it works. It is the environment only: for starting a project and its first assets use `diorama-style`, for the production rules `diorama`, for checking what was produced `diorama-review`.

## 1. Check the environment

```bash
npm run doctor
```

It checks the Node.js version, the installed dependencies, the headless Chromium used by the exporter, and `tsconfig.json`. Each failure prints the command that fixes it. Go to the next step only when it prints `Environment is ready.`

## 2. Install

Requires Node.js 22 or newer.

```bash
npm install
npx playwright install chromium
```

`npm install` uses the committed `package-lock.json`. Do not run `npm update` as part of setup, because it changes the locked versions. A git worktree needs its own `npm ci` (see [AGENTS.md](../../../AGENTS.md)): a link to another checkout's `node_modules` shares Vite's cache.

## 3. Verify

Run the checks in this order. Each one must pass before moving on.

```bash
npm test
npx tsc --noEmit -p .
npx tsc --noEmit -p viewer
```

- `npm test` runs every suite under `tests/`: the engine (core, volume, rig and the dependency boundaries of [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md)), the documentation (the snippets of the skills and guides compile, and every link and path they name exists), the runtime (`@diorama/runtime` on synthetic sheets and on frozen conformance data), the Phaser package, the viewer's logic and the commands. The command checks create temporary projects under `projects/`, export them through Chromium, and remove them afterwards (a viewer that is open will show them come and go). A passing run therefore confirms that the exporter and the review commands render.
- The two `tsc` commands report errors from every folder they cover, including `projects/` and `examples/`. Errors in `core/`, `tools/`, `templates/` and `viewer/` mean the setup is broken. Errors in `projects/` are not caused by setup and are not blocking.

## 4. Open the viewer

```bash
npm run view
```

Then open `http://localhost:5173`. On Windows, `dev.bat` starts the same server and opens the browser; on macOS and Linux, `sh dev.sh` does the same. The viewer shows only your projects, those of `projects/`: with none, it opens on a page that offers "New project" and "Try the sample" (`npm run example`, which copies the sample project in and exports it). The `diorama-review` skill explains what to look at.

The viewer always uses port 5173 and fails when it is taken, instead of serving elsewhere. If the user already runs it, do not start a second one and do not stop theirs: `npm run export` reuses a running viewer when it is this checkout's (the server says whose it is at `/__api/server`) and starts a server of its own otherwise. To run a server of your own next to theirs, pick another port: `npx vite --port <free port> --strictPort`.

## Troubleshooting

| Symptom | Cause | Fix |
| :--- | :--- | :--- |
| `doctor` says Chromium is missing | `npx playwright install chromium` was not run, or the browser cache is elsewhere | Run the install command. To use a different browser cache, set `PLAYWRIGHT_BROWSERS_PATH` before installing. |
| `npm run export` fails before writing a file | Chromium is missing | Run `npm run doctor` first, then the install command. The exporter does not need port 5173: it reuses a running viewer or starts its own server. |
| `npm run view` fails because the port is taken | Another viewer (the user's, or another checkout's) runs on 5173 | Use it, or pick another port as above. Do not kill it. |
| `npm test` fails in `tests/docs/docs.test.ts` | A guide or skill has a fenced `ts` block that is too long or does not compile, a link that points nowhere, a backticked path that does not exist, a script that is not in `package.json`, or a name the docs must not use | Fix the block, the link, the path or the name; the message says which file and line. Do not add `docs:allow-long` to hide a block. |
| `npm test` fails in `tests/engine/boundary.test.ts` | An import crosses a boundary of the architecture (for example `volume` importing `rig`, or the viewer reaching into `core/`) | Move the code to the side of the arrow it belongs to; the message names the file and the import. |
| `npm run check -- <project>` fails after the type check | The project breaks a layout rule (a file at the root, an underscore, a sheet with drawing code...) or a determinism rule (`Math.random`, `Date`, a raw `#hex` color outside `src/theme.ts`) | Do what the message says; it names the file (and the line) and where to move it or what to use instead. |
| `npm run export` stops with "type error(s), so nothing was exported" | The project's code does not type check | Fix the errors it lists (`npm run check -- <project>` shows them too). `--force` exports anyway, for experiments only. |
| `npm run docs:api` changes files in `docs/api/` after setup | The API changed in source, and the generated reference was not updated | Commit the regenerated files. They are generated and must not be edited by hand. |

## Rules for this skill

- Do not install packages outside `package.json`. If a package is needed, add it to the file and reinstall.
- Do not edit `package-lock.json` by hand.
- Do not change files in `projects/` while setting up. Setup only reads them.
