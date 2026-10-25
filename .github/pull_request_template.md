<!-- One topic per pull request. See AGENTS.md for the workflow and the checks. -->

## What and why

Closes #

## Checks I ran

- [ ] `npx tsc --noEmit -p .` and `npx tsc --noEmit -p viewer`
- [ ] `npm test`
- [ ] Export proof, if this touches `core/`, the exporter or the sample project in `examples/`: `npm run export:sample`, then `npm run compare-exports` says the exports are unchanged (or the description says which images change and why)
- [ ] Viewer changes seen in `npm run view`, in English and Portuguese (screenshots below)
- [ ] `npm run docs:api` committed, if a public API or its doc comments changed
- [ ] Tests and docs updated with the code

## Screenshots

## Written with an agent?

<!-- Say which, and keep a Co-Authored-By line in the commits. Review what it wrote before asking for review. -->
