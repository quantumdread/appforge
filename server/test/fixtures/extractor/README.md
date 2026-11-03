# Extractor response fixtures

`2026-09-09/ModernDataGridColumn.txt` and `list_controls.txt` come from the
first 2026-09-09 capture session. Rectangle, ModernAvatar, GroupContainer,
Form, Star and Triangle were captured in a second session the same day; the
last three were recovered from the preserved full description capture on
September 20.

`current/` contains fresh September 20 captures of ModernAvatar, Rectangle,
ModernDataGridColumn, Form, Star and Triangle with `Default:` property metadata.
`2026-09-20-required/` preserves the earlier September 20 Form/Star/Triangle
captures used for the optional-heading and digit-leading variant regressions.
All use CanvasAuthoringMcpServer **1.1.0.0**. These are Microsoft's control
metadata, not app source. Original response bytes and CRLF are retained.
Compatibility tests compare complete control records between September 9 and
current captures, ignoring only enum-value set ordering. Output declarations
contain type names without enum metadata; enum-name-loss audits input properties
in base, variant and parent-context bundles.

`garbage-control-properties.txt` is the actual failed extractor output from
the second Route A attempt that day, preserved byte-for-byte. It has 125
duplicate empty control entries and one enum; its parent bundles also incorrectly
contain output properties. Tests retain duplicate keys when reading it.

`unrecognised.txt` and `empty-input.txt` are synthetic negative responses.
Whole-run tests replay the captured good controls and independently corrupt
each guarded dimension, including exact threshold boundaries and replacement
preservation. No fixture is app YAML or part of the analyzer corpus.
