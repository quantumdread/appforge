# AppForge server

This package contains the MCP server, shared analyzer core, build scripts and tests.
It is for developers working on AppForge's tools or hosting their own server.

From this folder, run `npm install`, then `npm run build:local` to build the catalog,
CLI core and local server. Run `npm test` for both test pools, or
`npm run release:check` for the full release gate, including types and the corpus.

The committed `dist-local/appforge-mcp.mjs` bundle runs with Node.js without an
install step. Regenerate it with `npm run build:local`; do not edit it by hand.
See the [developer guide](../docs/developer-guide.md) and
[contribution guide](../CONTRIBUTING.md).
