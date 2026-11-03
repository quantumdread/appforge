# Third-party notices

AppForge is original work. Its [MIT licence](LICENSE) does not replace the
separate terms for the material identified below. Embedded documentation and
template content in generated bundles retain these notices and source terms.

## Microsoft Learn: Power Apps and Power Fx documentation

Portions of `knowledge/powerfx/**` and
`knowledge/*.md` adapt Microsoft Learn Power Apps
and Power Fx documentation, with changes to wording, organization, and examples.
Copyright Microsoft and the documentation contributors, where applicable.
The adapted documentation is covered by
[Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).
AppForge's changes do not imply endorsement by Microsoft.

Original sources are linked in the reference documents' `Sources` sections and
inline credits. Start at [Power Apps documentation](https://learn.microsoft.com/power-apps/)
and [Power Fx documentation](https://learn.microsoft.com/power-platform/power-fx/).
The [Power Apps documentation licence](https://github.com/MicrosoftDocs/powerapps-docs/blob/main/LICENSE)
and [Power Fx documentation licence](https://github.com/MicrosoftDocs/power-platform/blob/main/LICENSE)
provide the upstream terms.

## Microsoft Power Apps Studio templates

`cli/corpus/oracle-ms-templates/Screen*.pa.yaml`
contains unchanged Power Apps Studio "New screen" templates used as test input.
Copyright Microsoft. These inputs are **not covered by AppForge's MIT licence**;
all rights remain with Microsoft. Their inclusion as calibration fixtures does
not grant a separate redistribution or reuse licence.
The adjacent [corpus README](cli/corpus/oracle-ms-templates/README.md)
describes the capture and test boundary.

## Microsoft control metadata and extractor captures

`knowledge/catalogs/` and
`server/test/fixtures/extractor/` contain factual control metadata
and extractor captures generated from Microsoft's canvas-authoring MCP server,
including `describe_control` and `list_controls` responses. Copyright Microsoft
where applicable. These factual records carry no separate third-party licence
grant from AppForge; Microsoft's rights in source descriptions remain reserved.
AppForge's catalog-processing code is covered by AppForge's MIT licence.

## ToluVictor/canvas-apps-tools

Design concepts and sizing data credited to
[ToluVictor/canvas-apps-tools](https://github.com/ToluVictor/canvas-apps-tools)
appear in these three documents under `knowledge/`:

- `canvas-apps-limitations.md`: design limitations and alternatives.
- `design-spec-formats.md`: design specification concepts.
- `sizing-reference.md`: CSS measurement and sizing data.

The upstream [MIT licence](https://github.com/ToluVictor/canvas-apps-cli/blob/main/LICENSE)
is reproduced in full:

```text
MIT License

Copyright (c) 2026 ToluVictor

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Bootstrap Icons

SVG icon paths from [Bootstrap Icons](https://icons.getbootstrap.com/) appear
in these files under `knowledge/templates/`:

- `card-template-1.yaml`
- `card-template-2.yaml`
- `card-template-3.yaml`
- `custom-button.yaml`
- `data-table.yaml`
- `kpi-cards.yaml`
- `screen-table-template-1.yaml`
- `sidebar-collapsible.yaml`
- `table-template-1.yaml`

Their [MIT licence](https://github.com/twbs/icons/blob/main/LICENSE) is reproduced
in full. Template headers retain the attribution.

```text
The MIT License (MIT)

Copyright (c) 2019-2024 The Bootstrap Authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## Generated Cloudflare Workers types

`server/worker-configuration.d.ts` is generated by Wrangler.
Its runtime types carry copyright notices for Cloudflare and Microsoft
Corporation and are licensed under the
[Apache License, Version 2.0](https://www.apache.org/licenses/LICENSE-2.0).
The file's original copyright and licence header is retained.

## Community techniques

Community techniques are credited in place in `knowledge/powerfx/**`
and the reference documents, with an author and source index in the
[README acknowledgements](README.md#acknowledgements). Their explanatory text
is not reproduced under AppForge's MIT licence. Linked source text remains
subject to its authors' terms; technique credits do not imply a licence grant
over those pages.

## npm dependencies and committed bundles

The npm dependencies listed in `server/package.json` are installed
for development and are not bundled as runtime modules in the committed artifacts:

- `server/dist-local/appforge-mcp.mjs`
- `cli/dist/analyzer-core.mjs`

Both bundles contain AppForge code and embedded catalog/reference data; their
runtime module dependencies are Node built-ins only. The analyzer bundle has
no imports. The local MCP bundle imports `node:os`, `node:path`, `node:readline`,
`node:fs`, and `node:crypto`. The embedded material retains the terms
described above. Installed packages retain their own licences in `node_modules/`.
