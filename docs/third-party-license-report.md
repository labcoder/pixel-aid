# Third-Party License Report

Generated from `package-lock.json` by `npm run license:report`.

## Policy Summary

- Allowed packages: 203
- Review-required packages: 13
- Blocked packages: 0
- Unknown-license packages: 0

Review-required licenses are not automatically forbidden, but they must be documented before release. Blocked or unknown licenses fail `npm run license:check`.

## Review Notes

- `MPL-2.0` packages are file-level copyleft and require attribution/source availability for modified MPL files. Current use is through development/build tooling, not PixelAid runtime algorithm code.
- `BlueOak-1.0.0` is permissive but less common than MIT/Apache/BSD/ISC, so it remains review-required for launch.
- This report covers npm packages in the current lockfile. Rust/Tauri crate notices should be generated separately before signed desktop release artifacts.

## Packages Requiring Review

- lightningcss@1.32.0: MPL-2.0
- lightningcss-android-arm64@1.32.0: MPL-2.0
- lightningcss-darwin-arm64@1.32.0: MPL-2.0
- lightningcss-darwin-x64@1.32.0: MPL-2.0
- lightningcss-freebsd-x64@1.32.0: MPL-2.0
- lightningcss-linux-arm-gnueabihf@1.32.0: MPL-2.0
- lightningcss-linux-arm64-gnu@1.32.0: MPL-2.0
- lightningcss-linux-arm64-musl@1.32.0: MPL-2.0
- lightningcss-linux-x64-gnu@1.32.0: MPL-2.0
- lightningcss-linux-x64-musl@1.32.0: MPL-2.0
- lightningcss-win32-arm64-msvc@1.32.0: MPL-2.0
- lightningcss-win32-x64-msvc@1.32.0: MPL-2.0
- minimatch@10.2.5: BlueOak-1.0.0

## Blocked Or Unknown Packages

None.

## Package Table

