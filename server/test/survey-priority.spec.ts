import { describe, expect, it } from 'vitest';
import {
  RULE_METADATA,
  type RemedyKind,
  type SeverityClass,
} from '../src/core/rule-metadata';
import { APP_TYPE, COMPONENT_DEFINITION_TYPE } from '../src/core/model';
import type { FindingConfidence } from '../src/core/survey/severity';
import {
  actionState,
  blastForGroup,
  compareRemediation,
  computePriority,
  effortClassForRemedy,
  groupConfidence,
  PRIORITY_APP_TYPE,
  PRIORITY_COMPONENT_DEFINITION_TYPE,
  priorityInputsForGroup,
  type PriorityCalculationInputs,
  type PriorityGroup,
  type PriorityGroupMember,
  type RemediationOrderItem,
} from '../src/core/survey/priority';
import {
  BAND_MIN,
  BLAST_RANGE,
  BLAST_W,
  CONFIDENCE_MULT,
  CONTROLS_SAT,
  EFFORT_MULT,
  mergePriorityWeights,
  PriorityWeightsError,
  SCREENS_SAT,
  SEVERITY_ORDINAL,
} from '../src/core/survey/priority-weights';

const maintainabilityInput: PriorityCalculationInputs = {
  severity: 'MAINTAINABILITY',
  confidence: 'medium',
  blast: { controls: 71, screens: 13 },
  effort_class: 'judgment',
  descriptor_coverage: 'none',
};

// Independent substance fixture: deliberately duplicates all 79 classifications
// so an incorrect registry edit must also change this separately reviewed table.
const EXPECTED_REMEDY_KIND = {
  'yaml-comment-truncates-formula': 'prose',
  'yaml-inline-comment-after-formula': 'prose',
  'component-input-called-as-function': 'prose',
  'addcolumns-string-column-name': 'prose',
  'sortbycolumns-on-added-column': 'prose',
  'select-parent-in-gallery': 'prose',
  'filter-constant-or-column': 'prose',
  'index-literal-position': 'prose',
  'modern-text-height-below-size': 'prose',
  'zero-guard-misses-blank': 'prose',
  'modern-text-width-below-text': 'prose',

  'formula-missing-equals': 'prose',
  'block-scalar-required': 'prose',
  'inline-formula-paste-hygiene': 'prose',
  'bare-color-name': 'prose',
  'enum-value-invalid': 'none',
  'duplicate-property': 'none',
  'unknown-control': 'none',
  'unknown-variant': 'none',
  'unknown-property': 'deterministic',
  'unknown-output-reference': 'prose',
  'layoutmaxwidth-collapses-children': 'prose',
  'pa2108-trap': 'prose',
  'duplicate-control-name': 'none',
  'custom-property-kind': 'prose',
  'event-return-type-required': 'prose',
  'output-property-default': 'prose',
  'input-property-empty-default': 'prose',
  'component-name-required': 'prose',
  'delegation-firstn-on-source': 'prose',
  'datagrid-pagination-none': 'prose',
  'datagrid-delegate-search-unused': 'prose',
  'delegation-forall-writes': 'prose',
  'delegation-search-caveat': 'prose',
  'delegation-sharepoint-search': 'prose',
  'delegation-sharepoint-in': 'prose',
  'delegation-sharepoint-isblank': 'prose',
  'delegation-sharepoint-text-functions': 'prose',
  'delegation-sharepoint-id-operator': 'prose',
  'delegation-sql-isblank': 'prose',
  'delegation-excel-any': 'prose',
  'a11y-interactive-not-focusable': 'human-value',
  'a11y-icon-button-no-label': 'human-value',
  'perf-lookup-in-gallery-template': 'prose',
  'perf-onstart-no-concurrent': 'prose',
  'perf-cross-screen-reference': 'prose',
  'perf-control-budget': 'prose',
  'heavy-onstart': 'prose',
  'duplicate-formula': 'prose',
  'duplicate-formula-in-gallery': 'prose',
  'repeated-color-literal': 'prose',
  'version-pin-in-control-type': 'deterministic',
  'superseded-control-type': 'deterministic',
  'new-control-superseded-type': 'deterministic',
  'a11y-tabindex-positive': 'human-value',
  'a11y-inputs-missing-accessiblelabel': 'human-value',
  'fillportions-with-fixed-size': 'prose',
  'missing-layout-min': 'prose',
  'missing-align-in-container': 'prose',
  'manual-group-may-stretch': 'none',
  'label-missing-wrap': 'prose',
  'scroll-child-fillportions': 'prose',
  'long-inline-formula': 'prose',
  'custom-property-datatype': 'prose',
  'event-default-recommended': 'prose',
  'component-root-property': 'none',
  'component-custom-property': 'prose',
  'materialized-property-kind': 'prose',
  'partial-catalog-data': 'none',
  'variant-unspecified-property': 'human-value',
  'unverified-augmentation': 'prose',
  'delegation-forall-truncation': 'prose',
  'app-onerror-missing': 'prose',
  'navigate-to-unknown-screen': 'prose',
  'unreachable-screen': 'prose',
  'write-followed-by-unconditional-navigation': 'prose',
  'submitform-navigation-not-in-onsuccess': 'prose',
  'form-without-failure-path': 'prose',
  'success-notification-not-gated': 'prose',
} as const satisfies Record<string, RemedyKind>;

