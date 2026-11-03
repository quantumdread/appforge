# AppForge

**A Power Apps expert for your AI assistant.**

> **A note before you start.** AppForge isn't made by a professional. I started it to expand on an idea I got from a
> Matthew Devaney video, and it turned out to be genuinely useful to me. It might not be for you, and that's fine. If
> it gets something wrong, I'd like to hear about it.

AppForge gives an AI assistant, such as Claude or GitHub Copilot, reliable knowledge of Power Apps canvas apps, plus
a set of checks it can run on your app. You talk to your assistant in plain language; AppForge helps make sure
the answers and changes it gives you are actually right for Power Apps.

You don't need to be a developer to use it.

## What it helps with

- **Catch mistakes before they reach your app.** Your assistant checks a screen with AppForge before applying it,
  and stops if something would break.
- **A safety net for Microsoft's canvas apps plugin.** When your assistant changes a live app through Microsoft's
  plugin, AppForge checks the whole app before each change is applied, and checks the result afterwards.
  `/appforge:edit-app` walks through a change step by step.
- **Know the controls.** Which properties a control really has, which values they accept, and which control to use.
- **Write better formulas.** Power Fx reference and advice, including the delegation traps that silently cut your
  data off at 500 rows.
- **Understand an existing app.** A full report on an app you inherited: what's in it and what to fix first.
- **Tidy up.** Convert classic controls to modern ones, and give controls meaningful names.
- **Start faster.** Ready-made layouts such as cards, tables, KPI tiles and side menus.

## Start here

### 1. Install (once)

