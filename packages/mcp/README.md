# @pixelaid/mcp

`@pixelaid/mcp` exposes PixelAid automation through MCP tool definitions, direct tool handlers, JSON-RPC request handling, and a bundled stdio server.

## Status

Implemented for local MCP client integration and automated tests. The package is private and not externally published yet. The stdio server is available after building the package or through the root `npm run mcp:serve` command.

The server uses local file paths supplied by the MCP client. It does not open a network port, call AI providers, or request broad filesystem access on its own.

## Commands

From the repo root:

```sh
npm run mcp:serve
npm run build -w @pixelaid/mcp
npm run test -w @pixelaid/mcp
npm run typecheck -w @pixelaid/mcp
```

From `packages/mcp`:

```sh
npm run build
npm run test
npm run typecheck
```

## Local Usage

Start the stdio server through the root script:

```sh
npm run mcp:serve
```

Or build and run the server directly:

```sh
npm run build -w @pixelaid/mcp
node packages/mcp/dist/server.cjs
```

Configure an MCP client to launch that command from a trusted local checkout. The server reads content-length-framed JSON-RPC messages from stdin and writes JSON-RPC responses to stdout.

## Tools

- `inspect_image`
- `quality_report`
- `suggest_fix_settings`
- `fix_sprite`
- `fix_sprite_sheet`
- `detect_sprite_sheet`
- `extract_palette`
- `export_engine_bundle`

The package also exports `pixelaidMcpTools`, `validateToolInput`, `handlePixelAidTool`, and `handlePixelAidMcpRequest` for direct tests or embedded integrations.

`fix_sprite` accepts the same two-stage reconstruction and packaging options as the CLI. Set `options.gridStrategy` to `robust` to opt into Robust Preview and optionally set `options.robustSafety` to `guarded`, `warn`, or `off`; Classic remains the default. Fallback and warning details are returned in both the fix-result diagnostics and `structuredContent.warnings`.

## Development Notes

- Keep tool schemas aligned with `@pixelaid/automation` request shapes.
- Keep errors in the sanitized automation envelope. MCP clients should not need to parse stack traces.
- Add tests when tool names, schemas, JSON-RPC handling, or response shapes change.
- Keep long-running work cancellable through automation runtime options where the underlying operation supports it.

## Verification

Run MCP tests after changing tool definitions, handlers, or server behavior:

```sh
npm run test -w @pixelaid/mcp
```
