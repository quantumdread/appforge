---
name: edit-app
description: Change a live Power Apps canvas app safely, using Microsoft's canvas-apps plugin to read and apply the app and AppForge to check the work before and after. Use when the user asks to change, fix, extend, convert, rename or tidy up a canvas app that is open in Power Apps Studio, or when Microsoft's canvas-app workflow is about to compile changes.
argument-hint: "<what you want to change in the app>"
---

# Change a canvas app safely

Two plugins work together here:

- **Microsoft's canvas-apps plugin** (its canvas-authoring tools) reads the live app (`sync_canvas`) and applies changes
  (`compile_canvas`).
- **AppForge** knows the controls, rules and Power Fx, checks the YAML, and checks the result after a change.

Follow the steps in order. If Microsoft's own canvas-app workflow is already handling the edit, keep following it and
add the AppForge steps at the matching points (3, 5, 8 and 9). Don't run two competing workflows.

The user may not be a developer. Explain findings and choices in plain language, and keep YAML out of your messages
unless they ask for it.

## 1. Check the setup

- **Canvas-authoring tools** (`sync_canvas`, `compile_canvas`): if they're missing, tell the user to install and
  connect Microsoft's canvas-apps plugin, and stop.
- **AppForge tools** (`validate_yaml`, `compare_child_order`): if they're missing, point to AppForge's Getting started
  guide, and stop.
- **The app must be open in Power Apps Studio.** A sync returns nothing when it isn't. If a sync comes back empty, ask
  the user to open the app and try again.

## 2. Sync to a fresh folder

- Create a new, empty folder for this change, inside the current workspace, for example
  `appforge-work/<app>-<date-time>/source`.
- Call `sync_canvas` with its absolute path.
- Copy the synced folder to a sibling folder named `before` (`appforge-work/<app>-<date-time>/before`) and never edit
  it. AppForge compares against it to tell the controls you add from the ones already there; the compile gate finds
  it automatically.
- Always sync before editing, and never edit an older copy: the app may have changed in Studio since.

## 3. Understand before changing

- Read the screens and components the request touches.
- For every control you will add or change, call AppForge `get_control_info`. Use only properties and values it lists;
  don't guess property names.
- For formulas, use `get_powerfx_function` or `search_powerfx`, and check delegation for any data source with many rows.
- For new screens or layouts, check `get_yaml_rules` (generator rules) and `list_templates`.
- **The existing app is not a template.** Build new controls and formulas from AppForge's rules, not by copying
  neighbouring screens: if the app uses older control types or patterns, new parts still use the current ones. Match
  the app's look by reusing its colours, fonts and sizes. Copy existing controls only when the user asks for that, and
  say so in the plan.
- For larger or unclear work (several screens, or an app the user doesn't know well), run AppForge `survey_app` on the
  synced files first and summarise what you found.
- If the request is ambiguous or touches more than a few controls, agree the plan with the user before editing.

## 4. Make the change in the folder

- Edit the synced YAML in place. **The folder must stay complete:** every screen, component and `App.pa.yaml`. A
  compile deletes screens that are missing from the folder.
- For conversions or renames, use AppForge `modernize_controls` or `rename_controls` on the complete file set, and
  write back every file they return.
- Write bare control types without version pins (for example `Classic/Button`, not `Classic/Button@2.2.0`).

## 5. Validate with AppForge

- Call `validate_yaml` with **all** files in the folder together, so cross-file checks run, and the `before` folder's
  files as `before_files`.
- **`new-control-superseded-type`:** a control you added uses an outdated type. Switch it to the type the finding
  names, unless the user asked to match the existing controls.
- **REFUSE:** fix it and validate again. Never compile with a REFUSE outstanding, and never work around one. If you
  believe a REFUSE is wrong, tell the user and suggest `/appforge:report-issue`.
- **WARN:** fix the ones that are clearly safe to fix. List the rest for the user in plain words, with why each
  matters.

## 6. Ask before applying

Summarise what will change (screens, controls, formulas) and any WARNs that remain. Then ask the user for an explicit
OK to apply. Compiling writes to the app that is open in Studio.

## 7. Compile the complete folder

- Call `compile_canvas` with the folder's absolute path, the complete folder, never a subset. When the AppForge plugin
  is installed, its gate checks the folder again automatically. If the gate blocks the compile, fix the findings and
  go back to step 5.
- **Read the result carefully.** A compile applies to the app **even when it reports validation errors**. If it
  reports errors, tell the user what was applied, fix the errors, validate again, and ask before compiling again.
- For large changes, apply in steps (for example a few screens at a time) and let Studio save between steps.

## 8. Check the result

- Studio saves automatically. Sync to a **new, empty** folder (not the one you compiled).
- Call AppForge `compare_child_order` with the compiled folder's files as intended and the new folder's files as
  synced.
- If it reports moved, missing or retyped controls, explain what happened. Recompile from the intended folder only
  with the user's OK, then check again.
- If Studio says the session has expired, ask the user to reload the app. Never choose to resume an expired session;
  that can silently undo the compile.

## 9. Run Microsoft's app checks

Call `get_appchecker_errors` and `get_accessibility_errors`. Report anything new that this change introduced, in plain
language.

## 10. Report back

Tell the user:

- what changed
- which checks ran and what they found
- anything to look at in Studio themselves, for example the visual result

After a bulk rename, ask them to check every screen's tree in Studio for leftover temporary names; those can exist
even when the sync doesn't show them. If controls look black in the editor after a compile, a reload of the app
usually fixes the display.

## Safety rules (always)

- Never compile a partial or filtered folder.
- Never compile without the user's explicit OK in this conversation.
- Never compile while AppForge reports a REFUSE.
- Never resume an expired Studio session.
- Never change the AppForge compile-gate setting yourself; only the user does that.
- Keep customer data out of anything you suggest reporting publicly.
