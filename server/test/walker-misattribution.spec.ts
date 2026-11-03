import { describe, it, expect } from 'vitest';
import { validateFiles, walkPaYaml, controlNodes } from '../src/lib/validator';

/**
 * D2 (2026-08-31 brownfield survey): a nested control whose sequence-item key the
 * walker failed to recognise did not open a frame of its own, so its `Control:`,
 * `Variant:` and whole `Properties:` block were attributed to the nearest
 * recognised ANCESTOR — manufacturing phantom `duplicate-property` REFUSEs on the
 * ancestor and mis-hosting every other per-property rule.
 *
 * The trigger is purely structural: the child key not matching the walker's
 * control-key pattern. Studio names data cards after the source column, so real
 * exports carry keys with spaces (`Ordered On_cardBeta`), which is a perfectly
 * legal plain YAML key. Catalog knowledge (unknown variant, dump-sourced parent)
 * plays no part in the trigger — it only decides which findings the leak then
 * manufactures.
 *
 * All names below are invented; the shape mirrors a real Studio export.
 */

// A dump-sourced `Form` ancestor with its own Width, holding a nested card whose
// key carries a space. The card repeats Width — a genuine property of the CARD.
const nestedCard = (childKey: string, variant = 'ComboBoxEdit') => `Screens:
  ScrDetail:
    Children:
      - frmAlpha:
          Control: Form
          Properties:
            Width: =461
            Y: =60
          Children:
            - ${childKey}
                Control: TypedDataCard
                Variant: ${variant}
                Properties:
                  DisplayName: ="Ordered on"
                  Width: =461
`;

