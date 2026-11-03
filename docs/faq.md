# Frequently asked questions

## Do I need to know how to code?

No. You talk to your AI assistant in plain language, and the assistant uses AppForge behind the scenes. You'll see
some YAML, which is the text form of your app, but you don't need to write it yourself.

## What does AppForge actually do?

It gives your assistant two things it otherwise lacks:

- **Accurate Power Apps knowledge:** which controls and properties exist, how formulas behave, and what Studio does
  in practice.
- **Checks it can run:** whether a screen is valid, whether a formula will quietly lose data, and whether controls
  ended up where they should after a change.

Without it, an assistant often guesses property names or uses patterns that look right but don't work in Power Apps.

## Does AppForge change my app?

Never by itself. AppForge only reads the YAML you or your assistant give it, and returns findings or a suggested
version. Changes reach your app only when your assistant applies them with Microsoft's own tool (the canvas-apps
plugin), and that needs your go-ahead.

## Is my app sent anywhere?

AppForge runs on your computer and doesn't send your app anywhere. It has no connection to your Power Apps
environment.

Your AI assistant is a different matter: whatever you share with it goes to the assistant's service. Follow your
organisation's rules about which app data you share.

## How is this different from Microsoft's canvas apps plugin?

They do different jobs and work well together:

- **Microsoft's plugin** connects your assistant to Power Apps Studio. It reads your live app and applies changes.
- **AppForge** is the second pair of eyes. It checks proposed changes, knows the controls in depth, and explains
  formulas and Studio behaviour.

With both installed in Claude Code, AppForge's safety gate checks every change before Microsoft's plugin applies it,
and `/appforge:edit-app` guides a whole change from start to finish.

## What is the safety gate, and can I turn it off?

The safety gate runs automatically just before your assistant applies changes to your app through Microsoft's plugin.
AppForge checks the whole app, and if it finds a **REFUSE** (something that would break), the change is stopped and
your assistant is told what to fix. After a change, AppForge also reminds your assistant to check that the result
matches what was intended.

To change it, open `/config` in Claude Code and find AppForge's **compile gate** setting:

- **block:** the default.
- **warn:** never stops a change, but reports what it found.
- **off:** no check.

If you think a REFUSE is wrong, keep the setting on block and report it with `/appforge:report-issue`; that's how
AppForge gets better.

## What do REFUSE and WARN mean?

- **REFUSE:** this would break or be rejected. Fix it before applying.
- **WARN:** probably fine, but worth a look, for example a formula that may be slow or may not see all your rows.
- **No finding:** nothing AppForge knows about is wrong.

AppForge keeps REFUSE for things it is sure about, so a REFUSE is worth taking seriously. If one is wrong, please
report it (see below).

## Why does AppForge say how sure it is?

Power Apps changes often, and not everything is documented. AppForge records where each fact comes from: compiled
and accepted by Studio, observed in Studio, documented by Microsoft, or only inferred. It tells you which, so you
know how much to rely on an answer.

## Does it work with GitHub Copilot, or only Claude?

Any AI assistant that supports MCP servers can use AppForge. Claude Code has the easiest setup, because AppForge
installs there as a plugin. See [Getting started](getting-started.md).

## Does it cost anything?

AppForge is free and open source. Your AI assistant may have its own subscription.

## Windows or Mac?

Both, and Linux. AppForge needs Node.js version 20 or later.

## My assistant says it has no AppForge tools

- **Claude Code:** start a new session after installing the plugin. Type `/plugin` to check that `appforge` is
  installed and enabled.
- **Other apps:** check that the path to `appforge-mcp.mjs` is complete and correct, then restart the app.
- **Node.js:** make sure it is installed. Open a terminal and type `node --version`; it should print `v20` or higher.
  If you installed Node.js while your AI app was open, restart the app.

## How do I report a wrong finding?

In Claude Code, type `/appforge:report-issue` followed by a short description. Your assistant asks what happened,
checks the draft for private details, and shows you the full report before anything is sent. In other apps, ask
your assistant to "prepare an AppForge issue report", or open an issue on
[GitHub](https://github.com/quantumdread/appforge/issues) yourself.

Please use made-up names and the smallest example that shows the problem. Never include customer names, real data,
or IDs from your organisation.

## How do I update AppForge?

- **Claude Code:** type `/plugin`, find `appforge`, and update it from there.
- **Other apps:** download the ZIP again and replace the old folder. Keep the same folder path so your setup still
  works.
