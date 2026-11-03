# AppForge glossary

AppForge helps app owners understand, improve, and explain existing Power Apps.
This glossary defines the product language shared by its analysis, renovation,
documentation, and help workflows.

## Language

**App understanding**:
A source-backed account of an app's structure, workflows, rules, and dependencies, including interpretations, owner corrections, and unknowns.
_Avoid_: Complete semantic model, unquestioned source of truth

**Reconstructed scope**:
The draft account of an app's purpose, users, and supported tasks inferred from its implementation and supplied evidence.
_Avoid_: Recovered original requirements, proven original scope

**Intended scope**:
The purpose and behavior the app owner confirms the app should support; it may differ from its current implementation.

**Workflow**:
A user task followed through its entry conditions, interactions, data operations, and possible outcomes in the app and any known external dependencies.
_Avoid_: Screen inventory

**Diagnosis**:
An evidence-backed assessment of defects, risks, and improvement opportunities in an app, tied to its workflows or maintenance needs.
_Avoid_: Bug list, health score

**Improvement opportunity**:
A justified change that could improve an app's structure, performance, maintainability, or usability even when the app fulfils its intended scope.
_Avoid_: Defect, violation solely because an alternative design exists

**Renovation**:
A selected set of repairs or refactors intended to improve an existing app while preserving the behavior the owner wants to retain.
_Avoid_: Rewrite, bug fixing only

**Maintainer documentation**:
An account of the app's purpose, structure, dependencies, and important logic that helps a developer understand and change it.

**User guide**:
Task-based instructions explaining how an intended user completes work in the app.
_Avoid_: Control reference, technical implementation notes

**Interactive help**:
Guidance inside the app that lets users find a task, follow its steps, and reach relevant screens, with contextual assistance where supported.
_Avoid_: Chatbot by default, static documentation alone

**Freshness**:
Whether an account of the app or generated guidance still matches the source and owner decisions on which it depends.
_Avoid_: Recently generated therefore correct