describe('walker: nested control keys the walker must not fold into their ancestor', () => {
  it('parses a spaced (unquoted) child key as its own control, not the ancestor', () => {
    const nodes = [...controlNodes(walkPaYaml(nestedCard('Ordered On_cardBeta:'), 'a.pa.yaml'))];
    expect(nodes.map(n => n.name)).toEqual(['frmAlpha', 'Ordered On_cardBeta']);
    expect(nodes[0].type).toBe('Form');
    expect(nodes[0].properties.map(p => p.name)).toEqual(['Width', 'Y']);
    expect(nodes[1].type).toBe('TypedDataCard');
    expect(nodes[1].variant).toBe('ComboBoxEdit');
    expect(nodes[1].properties.map(p => p.name)).toEqual(['DisplayName', 'Width']);
    expect(nodes[1].parent).toBe(nodes[0]);
  });

  it.each([
    ["single-quoted", "'Ordered On_cardBeta':"],
    ["double-quoted", '"Ordered On_cardBeta":'],
    ['hyphenated', 'ordered-on-cardBeta:'],
    ['dotted', 'ordered.on.cardBeta:'],
    ['comment-suffixed', 'cardBeta: # data card'],
  ])('parses a %s child key as its own control', (_label, childKey) => {
    const nodes = [...controlNodes(walkPaYaml(nestedCard(childKey), 'a.pa.yaml'))];
    expect(nodes).toHaveLength(2);
    expect(nodes[0].type).toBe('Form');
    expect(nodes[0].properties.map(p => p.name)).toEqual(['Width', 'Y']);
    expect(nodes[1].type).toBe('TypedDataCard');
    expect(nodes[1].properties.map(p => p.name)).toEqual(['DisplayName', 'Width']);
  });

  it('counts the framed card in controls_seen (the leak undercounted it)', () => {
    const r = validateFiles([{ name: 'a.pa.yaml', content: nestedCard('Ordered On_cardBeta:') }]);
    expect(r.summary.controls_seen).toBe(2);
  });

  it('emits no phantom duplicate-property on the ancestor form', () => {
    const r = validateFiles([{ name: 'a.pa.yaml', content: nestedCard('Ordered On_cardBeta:') }]);
    expect(r.issues.filter(i => i.rule === 'duplicate-property')).toEqual([]);
  });

  // ComboBoxEdit is now extracted. An invented variant preserves this walker's
  // attribution test: exactly one finding on the card at its own line.
  it('attributes an unknown-variant refusal, once, to the card', () => {
    const r = validateFiles([{ name: 'a.pa.yaml', content: nestedCard('Ordered On_cardBeta:', 'FixtureUnknown') }]);
    const observed = r.issues.filter(i => i.rule === 'unknown-variant');
    expect(observed).toHaveLength(1);
    expect(observed[0].level).toBe('REFUSE');
    expect(observed[0].control).toBe('Ordered On_cardBeta');
    expect(observed[0].type).toBe('TypedDataCard');
    expect(observed[0].variant).toBe('FixtureUnknown');
    expect(observed[0].line).toBe(10);
  });

  it('keeps the unknown-variant REFUSE, once, attributed to the card', () => {
    const r = validateFiles([{ name: 'a.pa.yaml', content: nestedCard('Ordered On_cardBeta:', 'NotAVariantAnywhere') }]);
    const unknownVariant = r.issues.filter(i => i.rule === 'unknown-variant');
    expect(unknownVariant).toHaveLength(1);
    expect(unknownVariant[0].control).toBe('Ordered On_cardBeta');
    expect(unknownVariant[0].type).toBe('TypedDataCard');
    expect(unknownVariant[0].variant).toBe('NotAVariantAnywhere');
    expect(unknownVariant[0].line).toBe(10);
  });

  it('attributes no finding from the card to the ancestor form', () => {
    const r = validateFiles([{ name: 'a.pa.yaml', content: nestedCard('Ordered On_cardBeta:') }]);
    // Lines 13-15 are the card's own Properties block; nothing there may be
    // reported against the form.
    expect(r.issues.filter(i => i.control === 'frmAlpha' && i.line >= 12)).toEqual([]);
    // The form's own properties are still classified against Form (dump-sourced).
    const formIssues = r.issues.filter(i => i.control === 'frmAlpha');
    expect(formIssues.every(i => i.type === 'Form')).toBe(true);
  });

  it('still REFUSEs a GENUINE duplicate property on the ancestor itself', () => {
    const yaml = `Screens:
  ScrDetail:
    Children:
      - frmAlpha:
          Control: Form
          Properties:
            Width: =461
            Y: =60
            Width: =462
          Children:
            - Ordered On_cardBeta:
                Control: TypedDataCard
                Variant: ComboBoxEdit
                Properties:
                  DisplayName: ="Ordered on"
`;
    const r = validateFiles([{ name: 'a.pa.yaml', content: yaml }]);
    const dupes = r.issues.filter(i => i.rule === 'duplicate-property');
    expect(dupes).toHaveLength(1);
    expect(dupes[0].level).toBe('REFUSE');
    expect(dupes[0].control).toBe('frmAlpha');
    expect(dupes[0].property).toBe('Width');
    expect(dupes[0].detail).toContain('first at line 7');
  });

  it('still REFUSEs a GENUINE duplicate inside a known-variant card, attributed to the card', () => {
    const yaml = `Screens:
  ScrDetail:
    Children:
      - frmAlpha:
          Control: Form
          Properties:
            Width: =461
          Children:
            - Ordered On_cardBeta:
                Control: GroupContainer
                Variant: AutoLayout
                Properties:
                  Height: =120
                  Height: =121
`;
    const r = validateFiles([{ name: 'a.pa.yaml', content: yaml }]);
    expect(r.issues.some(i => i.rule === 'unknown-variant')).toBe(false);
    const dupes = r.issues.filter(i => i.rule === 'duplicate-property');
    expect(dupes).toHaveLength(1);
    expect(dupes[0].level).toBe('REFUSE');
    expect(dupes[0].control).toBe('Ordered On_cardBeta');
    expect(dupes[0].type).toBe('GroupContainer');
    expect(dupes[0].property).toBe('Height');
    expect(dupes[0].detail).toContain('first at line 13');
  });
});
