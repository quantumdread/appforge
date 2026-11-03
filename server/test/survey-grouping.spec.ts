import { describe, expect, it } from 'vitest';
import type { Issue } from '../src/core/analyzer';
import type { SeverityClass } from '../src/core/rule-metadata';
import { RULE_METADATA } from '../src/core/rule-metadata';
import { groupIssues } from '../src/core/survey/grouping';
import { runLintRules } from '../src/lib/lint';
import { walkPaYaml } from '../src/lib/validator';

type ClassifiedIssue = Issue & { rule: string; severity: SeverityClass };

function delegationIssue(
  rule: string,
  authoredName: string,
  control: string,
): ClassifiedIssue {
  return {
    level: 'WARN',
    rule,
    severity: 'CORRECTNESS_RISK',
    file: 'Screens/Main.pa.yaml',
    line: 12,
    control,
    type: 'Gallery',
    property: 'Items',
    detail: 'delegation risk',
    evidence: {
      kind: 'bound-source',
      authoredName,
      backend: 'sharepoint',
      resolvedBy: 'explicit-input',
      confidence: 'high',
    },
  };
}

function colorIssue(literal: string, control: string): ClassifiedIssue {
  return {
    level: 'WARN',
    rule: 'repeated-color-literal',
    severity: 'MAINTAINABILITY',
    file: 'Screens/Main.pa.yaml',
    line: 24,
    control,
    type: 'Label',
    property: 'Color',
    detail: 'repeated color',
    evidence: { kind: 'color-literal', literal },
  };
}

function formulaIssue(identity: string, control: string): ClassifiedIssue {
  return {
    level: 'WARN',
    rule: 'duplicate-formula',
    severity: 'MAINTAINABILITY',
    file: 'Screens/Main.pa.yaml',
    line: 18,
    control,
    type: 'Label',
    property: 'Text',
    detail: 'duplicate formula',
    evidence: { kind: 'formula-identity', identity, occurrences: 2 },
  };
}

function versionIssue(file: string, control: string): ClassifiedIssue {
  return {
    level: 'WARN',
    rule: 'version-pin-in-control-type',
    severity: 'MAINTAINABILITY',
    file,
    line: 4,
    control,
    type: 'Button',
    detail: 'version pin',
  };
}

function singletonIssue(control: string, line: number): ClassifiedIssue {
  return {
    level: 'WARN',
    rule: 'a11y-tabindex-positive',
    severity: 'MAINTAINABILITY',
    file: 'Screens/Main.pa.yaml',
    line,
    control,
    type: 'Button',
    property: 'TabIndex',
    detail: 'positive tab index',
  };
}