function groupMember(overrides: Partial<PriorityGroupMember> = {}): PriorityGroupMember {
  return {
    level: 'WARN',
    rule: 'delegation-firstn-on-source',
    severity: 'CORRECTNESS_RISK',
    confidence: 'high',
    file: 'Screens/Main.pa.yaml',
    line: 12,
    control: 'galOrders',
    type: 'Gallery',
    property: 'Items',
    detail: 'delegation risk',
    ...overrides,
  };
}

describe('priority/1 worked examples', () => {
  // These are synthetic direct inputs from spec §4d. In particular, `high`
  // confidence and `mechanical` effort are unreachable end-to-end in v2.4.9.
  it.each([
    [{
      severity: 'MAINTAINABILITY',
      confidence: 'high',
      blast: { controls: 71, screens: 13 },
      effort_class: 'mechanical',
      descriptor_coverage: 'full',
    }, 50, 'next'],
    [{
      severity: 'CORRECTNESS_RISK',
      confidence: 'high',
      blast: { controls: 1, screens: 1 },
      effort_class: 'judgment',
      descriptor_coverage: 'none',
    }, 48, 'next'],
    [{
      severity: 'UNCERTAINTY',
      confidence: 'low',
      blast: { controls: 1, screens: 1 },
      effort_class: 'judgment',
      descriptor_coverage: 'none',
    }, 4, 'verify-first'],
    [{
      severity: 'BLOCK',
      confidence: 'low',
      blast: { controls: 0, screens: 0 },
      effort_class: 'unknown',
      descriptor_coverage: 'none',
    }, 100, 'now'],
  ] as const)('pins %#', (inputs, score, band) => {
    expect(computePriority(inputs)).toMatchObject({ score, band, formula: 'priority/1' });
  });
});

