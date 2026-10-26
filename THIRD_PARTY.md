# Third-party components

Diorama is released under the MIT License ([LICENSE](LICENSE)). It uses the components below, each under its own license. Versions are the ones installed from `package-lock.json`, and licenses are read from each package's `package.json`. Transitive dependencies are listed in `package-lock.json`.

## Dependencies

Direct dependencies of the exporter, the CLI and the viewer (`dependencies` in `package.json`).

| Package | Version | License |
| :--- | :--- | :--- |
| @base-ui/react | 1.9.0 | MIT |
| @dnd-kit/core | 6.3.1 | MIT |
| @dnd-kit/modifiers | 9.0.0 | MIT |
| @dnd-kit/sortable | 10.0.0 | MIT |
| @dnd-kit/utilities | 3.2.2 | MIT |
| @ebay/nice-modal-react | 1.2.13 | MIT |
| @floating-ui/react-dom | 2.1.9 | MIT |
| @fontsource-variable/inter | 5.3.0 | OFL-1.1 |
| @tailwindcss/vite | 4.3.3 | MIT |
| @tanstack/react-query | 5.104.5 | MIT |
| @tanstack/react-router | 1.170.45 | MIT |
| @tanstack/react-store | 0.11.2 | MIT |
| @tanstack/react-table | 9.3.1 | MIT |
| @tanstack/react-virtual | 3.14.21 | MIT |
| class-variance-authority | 0.7.1 | Apache-2.0 |
| cmdk | 1.1.1 | MIT |
| cn | 0.5.0 | MIT |
| lucide-react | 1.61.0 | ISC |
| paper | 0.12.18 | MIT |
| picocolors | 1.1.1 | ISC |
| playwright | 1.63.0 | Apache-2.0 |
| radix-ui | 1.8.1 | MIT |
| react | 19.3.1 | MIT |
| react-dom | 19.3.1 | MIT |
| react-resizable-panels | 4.14.5 | MIT |
| simplex-noise | 4.0.3 | MIT |
| sonner | 2.0.8 | MIT |
| tailwindcss | 4.3.3 | MIT |
| tw-animate-css | 1.4.0 | MIT |
| zod | 4.6.7 | MIT |

## Development dependencies

Direct dependencies used to build, type check and run the project (`devDependencies` in `package.json`).

| Package | Version | License |
| :--- | :--- | :--- |
| @tanstack/intent | 0.5.6 | MIT |
| @tanstack/router-plugin | 1.168.47 | MIT |
| @types/node | 22.20.1 | MIT |
| @types/react | 19.3.0 | MIT |
| @types/react-dom | 19.3.0 | MIT |
| @vitejs/plugin-react | 5.2.0 | MIT |
| phaser | 4.2.1 | MIT |
| tsx | 4.23.13 | MIT |
| typescript | 5.9.3 | Apache-2.0 |
| vite | 6.4.5 | MIT |

## Files copied into the repository

Third-party files kept in the source tree, each with a comment naming its origin and license.

| File | Source | License |
| :--- | :--- | :--- |
| `viewer/src/styles/shadcn-tailwind.css` | `shadcn` npm package 4.22.1, `dist/tailwind.css` (shadcn/ui, `shadcn-ui/ui` on GitHub), unmodified | MIT |
| `viewer/src/components/ui/scroller.tsx` | Dice UI's `scroller` registry item for `radix-mira` (`sadmann7/diceui` on GitHub), added with `npx shadcn@4.22.1 add https://diceui.com/r/radix-mira/scroller.json`; the changes are marked `Diorama:` | MIT |
| `viewer/src/components/ui/compare-slider.tsx`, `viewer/src/hooks/use-value-as-ref.ts`, `viewer/src/hooks/use-ref-with-init.ts` | Dice UI's `compare-slider` registry item for `radix-mira` and the two hooks it brings (`sadmann7/diceui` on GitHub), added with `npx shadcn@4.22.1 add https://diceui.com/r/radix-mira/compare-slider.json`; the changes are marked `Diorama:` | MIT |
| `viewer/src/components/ui/color-swatch.tsx` | Dice UI's `color-swatch` registry item for `radix-mira` (`sadmann7/diceui` on GitHub), added with `npx shadcn@4.22.1 add https://diceui.com/r/radix-mira/color-swatch.json`; the changes are marked `Diorama:` | MIT |
| `viewer/src/components/ui/tour.tsx` | Dice UI's `tour` registry item for `radix-mira` (`sadmann7/diceui` on GitHub), added with `npx shadcn@4.22.1 add https://diceui.com/r/radix-mira/tour.json` (it uses the `use-value-as-ref` and `use-ref-with-init` hooks `compare-slider` brought); the changes are marked `Diorama:` | MIT |
| `viewer/src/components/ui/sortable.tsx` | Dice UI's `sortable` registry item for `radix-mira` (`sadmann7/diceui` on GitHub), added with `npx shadcn@4.22.1 add https://diceui.com/r/radix-mira/sortable.json`; the changes are marked `Diorama:` | MIT |

The shadcn CLI that adds components to the viewer is not a dependency: it is run with `npx` when needed (see `viewer/AGENTS.md`).

## Agent skills

Third-party skills for coding agents, kept in `.claude/skills/` and used when working on the viewer.

| Skill | Folder | Source | License |
| :--- | :--- | :--- | :--- |
| React best practices | `.claude/skills/react-best-practices` | Vercel (`vercel-labs/agent-skills`) | MIT |
| shadcn/ui | `.claude/skills/shadcn` | shadcn/ui (`shadcn/ui` on GitHub) | MIT |

## Fonts

The viewer's typeface is Inter, distributed by `@fontsource-variable/inter` 5.3.0. Inter is licensed under the SIL Open Font License 1.1 (OFL-1.1): <https://openfontlicense.org/>.

## Not part of this repository

Headless Chromium, used to rasterize the assets, is downloaded by `npx playwright install chromium` and is not distributed with Diorama.
