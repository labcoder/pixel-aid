# @pixelaid/http

`@pixelaid/http` provides a localhost-only HTTP-style automation layer over `@pixelaid/automation`. It includes a request handler, in-memory job store, progress snapshots, cancellation, and a small Node server factory.

## Status

Implemented as a private workspace package and tested as a local handler/server layer. It is WIP as a product surface: there is no root script, no published binary, no auth model, and no release packaging yet. Use it for development experiments and future local API work, not as a public service.

## Commands

From the repo root:

```sh
npm run test -w @pixelaid/http
npm run build -w @pixelaid/http
npm run typecheck -w @pixelaid/http
```

From `packages/http`:

```sh
npm run test
npm run build
npm run typecheck
```

## Endpoints

The handler understands these routes:

- `GET /health`
- `GET /v1/status`
- `POST /v1/jobs/inspect`
- `POST /v1/jobs/fix`
- `POST /v1/jobs/export`
- `GET /v1/jobs/:id`
- `DELETE /v1/jobs/:id`
- `POST /v1/jobs/:id/cancel`

Job requests use JSON bodies with local file paths. Fix requests can target either a single sprite output or a sheet output directory depending on the body fields.

Single-sprite fix requests may set `options.gridStrategy` to `robust` and `options.robustSafety` to `guarded`, `warn`, or `off`. Robust Preview remains opt-in; Classic is used when the strategy is omitted. Selection diagnostics stay in the operation result, and fallback or warning messages are copied to the completed job's `warnings` array.

## Programmatic Usage

```ts
import { createPixelAidHttpServer } from "@pixelaid/http";

const api = createPixelAidHttpServer({ host: "127.0.0.1", port: 0 });
const address = await api.listen();
console.log(address);
```

`createPixelAidHttpServer` only accepts localhost hosts: `127.0.0.1`, `localhost`, `::1`, or `[::1]`.

## Development Notes

- Keep the default server localhost-only until the project has a security model for remote access.
- Keep request parsing strict and JSON-only.
- Keep long-running operation state in the job store, not in global module state.
- Add tests for route changes, job lifecycle changes, cancellation, and response envelopes.

## Verification

Run the HTTP tests after changing routes, job status, cancellation, server binding, or response formats:

```sh
npm run test -w @pixelaid/http
```
