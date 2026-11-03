import { verificationFixture } from './helpers/verification-fixture';
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inspectVerificationRepro } from '../scripts/lib/verification-repro.mjs';

const { artifact } = verificationFixture();
const yaml = 'Screens:\n  VerificationScreen:\n    Children:\n      - ctlProbe:\n          Control: Gallery\n          Properties:\n            WrapCount: =1\n';
const claim = {
  claim_ref: 'augmentation:Gallery.WrapCount', claim_scope: 'compiler_accepts',
  claim_text: 'Gallery accepts WrapCount with the reviewed numeric input.',
  falsifier: { description: 'Compile this exact input.', unfalsified_if: 'Accepted.', falsified_if: 'The exact property is rejected.' },
  prerequisites: [], expected_compile_outcome: 'accept',
  target: { kind: 'augmentation-property', control: 'Gallery', property: 'WrapCount', property_type: 'Number', property_value: '=1' },
  reproduction: 'Compile the reviewed probe.', local_lint_context: { datasources: {} }, ancestors: [], repro: null,
};

describe('reviewed verification repro boundary', () => {
  it('preserves explicitly captured block-scalar properties while refusing plain continuations', async () => {
    const blockYaml = yaml.replace('WrapCount: =1', 'WrapCount: |-\n              =1')
      + '            OnSelect: |-\n              =Set(a,1);\n              Back()\n';
    const result = await inspectVerificationRepro({ claim, yaml: blockYaml, analyzerArtifactPath: artifact,
      analyzerArtifactSha256: createHash('sha256').update(readFileSync(artifact)).digest('hex') });
    expect(result.summary).toMatchObject({ controls_seen: 1, refuse: 0 });
  });
  it('accepts the declared minimum ancestor chain and exact observed variant', async () => {
    const nestedYaml = 'Screens:\n  VerificationScreen:\n    Children:\n      - ctlParent1:\n          Control: Form\n          Children:\n            - ctlProbe:\n                Control: TypedDataCard\n                Variant: TextualEdit\n';
    const nestedClaim = { ...claim, claim_ref: 'variant:TypedDataCard.TextualEdit',
      target: { kind: 'observed-variant', control: 'TypedDataCard', variant: 'TextualEdit' },
      ancestors: [{ name: 'ctlParent1', control: 'Form' }],
    };
    const options = { claim: nestedClaim, yaml: nestedYaml, analyzerArtifactPath: artifact,
      analyzerArtifactSha256: createHash('sha256').update(readFileSync(artifact)).digest('hex') };
    const result = await inspectVerificationRepro(options);
    expect(result.summary).toMatchObject({ controls_seen: 2, refuse: 0 });
    await expect(inspectVerificationRepro({ ...options, yaml: nestedYaml.replace('Variant: TextualEdit', 'Variant: TextualEdit\n                Variant: TextualEdit') }))
      .rejects.toMatchObject({ code: 'evidence-mismatch' });
    await expect(inspectVerificationRepro({ ...options, claim: { ...nestedClaim, ancestors: [] } }))
      .rejects.toMatchObject({ code: 'evidence-mismatch' });
  });

  it.each(['TextualEdit extra', 'TextualEdit\n                  extra'])('refuses trailing variant scalar content %s', async variant => {
    const nestedYaml = `Screens:\n  VerificationScreen:\n    Children:\n      - ctlParent1:\n          Control: Form\n          Children:\n            - ctlProbe:\n                Control: TypedDataCard\n                Variant: ${variant}\n`;
    await expect(inspectVerificationRepro({ claim: { ...claim, claim_ref: 'variant:TypedDataCard.TextualEdit',
      target: { kind: 'observed-variant', control: 'TypedDataCard', variant: 'TextualEdit' },
      ancestors: [{ name: 'ctlParent1', control: 'Form' }] }, yaml: nestedYaml,
      analyzerArtifactPath: artifact, analyzerArtifactSha256: createHash('sha256').update(readFileSync(artifact)).digest('hex') }))
      .rejects.toMatchObject({ code: 'evidence-mismatch' });
  });

  it('retains the real catalog refusal from another authored property in the exact repro', async () => {
    const result = await inspectVerificationRepro({ claim, yaml: `${yaml}            UnreviewedUnknownProperty: =1\n`,
      analyzerArtifactPath: artifact, analyzerArtifactSha256: createHash('sha256').update(readFileSync(artifact)).digest('hex') });
    expect(result.summary.refuse).toBeGreaterThan(0);
  });
  it('refuses an artifact whose actual bytes do not match the reviewed hash', async () => {
    await expect(inspectVerificationRepro({
      claim, yaml, analyzerArtifactPath: artifact, analyzerArtifactSha256: '0'.repeat(64),
    })).rejects.toMatchObject({ code: 'evidence-mismatch' });
  });

  it('records the actual analyzer gate for the exact reviewed probe', async () => {
    const artifactHash = createHash('sha256').update(readFileSync(artifact)).digest('hex');
    await expect(inspectVerificationRepro({
      claim, yaml, analyzerArtifactPath: artifact, analyzerArtifactSha256: artifactHash,
    })).resolves.toEqual({
      summary: { pass: 1, warn: 1, refuse: 0, controls_seen: 1 },
      rule_ids: ['a11y-inputs-missing-accessiblelabel'],
    });
  });

  it.each([
    ['different property', yaml.replace('WrapCount: =1', 'TemplateFill: =RGBA(0, 0, 0, 1)')],
    ['different value', yaml.replace('WrapCount: =1', 'WrapCount: =2')],
    ['different type', yaml.replace('Control: Gallery', 'Control: Label')],
    ['different probe', yaml.replace('ctlProbe:', 'ctlOther:')],
    ['different screen', yaml.replace('VerificationScreen:', 'OtherScreen:')],
    ['duplicate targeted property', yaml.replace('WrapCount: =1', 'WrapCount: =1\n            WrapCount: =1')],
    ['undeclared sibling', `${yaml}      - ctlOther:\n          Control: Label\n          Properties:\n            Text: ="Other"\n`],
  ])('refuses %s even when the operator labels it as the original claim', async (_label, differentYaml) => {
    const artifactHash = createHash('sha256').update(readFileSync(artifact)).digest('hex');
    await expect(inspectVerificationRepro({
      claim, yaml: differentYaml, analyzerArtifactPath: artifact, analyzerArtifactSha256: artifactHash,
    })).rejects.toMatchObject({ code: 'evidence-mismatch' });
  });

  it.each([
    ['duplicate Control declaration', yaml.replace('Control: Gallery', 'Control: Label\n          Control: Gallery')],
    ['pinned control', yaml.replace('Control: Gallery', 'Control: Gallery@2.15.0')],
    ['duplicate Screens section', `Screens:\n${yaml}`],
    ['hidden top-level input', `Unreviewed: =true\n${yaml}`],
    ['duplicate Properties block hiding the claim from YAML', `${yaml}          Properties:\n            TemplateFill: =RGBA(0,0,0,1)\n`],
    ['misindented extra Control declaration', yaml.replace('Control: Gallery', 'Control: Label\n           Control: Gallery')],
    ['non-bare trailing control input', yaml.replace('Control: Gallery', 'Control: Gallery extra')],
    ['quoted duplicate Properties key', `${yaml}          "Properties":\n            TemplateFill: =RGBA(0,0,0,1)\n`],
    ['probe outside screen Children', yaml.replace('    Children:', '    UnreviewedSection:')],
    ['quoted duplicate screen Children', `${yaml}    "Children": []\n`],
    ['quoted duplicate targeted property', `${yaml}            "WrapCount": =2\n`],
    ['single-quoted duplicate targeted property', `${yaml}            'WrapCount': =2\n`],
    ['plain property continuation', `${yaml}              + 2\n`],
    ['plain control continuation', yaml.replace('Control: Gallery', 'Control: Gallery\n            extra')],
    ['extra misindented wrapper', yaml.replace('    Children:', '   Children:\n    Children:')],
  ])('refuses ambiguous authored shape: %s', async (_label, differentYaml) => {
    await expect(inspectVerificationRepro({ claim, yaml: differentYaml,
      analyzerArtifactPath: artifact, analyzerArtifactSha256: createHash('sha256').update(readFileSync(artifact)).digest('hex'),
    })).rejects.toMatchObject({ code: 'evidence-mismatch' });
  });

  it.each([
    ['unknown control', { ...claim, claim_ref: 'augmentation:UnknownProbe.WrapCount', target: { ...claim.target, control: 'UnknownProbe' } }, yaml.replace('Gallery', 'UnknownProbe')],
    ['wrong overlay type', { ...claim, target: { ...claim.target, property_type: 'Text' } }, yaml],
    ['wrong dump tier', { ...claim, claim_ref: 'dump-property:Gallery.WrapCount', target: { kind: 'dump-property', control: 'Gallery', property: 'WrapCount', property_value: '=1' } }, yaml],
  ])('refuses unsupported catalog claim: %s', async (_label, differentClaim, differentYaml) => {
    await expect(inspectVerificationRepro({ claim: differentClaim, yaml: differentYaml,
      analyzerArtifactPath: artifact, analyzerArtifactSha256: createHash('sha256').update(readFileSync(artifact)).digest('hex'),
    })).rejects.toMatchObject({ code: 'unsupported-shape' });
  });
});