describe('priority weight policy', () => {
  it.each([
    { CONFIDENCE_MULT: { high: null } },
    { BLAST_W: { controls: Number.NaN } },
    { CONFIDENCE_MULT: { highest: 1 } },
    { NOT_A_PRIORITY_WEIGHT: 1 },
    { CONFIDENCE_MULT: [1, 2, 3] },
    { SEVERITY_ORDINAL: { BOGUS: 5 } },
    [1, 2, 3],
  ])('rejects malformed overrides with a typed error', overrides => {
    expect(PriorityWeightsError).toBeTypeOf('function');
    expect(() => mergePriorityWeights(overrides as never)).toThrow(PriorityWeightsError);
  });

  it('never leaks the caller override object: mutating it after merge changes nothing', () => {
    const overrides = { CONFIDENCE_MULT: { high: 0.5 } };
    const weights = mergePriorityWeights(overrides);

    overrides.CONFIDENCE_MULT.high = 99;

    expect(weights.CONFIDENCE_MULT.high).toBe(0.5);
  });

  it('declares every priority/1 default as inspectable data', () => {
    expect({
      SEVERITY_ORDINAL,
      CONFIDENCE_MULT,
      EFFORT_MULT,
      CONTROLS_SAT,
      SCREENS_SAT,
      BLAST_W,
      BLAST_RANGE,
      BAND_MIN,
    }).toEqual({
      SEVERITY_ORDINAL: {
        BLOCK: 100,
        CORRECTNESS_RISK: 80,
        PERFORMANCE_RISK: 55,
        MAINTAINABILITY: 30,
        UNCERTAINTY: 10,
      },
      CONFIDENCE_MULT: { high: 1, medium: 0.85, low: 0.6 },
      EFFORT_MULT: { mechanical: 1.15, mixed: 1.05, unknown: 1, judgment: 0.95 },
      CONTROLS_SAT: 100,
      SCREENS_SAT: 10,
      BLAST_W: { controls: 0.7, screens: 0.3 },
      BLAST_RANGE: { min: 0.5, span: 1 },
      BAND_MIN: { now: 60, next: 35 },
    });
  });

  it('deep-merges an override, honors it, and records the calculation inputs', () => {
    const inputs: PriorityCalculationInputs = {
      severity: 'CORRECTNESS_RISK',
      confidence: 'high',
      blast: { controls: 1, screens: 1 },
      effort_class: 'judgment',
      descriptor_coverage: 'none',
    };
    const weights = mergePriorityWeights({ CONFIDENCE_MULT: { high: 0.5 } });

    expect(weights.CONFIDENCE_MULT).toEqual({ high: 0.5, medium: 0.85, low: 0.6 });
    expect(computePriority(inputs, weights)).toEqual({
      band: 'later',
      score: 24,
      inputs: {
        ...inputs,
        blast: { ...inputs.blast, factor: 0.13513333825658158 },
      },
      formula: 'priority/1',
    });
  });

  it('keeps doctrine branches outside adversarial but valid overrides', () => {
    const weights = mergePriorityWeights({
      SEVERITY_ORDINAL: { BLOCK: 0, UNCERTAINTY: 100 },
      CONFIDENCE_MULT: { low: 10 },
      EFFORT_MULT: { judgment: 10, unknown: 10 },
      BLAST_RANGE: { min: 10, span: 10 },
      BAND_MIN: { now: -100, next: -200 },
    });

    expect(computePriority({
      severity: 'UNCERTAINTY',
      confidence: 'low',
      blast: { controls: 1, screens: 1 },
      effort_class: 'judgment',
      descriptor_coverage: 'none',
    }, weights)).toMatchObject({ band: 'verify-first', score: 100 });
    expect(computePriority({
      severity: 'BLOCK',
      confidence: 'low',
      blast: { controls: 1, screens: 1 },
      effort_class: 'unknown',
      descriptor_coverage: 'none',
    }, weights)).toMatchObject({ band: 'now', score: 100 });
  });
});

describe('priority calculation properties', () => {
  it('pins the v2.4.9 end-to-end-shaped result at 35/next', () => {
    expect(computePriority(maintainabilityInput)).toMatchObject({ score: 35, band: 'next' });
  });

  it('is non-strictly monotonic in each weighted input', () => {
    const scores = (inputs: PriorityCalculationInputs[]): number[] =>
      inputs.map(input => computePriority(input).score);
    const expectNonDecreasing = (values: number[]): void => {
      expect(values.every((value, index) => index === 0 || value >= values[index - 1])).toBe(true);
    };

    expectNonDecreasing(scores([0, 1, 10, 100, 1_000].map(controls => ({
      ...maintainabilityInput,
      blast: { ...maintainabilityInput.blast, controls },
    }))));
    expectNonDecreasing(scores([0, 1, 5, 10, 20].map(screens => ({
      ...maintainabilityInput,
      blast: { ...maintainabilityInput.blast, screens },
    }))));
    expectNonDecreasing(scores((['low', 'medium', 'high'] satisfies FindingConfidence[]).map(confidence => ({
      ...maintainabilityInput,
      confidence,
    }))));
    expectNonDecreasing(scores(([
      'judgment', 'unknown', 'mixed', 'mechanical',
    ] as const).map(effort_class => ({ ...maintainabilityInput, effort_class }))));
    expectNonDecreasing(scores(([
      'UNCERTAINTY', 'MAINTAINABILITY', 'PERFORMANCE_RISK', 'CORRECTNESS_RISK', 'BLOCK',
    ] satisfies SeverityClass[]).map(severity => ({ ...maintainabilityInput, severity }))));
  });

  it('saturates independently at the declared control and screen caps', () => {
    const controlCap = computePriority({
      ...maintainabilityInput,
      blast: { controls: CONTROLS_SAT, screens: 1 },
    });
    const beyondControlCap = computePriority({
      ...maintainabilityInput,
      blast: { controls: CONTROLS_SAT * 10, screens: 1 },
    });
    const screenCap = computePriority({
      ...maintainabilityInput,
      blast: { controls: 1, screens: SCREENS_SAT },
    });
    const beyondScreenCap = computePriority({
      ...maintainabilityInput,
      blast: { controls: 1, screens: SCREENS_SAT * 10 },
    });

    expect(beyondControlCap.inputs.blast.factor).toBe(controlCap.inputs.blast.factor);
    expect(beyondControlCap.score).toBe(controlCap.score);
    expect(beyondScreenCap.inputs.blast.factor).toBe(screenCap.inputs.blast.factor);
    expect(beyondScreenCap.score).toBe(screenCap.score);
  });
});