describe('survey root-cause grouping', () => {
  it('groups two delegation findings on one authored source', () => {
    const groups = groupIssues([
      delegationIssue('delegation-firstn-on-source', 'Orders', 'galRecent'),
      delegationIssue('delegation-sharepoint-search', 'Orders', 'galSearch'),
    ], RULE_METADATA);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      group_id: '7ad3d2f510c70095',
      grouping_key: 'bound-source',
      key_value: 'bound-source:Orders',
      dominant_severity: 'CORRECTNESS_RISK',
    });
    expect(groups[0].members).toHaveLength(2);
  });

  it('keeps different authored sources in different groups', () => {
    const groups = groupIssues([
      delegationIssue('delegation-firstn-on-source', 'Orders', 'galOrders'),
      delegationIssue('delegation-firstn-on-source', 'Customers', 'galCustomers'),
    ], RULE_METADATA);

    expect(groups).toHaveLength(2);
    expect(new Set(groups.map(group => group.group_id)).size).toBe(2);
  });

  it('groups repeated colors by their declared literal', () => {
    const groups = groupIssues([
      colorIssue('RGBA(1, 2, 3, 1)', 'lblOne'),
      colorIssue('RGBA(1, 2, 3, 1)', 'lblTwo'),
      colorIssue('RGBA(9, 8, 7, 1)', 'lblThree'),
    ], RULE_METADATA);

    expect(groups).toHaveLength(2);
    expect(groups.map(group => [group.key_value, group.members.length])).toEqual(
      expect.arrayContaining([
        ['color-literal:RGBA(1, 2, 3, 1)', 2],
        ['color-literal:RGBA(9, 8, 7, 1)', 1],
      ]),
    );
  });

  it('groups formulas by the bounded cause key from causeKey', () => {
    const groups = groupIssues([
      formulaIssue('Filter(Orders,Status="Open")', 'lblOne'),
      formulaIssue('Filter(Orders,Status="Open")', 'lblTwo'),
    ], RULE_METADATA);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      grouping_key: 'formula-identity',
      key_value: 'formula-identity:8949163edf0c9199',
    });
  });

  it('groups version-pin findings per file', () => {
    const groups = groupIssues([
      versionIssue('Screens/Main.pa.yaml', 'btnOne'),
      versionIssue('Screens/Main.pa.yaml', 'btnTwo'),
      versionIssue('Screens/Admin.pa.yaml', 'btnThree'),
    ], RULE_METADATA);

    expect(groups).toHaveLength(2);
    expect(groups.map(group => [group.key_value, group.group_id, group.members.length])).toEqual(
      expect.arrayContaining([
        ['version-pin-in-control-type:Screens/Main.pa.yaml', '6bfbe56dee30944b', 2],
        ['version-pin-in-control-type:Screens/Admin.pa.yaml', 'a0b13133759fcef9', 1],
      ]),
    );
  });

  it('keeps unrelated file-grouped rules in distinct root causes', () => {
    const accessibility = {
      ...versionIssue('Screens/Main.pa.yaml', 'txtName'),
      rule: 'a11y-inputs-missing-accessiblelabel',
      type: 'TextInput',
      controls: ['txtName'],
      detail: 'missing accessible label',
    };
    const groups = groupIssues([
      versionIssue('Screens/Main.pa.yaml', 'btnOne'),
      accessibility,
    ], RULE_METADATA);

    expect(groups.map(group => [group.key_value, group.group_id])).toEqual(expect.arrayContaining([
      ['version-pin-in-control-type:Screens/Main.pa.yaml', '6bfbe56dee30944b'],
      ['a11y-inputs-missing-accessiblelabel:Screens/Main.pa.yaml', '58c7408b1f2c440b'],
    ]));
  });

  it('keeps none-key findings as fingerprint-keyed singletons', () => {
    const groups = groupIssues([
      singletonIssue('btnOne', 10),
      singletonIssue('btnTwo', 20),
    ], RULE_METADATA);

    expect(groups).toHaveLength(2);
    expect(groups.every(group => group.members.length === 1)).toBe(true);
    expect(new Set(groups.map(group => group.key_value)).size).toBe(2);
  });

  it('orders groups by dominant-severity precedence', () => {
    const uncertain = {
      ...delegationIssue('delegation-firstn-on-source', 'Uncertain', 'galUncertain'),
      severity: 'UNCERTAINTY' as const,
    };
    const correctness = delegationIssue(
      'delegation-sharepoint-search',
      'Shared',
      'galCorrectness',
    );
    const groups = groupIssues([
      uncertain,
      colorIssue('RGBA(1, 1, 1, 1)', 'lblMaintainability'),
      {
        ...delegationIssue('delegation-firstn-on-source', 'Performance', 'galPerformance'),
        severity: 'PERFORMANCE_RISK',
      },
      {
        ...delegationIssue('delegation-firstn-on-source', 'Shared', 'galInitiallyLow'),
        severity: 'UNCERTAINTY',
      },
      correctness,
      {
        ...singletonIssue('btnBlocked', 40),
        level: 'REFUSE',
        rule: 'formula-missing-equals',
        severity: 'BLOCK',
      },
    ], RULE_METADATA);

    expect(groups.map(group => group.dominant_severity)).toEqual([
      'BLOCK',
      'CORRECTNESS_RISK',
      'PERFORMANCE_RISK',
      'MAINTAINABILITY',
      'UNCERTAINTY',
    ]);
  });

  it('breaks equal-severity ties by descending member count', () => {
    const groups = groupIssues([
      delegationIssue('delegation-firstn-on-source', 'Few', 'galFew'),
      delegationIssue('delegation-firstn-on-source', 'Many', 'galManyOne'),
      delegationIssue('delegation-sharepoint-search', 'Many', 'galManyTwo'),
    ], RULE_METADATA);

    expect(groups.map(group => [group.key_value, group.members.length])).toEqual([
      ['bound-source:Many', 2],
      ['bound-source:Few', 1],
    ]);
  });

  it('breaks equal-severity, equal-count ties by ascending group id', () => {
    const groups = groupIssues([
      delegationIssue('delegation-firstn-on-source', 'Orders', 'galOrders'),
      delegationIssue('delegation-firstn-on-source', 'Customers', 'galCustomers'),
    ], RULE_METADATA);

    expect(groups.map(group => [group.key_value, group.group_id])).toEqual([
      ['bound-source:Customers', '0b6f02622b6367d3'],
      ['bound-source:Orders', '7ad3d2f510c70095'],
    ]);
  });
});

describe('color-literal evidence pipeline', () => {
  it('attaches the aggregated normalized literal at lint emission', () => {
    const controls = Array.from({ length: 5 }, (_, index) => `      - lbl${index}:
          Control: Label
          Properties:
            Color: =RGBA(12,   34, 56, 1)`).join('\n');
    const bundle = walkPaYaml(`Screens:
  Main:
    Children:
${controls}
`, 'Screens/Main.pa.yaml');

    const finding = runLintRules(bundle)
      .find(issue => issue.rule === 'repeated-color-literal');

    expect(finding?.evidence).toEqual({
      kind: 'color-literal',
      literal: 'RGBA(12, 34, 56, 1)',
    });
  });
});