| Package | Version | License | Status |
| --- | --- | --- | --- |
| @emnapi/core | 1.10.0 | MIT | allowed |
| @emnapi/runtime | 1.10.0 | MIT | allowed |
| @emnapi/wasi-threads | 1.2.1 | MIT | allowed |
| @esbuild/aix-ppc64 | 0.28.0 | MIT | allowed |
| @esbuild/android-arm | 0.28.0 | MIT | allowed |
| @esbuild/android-arm64 | 0.28.0 | MIT | allowed |
| @esbuild/android-x64 | 0.28.0 | MIT | allowed |
| @esbuild/darwin-arm64 | 0.28.0 | MIT | allowed |
| @esbuild/darwin-x64 | 0.28.0 | MIT | allowed |
| @esbuild/freebsd-arm64 | 0.28.0 | MIT | allowed |
| @esbuild/freebsd-x64 | 0.28.0 | MIT | allowed |
| @esbuild/linux-arm | 0.28.0 | MIT | allowed |
| @esbuild/linux-arm64 | 0.28.0 | MIT | allowed |
| @esbuild/linux-ia32 | 0.28.0 | MIT | allowed |
| @esbuild/linux-loong64 | 0.28.0 | MIT | allowed |
| @esbuild/linux-mips64el | 0.28.0 | MIT | allowed |
| @esbuild/linux-ppc64 | 0.28.0 | MIT | allowed |
| @esbuild/linux-riscv64 | 0.28.0 | MIT | allowed |
| @esbuild/linux-s390x | 0.28.0 | MIT | allowed |
| @esbuild/linux-x64 | 0.28.0 | MIT | allowed |
| @esbuild/netbsd-arm64 | 0.28.0 | MIT | allowed |
| @esbuild/netbsd-x64 | 0.28.0 | MIT | allowed |
| @esbuild/openbsd-arm64 | 0.28.0 | MIT | allowed |
| @esbuild/openbsd-x64 | 0.28.0 | MIT | allowed |
| @esbuild/openharmony-arm64 | 0.28.0 | MIT | allowed |
| @esbuild/sunos-x64 | 0.28.0 | MIT | allowed |
| @esbuild/win32-arm64 | 0.28.0 | MIT | allowed |
| @esbuild/win32-ia32 | 0.28.0 | MIT | allowed |
| @esbuild/win32-x64 | 0.28.0 | MIT | allowed |
| @eslint-community/eslint-utils | 3.4.3 | Apache-2.0 | allowed |
| @eslint-community/eslint-utils | 4.9.1 | MIT | allowed |
| @eslint-community/regexpp | 4.12.2 | MIT | allowed |
| @eslint/config-array | 0.23.5 | Apache-2.0 | allowed |
| @eslint/config-helpers | 0.5.5 | Apache-2.0 | allowed |
| @eslint/core | 1.2.1 | Apache-2.0 | allowed |
| @eslint/js | 10.0.1 | MIT | allowed |
| @eslint/object-schema | 3.0.5 | Apache-2.0 | allowed |
| @eslint/plugin-kit | 0.7.1 | Apache-2.0 | allowed |
| @humanfs/core | 0.19.2 | Apache-2.0 | allowed |
| @humanfs/node | 0.16.8 | Apache-2.0 | allowed |
| @humanfs/types | 0.15.0 | Apache-2.0 | allowed |
| @humanwhocodes/module-importer | 1.0.1 | Apache-2.0 | allowed |
| @humanwhocodes/retry | 0.4.3 | Apache-2.0 | allowed |
| @jridgewell/sourcemap-codec | 1.5.5 | MIT | allowed |
| @napi-rs/wasm-runtime | 1.1.4 | MIT | allowed |
| @oxc-project/types | 0.127.0 | MIT | allowed |
| @rolldown/binding-android-arm64 | 1.0.0-rc.17 | MIT | allowed |
| @rolldown/binding-darwin-arm64 | 1.0.0-rc.17 | MIT | allowed |
| @rolldown/binding-darwin-x64 | 1.0.0-rc.17 | MIT | allowed |
| @rolldown/binding-freebsd-x64 | 1.0.0-rc.17 | MIT | allowed |
| @rolldown/binding-linux-arm-gnueabihf | 1.0.0-rc.17 | MIT | allowed |
| @rolldown/binding-linux-arm64-gnu | 1.0.0-rc.17 | MIT | allowed |
| @rolldown/binding-linux-arm64-musl | 1.0.0-rc.17 | MIT | allowed |
| @rolldown/binding-linux-ppc64-gnu | 1.0.0-rc.17 | MIT | allowed |
| @rolldown/binding-linux-s390x-gnu | 1.0.0-rc.17 | MIT | allowed |
| @rolldown/binding-linux-x64-gnu | 1.0.0-rc.17 | MIT | allowed |
| @rolldown/binding-linux-x64-musl | 1.0.0-rc.17 | MIT | allowed |
| @rolldown/binding-openharmony-arm64 | 1.0.0-rc.17 | MIT | allowed |
| @rolldown/binding-wasm32-wasi | 1.0.0-rc.17 | MIT | allowed |
| @rolldown/binding-win32-arm64-msvc | 1.0.0-rc.17 | MIT | allowed |
| @rolldown/binding-win32-x64-msvc | 1.0.0-rc.17 | MIT | allowed |
| @rolldown/pluginutils | 1.0.0-rc.7 | MIT | allowed |
| @standard-schema/spec | 1.1.0 | MIT | allowed |
| @tauri-apps/api | 2.10.1 | Apache-2.0 OR MIT | allowed |
| @tauri-apps/cli | 2.10.1 | Apache-2.0 OR MIT | allowed |
| @tauri-apps/cli-darwin-arm64 | 2.10.1 | Apache-2.0 OR MIT | allowed |
| @tauri-apps/cli-darwin-x64 | 2.10.1 | Apache-2.0 OR MIT | allowed |
| @tauri-apps/cli-linux-arm-gnueabihf | 2.10.1 | Apache-2.0 OR MIT | allowed |
| @tauri-apps/cli-linux-arm64-gnu | 2.10.1 | Apache-2.0 OR MIT | allowed |
| @tauri-apps/cli-linux-arm64-musl | 2.10.1 | Apache-2.0 OR MIT | allowed |
| @tauri-apps/cli-linux-riscv64-gnu | 2.10.1 | Apache-2.0 OR MIT | allowed |
| @tauri-apps/cli-linux-x64-gnu | 2.10.1 | Apache-2.0 OR MIT | allowed |
| @tauri-apps/cli-linux-x64-musl | 2.10.1 | Apache-2.0 OR MIT | allowed |
| @tauri-apps/cli-win32-arm64-msvc | 2.10.1 | Apache-2.0 OR MIT | allowed |
| @tauri-apps/cli-win32-ia32-msvc | 2.10.1 | Apache-2.0 OR MIT | allowed |
| @tauri-apps/cli-win32-x64-msvc | 2.10.1 | Apache-2.0 OR MIT | allowed |
| @tauri-apps/plugin-dialog | 2.7.0 | MIT OR Apache-2.0 | allowed |
| @tauri-apps/plugin-fs | 2.5.0 | MIT OR Apache-2.0 | allowed |
| @tybys/wasm-util | 0.10.1 | MIT | allowed |
| @types/chai | 5.2.3 | MIT | allowed |
| @types/deep-eql | 4.0.2 | MIT | allowed |
| @types/esrecurse | 4.3.1 | MIT | allowed |
| @types/estree | 1.0.8 | MIT | allowed |
| @types/json-schema | 7.0.15 | MIT | allowed |
| @types/node | 25.6.0 | MIT | allowed |
| @types/pngjs | 6.0.5 | MIT | allowed |
| @types/react | 19.2.14 | MIT | allowed |
| @types/react-dom | 19.2.3 | MIT | allowed |
| @typescript-eslint/eslint-plugin | 7.0.5 | MIT | allowed |
| @typescript-eslint/eslint-plugin | 8.59.0 | MIT | allowed |
| @typescript-eslint/parser | 8.59.0 | MIT | allowed |
| @typescript-eslint/project-service | 8.59.0 | MIT | allowed |
| @typescript-eslint/scope-manager | 8.59.0 | MIT | allowed |
| @typescript-eslint/tsconfig-utils | 8.59.0 | MIT | allowed |
| @typescript-eslint/type-utils | 8.59.0 | MIT | allowed |
| @typescript-eslint/types | 8.59.0 | MIT | allowed |
| @typescript-eslint/typescript-estree | 8.59.0 | MIT | allowed |
| @typescript-eslint/utils | 8.59.0 | MIT | allowed |
| @typescript-eslint/visitor-keys | 8.59.0 | MIT | allowed |
| @vitejs/plugin-react | 6.0.1 | MIT | allowed |
| @vitest/expect | 4.1.5 | MIT | allowed |
| @vitest/mocker | 4.1.5 | MIT | allowed |
| @vitest/pretty-format | 4.1.5 | MIT | allowed |
| @vitest/runner | 4.1.5 | MIT | allowed |
| @vitest/snapshot | 4.1.5 | MIT | allowed |
| @vitest/spy | 4.1.5 | MIT | allowed |
| @vitest/utils | 4.1.5 | MIT | allowed |
| acorn | 8.16.0 | MIT | allowed |
| acorn-jsx | 5.3.2 | MIT | allowed |
| ajv | 6.15.0 | MIT | allowed |
| assertion-error | 2.0.1 | MIT | allowed |
| balanced-match | 4.0.4 | MIT | allowed |
| brace-expansion | 5.0.5 | MIT | allowed |
| chai | 6.2.2 | MIT | allowed |
| convert-source-map | 2.0.0 | MIT | allowed |
| cross-spawn | 7.0.6 | MIT | allowed |
| csstype | 3.2.3 | MIT | allowed |
| debug | 4.4.3 | MIT | allowed |
| deep-is | 0.1.4 | MIT | allowed |
| detect-libc | 2.1.2 | Apache-2.0 | allowed |
| es-module-lexer | 2.0.0 | MIT | allowed |
| esbuild | 0.28.0 | MIT | allowed |
| escape-string-regexp | 4.0.0 | MIT | allowed |
| eslint | 10.2.1 | MIT | allowed |
| eslint-scope | 9.1.2 | BSD-2-Clause | allowed |
| eslint-visitor-keys | 5.0.1 | Apache-2.0 | allowed |
| espree | 11.2.0 | BSD-2-Clause | allowed |
| esquery | 1.7.0 | BSD-3-Clause | allowed |
| esrecurse | 4.3.0 | BSD-2-Clause | allowed |
| estraverse | 5.3.0 | BSD-2-Clause | allowed |
| estree-walker | 3.0.3 | MIT | allowed |
| esutils | 2.0.3 | BSD-2-Clause | allowed |
| expect-type | 1.3.0 | Apache-2.0 | allowed |
| fast-deep-equal | 3.1.3 | MIT | allowed |
| fast-json-stable-stringify | 2.1.0 | MIT | allowed |
| fast-levenshtein | 2.0.6 | MIT | allowed |
| fdir | 6.5.0 | MIT | allowed |
| fflate | 0.8.2 | MIT | allowed |
| file-entry-cache | 8.0.0 | MIT | allowed |
| find-up | 5.0.0 | MIT | allowed |
| flat-cache | 4.0.1 | MIT | allowed |
| flatted | 3.4.2 | ISC | allowed |
| fsevents | 2.3.3 | MIT | allowed |
| glob-parent | 6.0.2 | ISC | allowed |
| ignore | 5.3.2 | MIT | allowed |
| imurmurhash | 0.1.4 | MIT | allowed |
| is-extglob | 2.1.1 | MIT | allowed |
| is-glob | 4.0.3 | MIT | allowed |
| isexe | 2.0.0 | ISC | allowed |
| jpeg-js | 0.4.4 | BSD-3-Clause | allowed |
| json-buffer | 3.0.1 | MIT | allowed |
| json-schema-traverse | 0.4.1 | MIT | allowed |
| json-stable-stringify-without-jsonify | 1.0.1 | MIT | allowed |
| keyv | 4.5.4 | MIT | allowed |
| levn | 0.4.1 | MIT | allowed |
| lightningcss | 1.32.0 | MPL-2.0 | review |
| lightningcss-android-arm64 | 1.32.0 | MPL-2.0 | review |
| lightningcss-darwin-arm64 | 1.32.0 | MPL-2.0 | review |
| lightningcss-darwin-x64 | 1.32.0 | MPL-2.0 | review |
| lightningcss-freebsd-x64 | 1.32.0 | MPL-2.0 | review |
| lightningcss-linux-arm-gnueabihf | 1.32.0 | MPL-2.0 | review |
| lightningcss-linux-arm64-gnu | 1.32.0 | MPL-2.0 | review |
| lightningcss-linux-arm64-musl | 1.32.0 | MPL-2.0 | review |
| lightningcss-linux-x64-gnu | 1.32.0 | MPL-2.0 | review |
| lightningcss-linux-x64-musl | 1.32.0 | MPL-2.0 | review |
| lightningcss-win32-arm64-msvc | 1.32.0 | MPL-2.0 | review |
| lightningcss-win32-x64-msvc | 1.32.0 | MPL-2.0 | review |
| locate-path | 6.0.0 | MIT | allowed |
| lucide-react | 1.11.0 | ISC | allowed |
| magic-string | 0.30.21 | MIT | allowed |
| minimatch | 10.2.5 | BlueOak-1.0.0 | review |
| ms | 2.1.3 | MIT | allowed |
| nanoid | 3.3.11 | MIT | allowed |
| natural-compare | 1.4.0 | MIT | allowed |
| obug | 2.1.1 | MIT | allowed |
| optionator | 0.9.4 | MIT | allowed |
| p-limit | 3.1.0 | MIT | allowed |
| p-locate | 5.0.0 | MIT | allowed |
| path-exists | 4.0.0 | MIT | allowed |
| path-key | 3.1.1 | MIT | allowed |
| pathe | 2.0.3 | MIT | allowed |
| picocolors | 1.1.1 | ISC | allowed |
| picomatch | 4.0.4 | MIT | allowed |
| pngjs | 7.0.0 | MIT | allowed |
| postcss | 8.5.10 | MIT | allowed |
| prelude-ls | 1.2.1 | MIT | allowed |
| punycode | 2.3.1 | MIT | allowed |
| react | 19.2.5 | MIT | allowed |
| react-dom | 19.2.5 | MIT | allowed |
| rolldown | 1.0.0-rc.17 | MIT | allowed |
| rolldown | 1.0.0-rc.17 | MIT | allowed |
| scheduler | 0.27.0 | MIT | allowed |
| semver | 7.7.4 | ISC | allowed |
| shebang-command | 2.0.0 | MIT | allowed |
| shebang-regex | 3.0.0 | MIT | allowed |
| siginfo | 2.0.0 | ISC | allowed |
| source-map-js | 1.2.1 | BSD-3-Clause | allowed |
| stackback | 0.0.2 | MIT | allowed |
| std-env | 4.1.0 | MIT | allowed |
| tinybench | 2.9.0 | MIT | allowed |
| tinyexec | 1.1.1 | MIT | allowed |
| tinyglobby | 0.2.16 | MIT | allowed |
| tinyrainbow | 3.1.0 | MIT | allowed |
| ts-api-utils | 2.5.0 | MIT | allowed |
| tslib | 2.8.1 | 0BSD | allowed |
| type-check | 0.4.0 | MIT | allowed |
| typescript | 6.0.3 | Apache-2.0 | allowed |
| typescript-eslint | 8.59.0 | MIT | allowed |
| undici-types | 7.19.2 | MIT | allowed |
| uri-js | 4.4.1 | BSD-2-Clause | allowed |
| vite | 8.0.10 | MIT | allowed |
| vitest | 4.1.5 | MIT | allowed |
| which | 2.0.2 | ISC | allowed |
| why-is-node-running | 2.3.0 | MIT | allowed |
| word-wrap | 1.2.5 | MIT | allowed |
| yocto-queue | 0.1.0 | MIT | allowed |
