# Third-Party Notices

This file tracks release-facing direct dependencies used by PixelAid. A generated npm lockfile report is available in `docs/third-party-license-report.md` and can be refreshed with `npm run license:report`.

PixelAid source code is licensed under `AGPL-3.0-only`. Third-party dependencies remain under their own licenses.

| Package | Version | License | Use |
| --- | --- | --- | --- |
| React | 19.2.5 | MIT | Runtime UI |
| React DOM | 19.2.5 | MIT | Runtime browser rendering |
| lucide-react | 1.11.0 | ISC | Runtime editor icons |
| fflate | 0.8.2 | MIT | Runtime ZIP export |
| pngjs | 7.0.0 | MIT | Node CLI/MCP PNG decode and encode |
| Vite | 8.0.10 | MIT | Build/dev server |
| @vitejs/plugin-react | 6.0.1 | MIT | Build React transform |
| TypeScript | 6.0.3 | Apache-2.0 | Compiler |
| Vitest | 4.1.5 | MIT | Tests |
| ESLint | 10.2.1 | MIT | Linting |
| typescript-eslint | 8.59.0 | MIT | TypeScript lint rules |
| @eslint/js | 10.0.1 | MIT | ESLint JavaScript rules |
| @types/node | 25.6.0 | MIT | Node type definitions for automation packages |
| @types/pngjs | 6.0.5 | MIT | PNG library type definitions |
| @types/react | 19.2.14 | MIT | Type definitions |
| @types/react-dom | 19.2.3 | MIT | Type definitions |
| @tauri-apps/cli | 2.10.1 | Apache-2.0 OR MIT | Desktop app build and development CLI |
| @tauri-apps/plugin-dialog | 2.7.0 | MIT OR Apache-2.0 | Runtime native open/save dialogs in desktop builds |
| @tauri-apps/plugin-fs | 2.5.0 | MIT OR Apache-2.0 | Runtime filesystem reads/writes for desktop import/export |
| Tauri Rust crates | 2.x | Apache-2.0 OR MIT | Desktop shell runtime and build support |

## Review Notes

- `npm run license:check` fails on blocked or unknown npm licenses and reports review-required licenses.
- MPL-2.0 npm packages currently appear through development/build tooling and should be reviewed before public release.
- Rust/Tauri crate notices should be generated separately before signed desktop release artifacts.
