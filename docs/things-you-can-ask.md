# Things you can ask

You don't need to know AppForge's tool names. Ask your assistant in your own words, and mention AppForge if you want
to be sure it uses it. Here are examples, grouped by what you're trying to do.

## Change an app safely, start to finish

With Microsoft's canvas apps plugin installed and your app open in Studio:

> /appforge:edit-app add a search box above the orders gallery

> /appforge:edit-app convert the classic controls on the home screen to modern ones

> /appforge:edit-app the save button sometimes shows success even when saving failed; fix it

Your assistant reads the app and looks up the controls involved. It makes the change, checks it with AppForge, and
asks for your OK. Then it applies the change and checks the result in Studio.

## Before you change your app

> Check this screen with AppForge before applying it.

> Validate all my screens together and tell me what must be fixed first.

AppForge reports problems as **REFUSE** (this would break or be rejected; fix it first) or **WARN** (probably fine,
but worth a look). A good assistant won't apply a screen that still has a REFUSE.

> I just compiled. Did any controls end up in a different order than intended?

After changes are applied, controls can sometimes land in the wrong order inside a container. AppForge compares what
was meant with what Studio actually has.

## Controls and properties

> What properties does a modern Text Input have, and what values can Type take?

> Which control should I use for a date with a time?

> Is there a property to make a gallery's height fit its content?

AppForge knows the controls Power Apps offers today, including properties that aren't obvious from the Studio
interface. It also tells you how sure it is about each one.

## Formulas

> How do I use Filter with a SharePoint list without hitting the 500-row limit?

> Is StartsWith delegable to Dataverse?

> Explain what this formula does and whether it will be slow: *(paste formula)*

> Show me a good way to handle errors when saving a form.

## Understanding an existing app

> Survey this app and tell me what it does and what to fix first.

> Write documentation for this app that a new colleague could follow.

> Why is this screen slow to load?

A survey looks at the whole app: screens, controls, data sources, formulas and common risks. It gives you a report
you can read in a few minutes.

## Tidying up

> Convert the classic buttons and labels on this screen to modern controls.

> Give the controls on this screen meaningful names.

AppForge returns the converted or renamed version for you and your assistant to review. Nothing changes in your app
until you apply it, so try conversions on a copy of the app first.

## Starting a screen

> Show me the AppForge layout templates.

> Give me a dashboard screen with four KPI cards and a table underneath.

## Studio puzzles

> After a compile, some controls render black in Studio. What's going on?

> What can't canvas apps do, and what's the workaround? I need a drag-and-drop list.

## Reporting a problem

> /appforge:report-issue AppForge says my gallery formula is wrong, but it works.

Your assistant drafts the report with you and removes private details before anything is sent. See the
[FAQ](faq.md#how-do-i-report-a-wrong-finding).