describe('group priority inputs', () => {
  it('uses the lowest confidence among only the dominant-severity members', () => {
    const group: PriorityGroup = {
      dominant_severity: 'CORRECTNESS_RISK',
      members: [
        groupMember({ severity: 'MAINTAINABILITY', confidence: 'low' }),
        groupMember({ control: 'galHigh', confidence: 'high' }),
        groupMember({ control: 'galMedium', confidence: 'medium' }),
      ],
    };

    expect(groupConfidence(group)).toBe('medium');
  });

  it('counts every aggregate offender and distinct touched screen', () => {
    const group: PriorityGroup = {
      dominant_severity: 'MAINTAINABILITY',
      members: [
        groupMember({
          rule: 'a11y-inputs-missing-accessiblelabel',
          severity: 'MAINTAINABILITY',
          controls: ['txtName', 'txtEmail'],
        }),
        groupMember({
          rule: 'a11y-icon-button-no-label',
          severity: 'MAINTAINABILITY',
          file: 'Screens/Detail.pa.yaml',
          control: 'icoClose',
        }),
      ],
    };

    expect(blastForGroup(group, 7, new Map([
      ['galOrders', 'Main'],
      ['icoClose', 'Detail'],
    ]))).toEqual({ controls: 3, screens: 2 });
  });

  it('counts distinct screens rather than files for findings in a multi-screen file', () => {
    const group: PriorityGroup = {
      dominant_severity: 'MAINTAINABILITY',
      members: [
        groupMember({ control: 'lblOne' }),
        groupMember({ control: 'lblTwo' }),
      ],
    };

    expect(blastForGroup(group, 7, new Map([
      ['lblOne', 'First'],
      ['lblTwo', 'Second'],
    ]))).toEqual({ controls: 2, screens: 2 });
    expect(blastForGroup(group, 7, new Map([
      ['lblOne', 'First'],
      ['lblTwo', 'First'],
    ]))).toEqual({ controls: 2, screens: 1 });
  });

  it.each([
    ['__App', 'App.pa.yaml'],
    ['__ComponentDefinition', 'Components/Picker.pa.yaml'],
  ])('uses app-wide screen count and at least one control for %s scope', (type, file) => {
    const group: PriorityGroup = {
      dominant_severity: 'PERFORMANCE_RISK',
      members: [groupMember({ type, file, control: 'App', controls: [] })],
    };

    expect(blastForGroup(group, 6, new Map())).toEqual({ controls: 1, screens: 6 });
  });

  it('pins priority scope literals to the shared model constants', () => {
    expect(PRIORITY_APP_TYPE).toBe(APP_TYPE);
    expect(PRIORITY_COMPONENT_DEFINITION_TYPE).toBe(COMPONENT_DEFINITION_TYPE);
  });

  it.each([
    ['deterministic', 'judgment'],
    ['human-value', 'judgment'],
    ['prose', 'judgment'],
    ['none', 'unknown'],
  ] as const)('derives %s remedies as %s while descriptor coverage is none', (kind, expected) => {
    expect(effortClassForRemedy(kind satisfies RemedyKind)).toBe(expected);
  });

  it('assembles the complete end-to-end group input shape', () => {
    const group: PriorityGroup = {
      dominant_severity: 'MAINTAINABILITY',
      members: Array.from({ length: 71 }, (_, index) => groupMember({
        rule: 'repeated-color-literal',
        severity: 'MAINTAINABILITY',
        confidence: 'medium',
        file: `Screens/Screen${index % 13}.pa.yaml`,
        control: `label${index}`,
      })),
    };

    const screenByControl = new Map(group.members.map((member, index) => [
      member.control,
      `Screen${index % 13}`,
    ]));
    expect(priorityInputsForGroup(group, 'prose', 13, screenByControl))
      .toEqual(maintainabilityInput);
  });
});

