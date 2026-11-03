---
name: report-issue
description: Prepare and submit an AppForge issue when asked to report a bug, a false REFUSE or WARN, a missing control or property, or a wrong doc.
argument-hint: "<kind> <short description>"
---

Prepare an AppForge issue from the user's arguments and the conversation. The
repository at https://github.com/quantumdread/appforge is public. Before gathering
details, remind the user to remove:

- customer, company and person names
- tenant, environment and app ids
- internal URLs
- real data values
- screen or control names that identify a customer app

Use neutral names and the smallest PA-YAML repro that demonstrates the problem.

1. Choose `kind`: `false-refuse`, `false-warn`, `catalog-gap`, `tool-behaviour`,
   `doc-error` or `other`. Gather a title of 1–120 characters and a summary.
   Reuse relevant details already supplied: `rule_id`, `control_type`, `tool_name`,
   `expected`, `actual` and `repro_yaml`. Record `evidence_class` when known:
   `compile_canvas`, `studio_observation`, `visual` or `inferred`. Include the
   server's AppForge version. For a catalog gap, describe the property or variant
   in the summary; for a doc error, include the document and section there.
   Ask only for details needed to understand the issue; do not invent evidence.
2. Before showing a preview, scan every drafted field for likely leaks: GUIDs,
   e-mail addresses, URLs whose host is neither `learn.microsoft.com` nor
   `github.com`, and names the user identified as a customer. A subdomain or a
   hostname containing one of those strings is not the allowed host. Also check
   the containment list above. If anything looks identifying, explain which field
   needs a neutral replacement and ask the user to supply it. Do not proceed to
   the preview until those fields have been replaced and checked again.
3. Show the full title and Markdown body, the destination repository and the kind
   label. Include all gathered fields and the complete minimal repro. Ask for
   explicit approval to submit this exact draft. Any edit after approval requires
   a new preview and approval.
4. After explicit approval, if `gh` is authenticated, write the approved body to a
   temporary UTF-8 file and run:

   ```text
   gh issue create --repo quantumdread/appforge --title <approved title> --body-file <temp file> --label <kind>
   ```

   Pass the title and label as arguments, without constructing an executable
   command from report text. Remove the temporary file after use. If filing fails,
   show the error; check whether an issue was created before retrying to avoid a
   duplicate. Never claim submission succeeded without an issue URL.
5. If `gh` is unavailable or unauthenticated, call `report_issue` with the approved
   fields and give the user its prefilled URL to open and submit. The tool only
   prepares a link. If it warns about a repository override or the URL points
   anywhere other than the previewed repository, explain the destination and
   obtain approval for it before asking the user to open the link. If fields were
   shortened for the URL, provide the full Markdown body to paste into the form.
6. Show the created issue URL, or clearly identify the prefilled URL as awaiting
   submission by the user.
