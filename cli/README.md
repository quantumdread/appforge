# AppForge command-line tools

This folder is for people checking Power Apps source locally and maintainers
updating AppForge's knowledge. `validate.mjs` provides validation, surveys,
modernization and renaming. `precompile-hook.mjs` supports validation before a
compile. The committed `dist/analyzer-core.mjs` supplies the shared checking engine.

`corpus/` holds regression inputs and snapshots. The extractor, catalog comparison
and retirement audit help maintainers review catalog updates.
See [PIPELINE.md](PIPELINE.md) for commands and the validation workflow, and the
[server README](../server/README.md) for building the engine and running checks.