describe('registry remedy classification', () => {
  it('matches the independent full 79-rule fixture', () => {
    expect(Object.keys(EXPECTED_REMEDY_KIND)).toHaveLength(79);
    expect(Object.fromEntries(
      Object.entries(RULE_METADATA).map(([id, metadata]) => [id, metadata.remedyKind]),
    )).toEqual(EXPECTED_REMEDY_KIND);
  });
});

describe('remediation ordering', () => {
  it('orders band-major even when verify-first has the higher score', () => {
    const rows: RemediationOrderItem[] = [
      { group_id: 'uncertain', band: 'verify-first', score: 100, severity: 'UNCERTAINTY' },
      { group_id: 'urgent', band: 'now', score: 82, severity: 'CORRECTNESS_RISK' },
      { group_id: 'next', band: 'next', score: 99, severity: 'CORRECTNESS_RISK' },
      { group_id: 'later', band: 'later', score: 100, severity: 'MAINTAINABILITY' },
    ];

    expect(rows.sort(compareRemediation).map(row => row.group_id)).toEqual([
      'urgent', 'uncertain', 'next', 'later',
    ]);
  });

  it('puts BLOCK first within now before score and group id tie-breaks', () => {
    const rows: RemediationOrderItem[] = [
      { group_id: 'a-correctness', band: 'now', score: 100, severity: 'CORRECTNESS_RISK' },
      { group_id: 'z-block', band: 'now', score: 100, severity: 'BLOCK' },
      { group_id: 'b-lower', band: 'now', score: 90, severity: 'CORRECTNESS_RISK' },
      { group_id: 'c-lower', band: 'now', score: 90, severity: 'PERFORMANCE_RISK' },
    ];

    expect(rows.sort(compareRemediation).map(row => row.group_id)).toEqual([
      'z-block', 'a-correctness', 'b-lower', 'c-lower',
    ]);
  });
});

describe('action_state', () => {
  it('derives each homogeneous state', () => {
    expect(actionState([groupMember()])).toEqual({ action_state: 'active' });
    expect(actionState([groupMember({ baseline_status: 'accepted' })])).toEqual({
      action_state: 'accepted',
    });
    expect(actionState([groupMember({ suppressed_by: 'policy-1' })])).toEqual({
      action_state: 'suppressed',
    });
  });

  it('records accepted and suppressed counts for a mixture', () => {
    expect(actionState([
      groupMember({ control: 'active' }),
      groupMember({ control: 'accepted', baseline_status: 'accepted' }),
      groupMember({ control: 'suppressed', suppressed_by: 'policy-1' }),
    ])).toEqual({
      action_state: 'mixed',
      accepted_count: 1,
      suppressed_count: 1,
    });
  });

  it('classifies a member that is both accepted and suppressed as suppressed', () => {
    expect(actionState([
      groupMember({ control: 'active' }),
      groupMember({
        control: 'both',
        baseline_status: 'accepted',
        suppressed_by: 'policy-1',
      }),
    ])).toEqual({
      action_state: 'mixed',
      accepted_count: 0,
      suppressed_count: 1,
    });
  });

  it('keeps a BLOCK group active regardless of impossible annotations', () => {
    expect(actionState([groupMember({
      level: 'REFUSE',
      rule: 'formula-missing-equals',
      severity: 'BLOCK',
      baseline_status: 'accepted',
      suppressed_by: 'policy-1',
    })])).toEqual({ action_state: 'active' });
  });

  it('does not mutate priority or severity while deriving annotations', () => {
    const priority = computePriority(maintainabilityInput);
    const before = structuredClone(priority);
    const member = groupMember({ severity: 'MAINTAINABILITY', baseline_status: 'accepted' });

    actionState([member]);

    expect(priority).toEqual(before);
    expect(member.severity).toBe('MAINTAINABILITY');
  });
});
