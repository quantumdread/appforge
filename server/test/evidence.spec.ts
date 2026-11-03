import { describe, it, expect } from 'vitest';
import { validateFiles } from '../src/lib/validator';

// src/lib/validator's validateFiles(files, lintContext?) already injects
// ANALYZER_CATALOG_DATA internally — datasources travel in lintContext, not
// as a third argument (that 3-arg shape belongs to the core's validateFiles,
// not this worker-compatibility wrapper).
const analyze = (content: string, datasources?: Record<string, string>) =>
  validateFiles(
    [{ name: 'a.pa.yaml', content }],
    datasources ? { datasources: datasources as never } : undefined,
  );

describe('structured issue evidence', () => {
  it('carries the resolved bound source on a delegation finding', () => {
    const yaml = `Screens:
  Main:
    Children:
      - galOrders:
          Control: Gallery
          Properties:
            AccessibleLabel: ="Orders"
            Items: =Search(Orders, txtQ.Text, "Name")
`;
    const issue = analyze(yaml, { Orders: 'sharepoint' }).issues
      .find(i => i.rule === 'delegation-sharepoint-search');
    expect(issue?.evidence).toEqual({
      kind: 'bound-source',
      authoredName: 'Orders',
      backend: 'sharepoint',
      resolvedBy: 'explicit-input',
      confidence: 'high',
    });
  });

  it('carries the resolved bound source on a gallery-template lookup finding', () => {
    // perf-lookup-in-gallery-template is a second, independent findSourceCalls
    // site (not routed through delegationIssues) — Plan 3's root-cause
    // grouping consumes its bound-source evidence too, so it needs its own
    // coverage rather than relying on the delegation-family test above.
    const yaml = `Screens:
  Main:
    Children:
      - galEmployees:
          Control: Gallery
          Properties:
            Items: =Anställda
          Children:
            - lblManager:
                Control: Label
                Properties:
                  Wrap: =false
                  Text: =LookUp(Chefer, Nummer = ThisItem.ChefNummer, Namn)
`;
    const issue = analyze(yaml, { Chefer: 'sharepoint' }).issues
      .find(i => i.rule === 'perf-lookup-in-gallery-template');
    expect(issue?.evidence).toEqual({
      kind: 'bound-source',
      authoredName: 'Chefer',
      backend: 'sharepoint',
      resolvedBy: 'explicit-input',
      confidence: 'high',
    });
  });

  it('carries a stable formula identity on duplicate-formula', () => {
    const repeated = '=If(ThisItem.Status = "Open", RGBA(9, 9, 9, 1), RGBA(8, 8, 8, 1))';
    const yaml = `Screens:
  Main:
    Children:
      - lblA:
          Control: Label
          Properties:
            Wrap: =false
            Color: ${repeated}
      - lblB:
          Control: Label
          Properties:
            Wrap: =false
            Color: ${repeated}
      - lblC:
          Control: Label
          Properties:
            Wrap: =false
            Color: ${repeated}
`;
    const issue = analyze(yaml).issues.find(i => i.rule === 'duplicate-formula');
    expect(issue?.evidence?.kind).toBe('formula-identity');
    expect(typeof (issue?.evidence as { identity: string }).identity).toBe('string');
    expect((issue?.evidence as { identity: string }).identity.length).toBeGreaterThan(0);
  });

  it('carries a stable formula identity on a gallery-scoped duplicate formula', () => {
    // duplicate-formula-in-gallery groups by the same normalized-formula Map
    // key as duplicate-formula but is a separate rule body with its own
    // emission site — needs its own coverage for the same reason as above.
    const yaml = `Screens:
  Main:
    Children:
      - galOrders:
          Control: Gallery
          Properties:
            Items: =Orders
          Children:
            - lblOne:
                Control: Label
                Properties:
                  Text: '=If(ThisItem.Active, "Enabled", "Disabled")'
            - lblTwo:
                Control: Label
                Properties:
                  Text: '=If(ThisItem.Active, "Enabled", "Disabled")'
`;
    const issue = analyze(yaml).issues.find(i => i.rule === 'duplicate-formula-in-gallery');
    expect(issue?.evidence?.kind).toBe('formula-identity');
    expect(typeof (issue?.evidence as { identity: string }).identity).toBe('string');
    expect((issue?.evidence as { identity: string }).identity.length).toBeGreaterThan(0);
  });

  it('carries the applied threshold on the control budget finding', () => {
    const children = Array.from({ length: 301 }, (_, i) => `      - lbl${i}:
          Control: Label
          Properties:
            Wrap: =false
            Text: ="x"`).join('\n');
    const issue = analyze(`Screens:\n  Main:\n    Children:\n${children}\n`).issues
      .find(i => i.rule === 'perf-control-budget');
    expect(issue?.evidence).toMatchObject({ kind: 'threshold', appliedThreshold: 300 });
  });

  it('leaves evidence absent on rules that declare none', () => {
    const yaml = `Screens:
  Main:
    Children:
      - lblOne:
          Control: Label
          Properties:
            Text: ="hi"
            TabIndex: =3
`;
    const issue = analyze(yaml).issues.find(i => i.rule === 'a11y-tabindex-positive');
    expect(issue).toBeTruthy();
    expect(issue?.evidence).toBeUndefined();
  });
});
