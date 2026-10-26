# Projects

Your own projects go here, one folder each. Diorama does not version them: everything in this folder except this README is ignored by its git repository, so a project can be a git repository of its own.

Create one with `npm run new-project -- <name>` (`--style` adds STYLE.md, `--genre <preset>` the space profile). It starts with the layout of [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md):

```
projects/<name>/
├── STYLE.md      art direction (optional)
├── src/          hand-written code: theme.ts, space.ts, characters/, kits; nothing here is exported by itself
├── sheets/       one thin file per exported sheet, importing from src/
├── assets/       exported PNG + atlas JSON, mirroring sheets/ (generated)
└── review/       contact sheets, scenery tests, mockups (scratch, ignored by the project's .gitignore)
```

The viewer shows the projects of this folder, and only these. Commands find a project by name here first, then in `examples/`, so a project here hides an example of the same name for them (`examples/<name>` still names the sample). `npm run check -- <name>` type-checks it, checks its layout and that it is deterministic (no `Math.random`, no clock, no raw colors outside `src/theme.ts`); `npm run export` type-checks it first too, and exports nothing while it has a type error.

The sample project in `examples/` shows this layout at work. `npm run example` copies it here, to `projects/<name>` (everything but `review/`), and exports it, so the viewer shows it and saves into the copy; the sample in `examples/` stays as it ships. Run again, it keeps your copy and exports only what changed; `npm run example -- --force` replaces the copy with a fresh one and moves yours to the viewer's trash (`.diorama-trash/projects/<id>/<name>`): to get it back, move the fresh copy out of the way first, then move yours back to `projects/<name>` (the command prints both steps). The copy is made in a hidden folder here and renamed into place when it is whole, and while a run goes on it holds `projects/.example.lock`, so a second run refuses.