You need [Node.js](https://nodejs.org/) (LTS) first. Then pick your assistant.

**Claude Code** — one line:

```text
/plugin install appforge --marketplace quantumdread/appforge
```

**Codex (OpenAI)** — download AppForge from this page (**Code → Download ZIP**) and unzip it somewhere you'll keep,
for example `Documents/AppForge`. Then, in a terminal:

```text
codex mcp add appforge -- node "C:/Users/you/Documents/AppForge/server/dist-local/appforge-mcp.mjs"
```

Use your own path. Codex asks before each AppForge tool call; approve it, or allow AppForge's tools in your Codex
settings.

**VS Code with GitHub Copilot** — download and unzip as above, then open the Command Palette (Ctrl+Shift+P), run
**MCP: Add Server**, choose **Command (stdio)**, and enter `node` followed by the path in quotes.

**Claude Desktop and other assistants** — see the [Getting started guide](docs/getting-started.md).

**What you get where**

| | Claude Code | Codex, Copilot and others |
|---|---|---|
| AppForge checks, control and Power Fx knowledge, app survey, templates | Yes | Yes |
| Guided change to a live app | `/appforge:edit-app` | Ask: *"Follow AppForge's edit-app workflow (`skills/edit-app/SKILL.md` in your AppForge folder) to …"* |
| Automatic safety check before every change is applied | Yes, built in | Not automatic: ask your assistant to check with AppForge before applying |
| Report a problem | `/appforge:report-issue` | Ask: *"Prepare an AppForge issue report about …"* |

### 2. Try this: no setup needed

Paste a screen's YAML from Power Apps Studio (right-click it → **View code**) and ask:

```text
Check this screen with AppForge and explain anything it finds in plain language.
```

Or ask a question:

```text
Is Filter with StartsWith delegable to SharePoint? Show me a safe version.
```

```text
What properties does a modern Text Input have, and what does each one do?
```

### 3. Connect your live app (recommended)

To let your assistant work on an app that's open in Studio, add Microsoft's **canvas-apps** plugin. It also needs the
[.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0). In Claude Code:

```text
/plugin marketplace add microsoft/power-platform-skills
/plugin install canvas-apps@power-platform-skills
```

In VS Code, search the Extensions view for `@agentPlugins canvas apps`. For other assistants, see
[Microsoft's canvas-apps plugin](https://github.com/microsoft/power-platform-skills/tree/main/plugins/canvas-apps)
for how to add its canvas-authoring server.

Restart your assistant. Then:

1. In Power Apps Studio, open your app and turn on **Settings → Updates → Coauthoring**. Keep the tab open.
2. Ask: *"Connect the Canvas Apps MCP server to my app."* Paste the Studio address when asked.

In Claude Code, AppForge now checks every change before it reaches your app, and stops anything that would break it.
In other assistants, ask for an AppForge check before each change is applied.

### 4. Try this: on your live app

```text
/appforge:edit-app add a search box above the orders gallery
```

```text
Survey this app and tell me what it does and what to fix first.
```

```text
/appforge:edit-app convert the classic controls on the home screen to modern ones
```

```text
/appforge:edit-app give the controls on this screen meaningful names
```

```text
/appforge:edit-app the save button shows success even when saving fails; fix it
```

With `/appforge:edit-app`, your assistant reads the app, makes the change and checks it with AppForge. Then it
**asks for your OK**, applies the change, and checks the result in Studio.

Not in Claude Code? Replace `/appforge:edit-app` with *"Follow AppForge's edit-app workflow to …"*.

More ideas: [Things you can ask](docs/things-you-can-ask.md).

### Good to know

- **Keep Studio open, and don't resume an expired session.** If Studio says the session expired, reload the app;
  resuming can undo a change.
- **Make big changes in steps,** a few screens at a time.
- **You choose how strict AppForge is (Claude Code):** it stops changes that would break (default), only warns, or is
  off. Set it with `/plugin configure appforge@appforge`; it's also listed in `/config`.
- **Report wrong stops.** If AppForge stops something that's actually fine, use `/appforge:report-issue`, or ask your
  assistant to prepare an AppForge issue report.

## Your app stays yours

- AppForge runs on your own computer. It doesn't send your app anywhere, and it never connects to your Power Apps
  environment.
- It never changes your app by itself. It checks and suggests; changes reach your app only when your assistant
  applies them through Microsoft's own tool, which needs your go-ahead.
- Your AI assistant does see whatever you share with it, so follow your organisation's rules for app data.

More in the [FAQ](docs/faq.md). New words are explained in the [Glossary](docs/glossary.md).

## Something wrong?

If AppForge flags something that's actually fine, misses a problem, or a doc is wrong, please tell us. In Claude Code,
type `/appforge:report-issue`; your assistant drafts the report with you and checks it for private details before
anything is sent. You can also open an issue on [GitHub](https://github.com/quantumdread/appforge/issues). Please
leave out customer names, real data and anything that identifies your organisation.

## For developers

The [Developer guide](docs/developer-guide.md) covers the 21 tools, the command-line validator, self-hosting and data
locations. [CONTRIBUTING](CONTRIBUTING.md) explains how to build, test and propose changes, and
[ARCHITECTURE](ARCHITECTURE.md) shows how the pieces fit together.

See [what’s in this repository](CONTRIBUTING.md#whats-in-this-repository) for a folder map.

## Licence

AppForge is free and open source under the [MIT licence](LICENSE). Some included material, such as Microsoft
documentation and templates, keeps its own terms; see [THIRD-PARTY-NOTICES](THIRD-PARTY-NOTICES.md).

## Acknowledgements

AppForge is original work, developed since September 2025. Its rules and reference documents credit techniques and
material from others, including:

- [Matthew Devaney](https://www.matthewdevaney.com/): coding standards, named formulas, gallery techniques, and deep links.
- [Shane Young / PowerApps911](https://www.powerapps911.com/post/select-multiple-items-and-select-all-in-power-apps-galleries): gallery selection techniques.
- [Reza Dorrani](https://rezadorrani.com/): gallery pagination.
- [April Dunnam](https://github.com/aprildunnam): templates and components.
- [Craig White / Platforms of Power](https://platformsofpower.net/power-apps-error-handling-essentials/): error handling and performance techniques.
- [Reshmee Auckloo](https://reshmeeauckloo.com/posts/powerapps-filter-search-gallery/): combined search and filtering.
- [Power Apps Guide](https://powerappsguide.com/): filtering and app settings.
- [SPGuides](https://www.spguides.com/power-apps-loading-spinner/) and [EnjoySharePoint](https://www.enjoysharepoint.com/): gallery and loading patterns.
- [Rishan Solutions](https://rishandigital.com/powerapps/): lazy loading techniques.
- [Practical Power Apps](https://www.practicalpowerapps.com/): checkbox selection.
- [Quisitive](https://quisitive.com/): filtering techniques.
- [Facundo Capdevila / Hako IT](https://www.hakoit.com/en/power-apps-mistakes-and-how-to-avoid-them/): common mistakes.
- [HubSite 365](https://www.hubsite365.com/en-ww/crm-pages/5-biggest-mistakes-power-apps-users-make-when-starting-out-034000b8-9d12-4cae-a97e-954c21015cf2.htm): community learning resources.
- [ToluVictor/canvas-apps-tools](https://github.com/ToluVictor/canvas-apps-tools): design concepts and sizing data in three knowledge documents (MIT); see the [notices](THIRD-PARTY-NOTICES.md#toluvictorcanvas-apps-tools).
- [Microsoft Learn](https://learn.microsoft.com/power-apps/): Power Apps and Power Fx documentation (CC BY 4.0).

These credits concern specific material; the third-party notices describe its scope.
