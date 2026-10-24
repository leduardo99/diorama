# Contributing to Diorama

Thanks for helping. Diorama is small and young, so every issue, idea and pull request counts.

Working with a coding agent (Claude Code, Codex, Cursor or another)? [AGENTS.md](AGENTS.md) is the workflow it follows here, step by step, with the checks for each kind of change. The rules below are the same, in short.

## Where things are decided

- **Roadmap:** the [Diorama roadmap](https://github.com/users/leduardo99/projects/1) board shows what is next, what is in progress and the ideas waiting for a decision.
- **Ideas and questions:** [Discussions](https://github.com/leduardo99/diorama/discussions). An idea that the maintainer picks up becomes an issue on the board.
- **Bugs:** an issue with what you ran, what you expected and what you got (a screenshot or the sheet helps).
- **First contribution:** look for the [good first issue](https://github.com/leduardo99/diorama/labels/good%20first%20issue) label.

## Set up

```bash
npm install
npx playwright install chromium
npm run doctor
npm test
```

`npm run example` exports Soulkeeper, the sample game (`examples/soulkeeper`, about five minutes), so the viewer (`npm run view`) has something to show.

## Rules that keep the project healthy

- **Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first.** Every folder has one job, and `npm run check -- <project>` enforces the project layout.
- **Generations must not change by accident.** A change to the engine, the exporter or the sample must leave the sample's exported images pixel-identical, unless changing them is the point. Before the change, run `npm run example` and `npm run compare-exports -- --save`. After it, run `npm run example` and `npm run compare-exports`.
- **Tests and docs move with the code.** `npm test` must pass; a new feature comes with its test and with the guide or skill that explains it. Snippets in guides compile (`npm run test:docs`).
- **The viewer is bilingual.** Every interface string goes through `t()` with its key in both `viewer/src/i18n/en.ts` and `pt-BR.ts`.
- **Determinism.** Assets use the seeded random (`createRng`) and theme tokens, never `Math.random`, dates or raw colors.

## Pull requests

- One topic per pull request, with a short description of what changed and how you checked it. The pull request template lists the checks.
- Start from an issue. If there is none, open one with the task template, so the change has a "done when" first.
- Reference the issue (`Closes #12`).
- `main` is protected: every change lands through a pull request, and a pull request merges only when CI passes.
  - CI (`.github/workflows/ci.yml`) runs both type checks and `npm test` on every pull request.
  - Run `npm test` before you push.
  - The sample's export is not part of CI. If your change can touch generated images, run the export proof above.
- Pull requests are squash-merged, with a subject in the repository's style.
- Contributions written with AI coding agents are welcome: Diorama is built that way. Review what the agent wrote, run the checks, and say so in the description (a `Co-Authored-By` line is a good way).

By contributing you agree that your work is released under the [MIT license](LICENSE).
