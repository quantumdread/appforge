# Getting started

This guide takes you from nothing to your first AppForge check. It takes about ten minutes, and you don't need any
coding experience.

## What you need

1. **An AI assistant that supports MCP.** MCP is the standard way AI assistants plug in extra tools. Any of these
   work:
   - **Claude Code**, as the desktop app, the VS Code extension or the terminal. This is the easiest route, because
     AppForge installs as a plugin.
   - **VS Code with GitHub Copilot.**
   - **Claude Desktop**, or another app that can add a local MCP server.
2. **Node.js**, a free program that AppForge runs on. Download the **LTS** version from
   [nodejs.org](https://nodejs.org/) and install it with the default options. Then close and reopen your AI app so it
   can find Node.js.

## Option A: Claude Code (recommended)

1. Open Claude Code.
2. Type this and press Enter:

   ```text
   /plugin install appforge --marketplace quantumdread/appforge
   ```

   On older versions of Claude Code, use these two lines instead:

   ```text
   /plugin marketplace add quantumdread/appforge
   /plugin install appforge@appforge
   ```

3. Follow the prompts, then start a new session so the plugin loads.

That's it. The plugin includes the AppForge tools and the `/appforge:report-issue` command.

## Option B: other AI apps

Other apps need AppForge on your computer and one line of setup.

1. **Download AppForge.** On the [AppForge GitHub page](https://github.com/quantumdread/appforge), click
   **Code → Download ZIP**, then unzip it to a folder you'll keep, for example `Documents\AppForge`.
2. **Find the server file.** Inside that folder, go to `server\dist-local\` and note the full path of
   `appforge-mcp.mjs`. For example: `C:\Users\you\Documents\AppForge\server\dist-local\appforge-mcp.mjs`.
3. **Add it to your app** as a local (stdio) MCP server named `appforge`. The command is `node`, followed by that full
   path.
   - **VS Code with GitHub Copilot:** open the Command Palette (Ctrl+Shift+P), run **MCP: Add Server**, choose
     **Command (stdio)**, and enter `node` followed by the path in quotes.
   - **Claude Desktop:** open **Settings → Developer → Edit Config**, add an `appforge` entry like the one below,
     save, and restart Claude Desktop.

     ```json
     {
       "mcpServers": {
         "appforge": {
           "command": "node",
           "args": ["C:/Users/you/Documents/AppForge/server/dist-local/appforge-mcp.mjs"]
         }
       }
     }
     ```

     Use forward slashes `/` in the path, as shown. If the file already has other servers, add `appforge` next to them
     inside `mcpServers`.
   - **Another app:** look for "MCP servers" in its settings, and add a stdio server with the command `node` and the
     path as its argument.

Nothing needs to be built or installed beyond this. The download already contains everything AppForge needs.

## Check that it works

Ask your assistant:

> Use AppForge to list the modern controls.

If it answers with a list such as ModernButton, ModernTextInput and ModernCombobox, you're set. If it says it has no
AppForge tools, see [the FAQ](faq.md#my-assistant-says-it-has-no-appforge-tools).

## Recommended companion: Microsoft's canvas apps plugin

AppForge checks and advises; it doesn't connect to Power Apps Studio. To let your assistant read your live app and
apply changes, also install Microsoft's **canvas-apps** plugin (Claude Code and GitHub Copilot). Together they work
like this:

1. Open your app in Power Apps Studio.
2. Your assistant reads the app through Microsoft's plugin.
3. AppForge checks the changes your assistant proposes.
4. With your OK, your assistant applies them through Microsoft's plugin.
5. AppForge checks that the result in Studio matches what was intended.

In Claude Code, start a change with `/appforge:edit-app` followed by what you want, for example:

```text
/appforge:edit-app add a search box above the orders gallery
```

Your assistant then follows these steps for you.

**The automatic safety gate.** With the AppForge plugin installed, every time your assistant is about to apply
changes through Microsoft's plugin, AppForge checks the whole app first. If something would break (a **REFUSE**), the
change is stopped and your assistant is told what to fix. You don't have to ask for this; it always runs. You can make
it softer in `/config`, where AppForge's **compile gate** setting is listed:

- **block:** the default. Stops changes that would break.
- **warn:** lets every change through, but tells you and your assistant what AppForge found.
- **off:** no check.

Only you can change this setting, not your assistant.

## Your first real check

You can try AppForge without connecting anything. In Power Apps Studio, right-click a screen or control in the tree
view and choose **View code** (or **Copy code**), copy the YAML, then ask:

> Check this screen with AppForge and explain anything it finds in plain language.
>
> *(paste the YAML)*

You'll get a list of findings, each marked **REFUSE** (must fix), **WARN** (worth a look) or nothing at all. The
[Glossary](glossary.md) explains these and other terms.

Next: [Things you can ask](things-you-can-ask.md).
