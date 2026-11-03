import { describe, it, expect } from 'vitest';
import { validateYaml } from '../src/tools/validator';
import {
  LEGACY_VALIDATE_YAML_INPUT,
  LEGACY_VALIDATE_YAML_RESPONSE,
  NEAR_MISS_VALIDATE_YAML_RESPONSE,
  NEAR_MISS_YAML_INPUT,
} from './fixtures/legacy-bytes';

describe('validate_yaml tool', () => {
  it('keeps the Plan 4 branch-point validate_yaml response byte-identical', () => {
    const response = validateYaml.handler({
      files: [{ name: 'legacy-byte.pa.yaml', content: LEGACY_VALIDATE_YAML_INPUT }],
    });
    // Frozen fixture; only J3's per-app version-pin inventory prose changes.
    const oldAdvice = '1 control type(s) carry @version pins — observed, not judged: a suffix alone establishes neither lag nor incompatibility; see the version-lag inventory for evidence-backed migrations. This repository authors bare control types (generator convention). Pinned: pinned';
    const newAdvice = '1 control type(s) carry @version pins across 1 file(s) — observed, not judged: a suffix alone establishes neither lag nor incompatibility; see the version-lag inventory for evidence-backed migrations. This repository authors bare control types (generator convention). Files: legacy-byte.pa.yaml. Pinned: pinned';
    expect(response.content[0].text).toBe(LEGACY_VALIDATE_YAML_RESPONSE.replaceAll(oldAdvice, newAdvice));
  });

  it('keeps the unknown-property near-miss response byte-identical', () => {
    const response = validateYaml.handler({
      files: [{ name: 'near-miss-byte.pa.yaml', content: NEAR_MISS_YAML_INPUT }],
    });
    expect(response.content[0].text).toBe(NEAR_MISS_VALIDATE_YAML_RESPONSE);
  });

  it('keeps duplicate-control-name punctuation and owner order byte-identical', () => {
    const response = validateYaml.handler({ files: [
      { name: 'a.pa.yaml', content: '- Shared:\n    Control: Button\n' },
      { name: 'b.pa.yaml', content: '- Shared:\n    Control: Button\n' },
    ] });
    expect(response.content[0].text).toBe(`{
  "gate_decision": "BLOCK",
  "summary": {
    "pass": 0,
    "warn": 0,
    "refuse": 2,
    "controls_seen": 2,
    "files": 2
  },
  "per_file": [
    {
      "file": "a.pa.yaml",
      "pass": 0,
      "warn": 0,
      "refuse": 1,
      "controls_seen": 1
    },
    {
      "file": "b.pa.yaml",
      "pass": 0,
      "warn": 0,
      "refuse": 1,
      "controls_seen": 1
    }
  ],
  "issues": {
    "refuse": [
      {
        "level": "REFUSE",
        "rule": "duplicate-control-name",
        "file": "a.pa.yaml",
        "line": 1,
        "control": "Shared",
        "type": "Button",
        "detail": "duplicate-control-name: 'Shared' is declared in 2 places (a.pa.yaml:1, b.pa.yaml:1). PA-YAML requires globally unique control names across all screens."
      },
      {
        "level": "REFUSE",
        "rule": "duplicate-control-name",
        "file": "b.pa.yaml",
        "line": 1,
        "control": "Shared",
        "type": "Button",
        "detail": "duplicate-control-name: 'Shared' is declared in 2 places (a.pa.yaml:1, b.pa.yaml:1). PA-YAML requires globally unique control names across all screens."
      }
    ],
    "warn": []
  }
}`);
  });

  it('rejects payloads over 1.5MB', () => {
    const big = 'x'.repeat(1_600_000);
    const r = validateYaml.handler({ files: [{ name: 'a.pa.yaml', content: big }] });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('1.5');
  });

  it('returns lint issues with rule ids in the warn/refuse groups', () => {
    const y = `- lblA:
    Control: Label
    Properties:
      Text: "no equals"
`;
    const r = validateYaml.handler({ files: [{ name: 'a.pa.yaml', content: y }] });
    const body = JSON.parse(r.content[0].text);
    expect(body.gate_decision).toBe('BLOCK');
    expect(body.issues.refuse.some((i: any) => i.rule === 'formula-missing-equals')).toBe(true);
  });

  it('preserves complete aggregate controls arrays in the public response only on aggregates', () => {
    const inputs = Array.from({ length: 7 }, (_, index) => `      - txt${index + 1}:
          Control: TextInput
          Properties:
            AccessibleLabel:
`).join('');
    const y = `Screens:
  Main:
    Children:
${inputs}      - lblOrder:
          Control: Label
          Properties:
            Text: ="Order"
            Wrap: =false
            TabIndex: =3
`;
    const r = validateYaml.handler({ files: [{ name: 'aggregate.pa.yaml', content: y }] });
    const body = JSON.parse(r.content[0].text);
    const aggregate = body.issues.warn.find((issue: any) =>
      issue.rule === 'a11y-inputs-missing-accessiblelabel');
    const perControl = body.issues.warn.find((issue: any) =>
      issue.rule === 'a11y-tabindex-positive');

    expect(aggregate.detail).toContain('txt1, txt2, txt3, txt4, txt5, …');
    expect(aggregate.detail).not.toContain('txt6');
    expect(aggregate.controls).toEqual(['txt1', 'txt2', 'txt3', 'txt4', 'txt5', 'txt6', 'txt7']);
    expect(perControl).not.toHaveProperty('controls');
    expect(validateYaml.description).toContain('machine-readable controls array');
  });

  it('never leaks rule-declared evidence into the public response', () => {
    // Exercises all three evidence-bearing families in one batch: a
    // datasources-mapped delegation finding (bound-source), a repeated
    // formula (formula-identity), and an over-budget screen (threshold).
    const repeated = '=If(ThisItem.Status = "Open", RGBA(9, 9, 9, 1), RGBA(8, 8, 8, 1))';
    const budgetControls = Array.from({ length: 301 }, (_, i) => `      - lbl${i}:
          Control: Label
          Properties:
            Wrap: =false
            Text: ="x"`).join('\n');
    const y = `Screens:
  Main:
    Children:
      - galOrders:
          Control: Gallery
          Properties:
            AccessibleLabel: ="Orders"
            Items: =Search(Orders, txtQ.Text, "Name")
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
${budgetControls}
`;
    const r = validateYaml.handler({
      files: [{ name: 'evidence.pa.yaml', content: y }],
      datasources: { Orders: 'sharepoint' },
    });
    const body = JSON.parse(r.content[0].text);
    const rules = [...body.issues.refuse, ...body.issues.warn].map((i: any) => i.rule);
    expect(rules).toEqual(expect.arrayContaining([
      'delegation-sharepoint-search', 'duplicate-formula', 'perf-control-budget',
    ]));

    // The response is public JSON text; scan the raw bytes for the field
    // name that must never appear, then re-confirm structurally.
    expect(r.content[0].text).not.toContain('"evidence"');
    const hasEvidenceKey = (value: unknown): boolean => {
      if (Array.isArray(value)) return value.some(hasEvidenceKey);
      if (value && typeof value === 'object') {
        return Object.entries(value as Record<string, unknown>)
          .some(([key, v]) => key === 'evidence' || hasEvidenceKey(v));
      }
      return false;
    };
    expect(hasEvidenceKey(body)).toBe(false);
  });
});
