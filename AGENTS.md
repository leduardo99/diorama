# Working on Diorama with a coding agent

Diorama makes 2.5D game assets as code: AI coding agents write TypeScript, and the engine renders characters, scenery, effects, item icons and HUD pieces as sprite sheets that any kind of 2.5D game can load. This file says how to work in this repository, for agents and for the people who drive them. [CONTRIBUTING.md](CONTRIBUTING.md) has the same rules for humans.

## Two kinds of work

- **Making assets in a project** (`projects/<name>/`, yours, not versioned). Follow the skills in [.agents/skills/](.agents/skills/). Start with `diorama-setup` and `diorama`, then `diorama-volume` or `diorama-rig` for the asset at hand. Check your work with `npm run check -- <project>`, `npm run inspect` and contact sheets. Nothing here goes through a pull request.
- **Changing Diorama itself**: the engine (`core/`), the packages (`packages/`), the commands (`tools/`), the viewer (`viewer/`), the sample (`examples/soulkeeper/`), the docs. Use the workflow below.

## Read before you write

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): what every folder is for, the dependency rules and the project layout rules. The tests enforce them.
- The guide or README of the area you touch: [docs/guides/](docs/guides/README.md), [core/draw/README.md](core/draw/README.md), [packages/runtime/README.md](packages/runtime/README.md), [packages/phaser/README.md](packages/phaser/README.md), and for the viewer [viewer/AGENTS.md](viewer/AGENTS.md), which has its own conventions.
- The issue you are working on, with its comments.

## The workflow

1. **Start from an issue.** Pick one from the [roadmap board](https://github.com/users/leduardo99/projects/1) (the Next column, or the [good first issue](https://github.com/leduardo99/diorama/labels/good%20first%20issue) label) and say in a comment that you are taking it. If there is no issue, open one with the task template, so the change has a "Done when" before code exists.
2. **Branch from `main`.** Name it `<type>/<topic>`, where type is `feat`, `fix`, `docs`, `perf`, `refactor`, `test` or `chore` (for example `fix/inspector-data-values`). Never commit to `main`: it is protected.
3. **Change one thing.**
   - Keep the change to the issue.
   - Tests and docs move with the code, and snippets in guides must compile.
   - Every viewer string goes through `t()` with its key in both `en.ts` and `pt-BR.ts`.
   - Assets stay deterministic: `createRng`, theme tokens, no `Math.random`, no clock.
   - Match the style of the code around you.
4. **Run the checks for what you touched**, and keep their output for the pull request:

   | You touched | Run |
   | :--- | :--- |
   | Anything | `npx tsc --noEmit -p .`, `npx tsc --noEmit -p viewer`, `npm test` |
   | `core/`, `tools/export.ts`, the runner, or `examples/soulkeeper/` | The export proof below |
   | The sample's files | `npm run check -- examples/soulkeeper --strict`, after an export |
   | The viewer's interface | Look at it in `npm run view`, in English and Portuguese, and put screenshots in the pull request |
   | `packages/phaser` | `npm run test:phaser`, and the test bench at `/packages/phaser/demo/` |
   | A public API or its doc comments | `npm run docs:api`, and commit the regenerated `docs/api/` |
   | Docs | `npm run test:docs` (links, paths, snippets) |

   **The export proof.** A change must not alter generated images unless that is its point:
   1. On `main`, before your change, run `npm run example`, then `npm run compare-exports -- --save`.
   2. On your branch, run `npm run example`, then `npm run compare-exports`.
   3. It must say "The exports are unchanged." If your change alters images on purpose, say which and why in the pull request.

   Use a full export for the proof (about 45 seconds), not `--changed`: an engine change makes no sheet look out of date. While you work, `npm run export -- <project> --changed` re-exports only what your edits touched.
5. **Open a pull request** with the template:
   - what changed and why, with `Closes #<issue>`;
   - the checks you ran and their result;
   - screenshots for interface changes;
   - whether an agent wrote it. A `Co-Authored-By:` line naming the agent is the usual way.
6. **CI** (`.github/workflows/ci.yml`) runs both type checks and every test suite. A pull request merges only when CI passes and its branch is up to date with `main`. The maintainer reviews it, sometimes with a review agent, and squash-merges it with a subject in the repository's style.

## Rules that do not bend

- No direct pushes to `main`, no force pushes, no rewriting shared history.
- Generated images do not change by accident: see the export proof above.
- Never edit what a command writes:
  - `docs/api/` comes from `npm run docs:api`;
  - generated sheets come from `gear-items`, `scenery-items`, `vfx-items` and `item-icons`;
  - `assets/` comes from the export.
- Diorama is for any kind of 2.5D game. Name engine features as generic capabilities, never as one genre's feature. Soulkeeper is a sample that proves the tool works, not the limit of what it makes.
- No secrets, tokens or personal data in code, tests, commits or issues.

## For the agent

- Verify before you claim. Say what you ran and what it printed, and what you could not check.
- When something is ambiguous, ask in the issue rather than guess wide.
- Stay in scope. A problem you find on the way becomes a new issue, not part of this pull request.
