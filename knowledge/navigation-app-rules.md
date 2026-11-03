# Navigation and App analysis rules

These checks emit WARN findings from analyzed source. They do not establish
runtime failures, full app dependencies, or tenant compilation results.

## ForAll source iteration

`delegation-forall-truncation` identifies a complete ForAll source argument
that names a possible external datasource. ForAll is nondelegable, so iteration
can be limited to the retrieved portion of a source. This warning does not
claim that rows were lost. Review the connector's delegation support and the
required result size; consider a delegable source query or server-side work.
[Microsoft ForAll reference](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-forall).

The recognizer follows only Filter, Search, Sort, SortByColumns, ShowColumns,
and AddColumns first-argument wrappers. Literal tables, record-returning calls,
other wrappers, dotted expressions, known variables, local binding ambiguity,
reserved local names Parent/Self/ThisItem/ThisRecord, and sources identified as
collections are excluded. Reserved local names stay excluded even when a datasource
map has a colliding name. Unresolved source identity
remains uncertainty. This rule applies whether or not the body writes data;
the older per-row write warning is separate.

Implicit row expressions of Filter, LookUp, Sort, RemoveIf, AddColumns, Average,
Max, Min, StdevP, Sum, VarP, Distinct, Concat, CountIf, and UpdateIf also introduce
local names. Calls inside their non-source arguments are skipped, including
nested descendants, even when an external datasource map has a colliding name.
A ForAll in their first, source argument remains eligible. Numeric aggregate
overloads stay conservatively skipped when scope is ambiguous; Concatenate is
not classified as Concat. This finite exclusion does not change R1 inventory
collection policy.

## Global error reporting

`app-onerror-missing` is a maintainability observation for an authored App with
an absent or lexically empty OnError handler. Review whether global error
reporting or logging would help users and support staff. The default error
banner remains available without a custom handler, and OnError cannot repair
failed calculations. Any nonempty handler counts as configured; its usefulness
is not audited. Screen-only input does not establish a missing App handler.
[Microsoft App object reference](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/object-app).

## Navigation targets

`navigate-to-unknown-screen` reports a literal Navigate target not found among
the analyzed screens. Check its spelling and whether all source files were
included. It does not establish that the screen is absent from the whole app
and never recommends an automatic rename. Dynamic expressions, reserved local
names, known variable or named-formula targets, enclosing binding ambiguity, and duplicate screen
identities prevent this interpretation.

## Static reachability

`unreachable-screen` is a maintainability observation: no static path was found
from recognized entry points. It requires exactly one authored App, unique
screen identities, and an explicit literal StartScreen resolving to a known
screen. File order is not Studio Tree order and never supplies a default entry.
App and component navigation targets are possible additional entry points;
nested literal Navigate calls contribute edges, while Back adds none.

Dynamic or missing targets, unknown screen-property capture, unresolved custom
components, or partial navigation-capable formulas suppress graph warnings.
Quoted screen Properties headers, unsupported direct-section indentation, and
unsupported or duplicate property blocks remain unknown capture; they are not
interpreted as absent behavior. Nested control Properties beneath a canonical
screen Children section are kept separate from direct screen-property capture.
Unknown or materialized component property kinds and duplicate custom-property
declarations also leave graph classification unknown; existing catalog
validation remains unchanged.
Navigation-capable properties include On* behaviors, App.Formulas/StartScreen,
and declared component Event properties. Unsupported ordinary value or layout
formulas do not by themselves suppress the graph. The check does not prove a
screen is dead, and does not recommend automatic deletion. Review unmodeled
navigation and real user workflows before changing the screen set.

All four rules ignore partial/interpolated or locale-ambiguous call syntax and
qualified built-in lookalikes. Datasource resolution and known-symbol checks
are shared with the other structural analysis rules. Documentation checked
2026-09-08; no catalog claim is promoted by these source observations.
