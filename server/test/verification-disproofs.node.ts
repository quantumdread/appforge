import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { appendDisproofs, matchDisproofs, readDisproofRows, validateDisproofIndex } from '../scripts/lib/verification-disproofs.mjs';

describe('verification disproof register', () => {
  it('reads every substantive table row with original whitespace and no line ending', () => {
    const row = '| `DatePicker.DefaultDate` | 2026-05-10 | compile_canvas rejection |  ';
    const semanticRow = '| SharePoint delegates IsBlank | docs | 2026-08-10 | documented-consensus | Not SQL |';
    const register = [
      '# Disproofs', '',
      '| Claim | Disproven | Evidence |',
      '|---|---|---|', row, '',
      '```md', '| not a table row |', '```', '',
      '| Claim | Believed where | Disproven | Evidence | Notes |',
      '|---|---|---|---|---|',
      semanticRow,
      '',
    ].join('\r\n');

    expect(readDisproofRows(register)).toEqual([
      { line: 5, text: row, row_sha256: createHash('sha256').update(row, 'utf8').digest('hex') },
      {
        line: 13,
        text: semanticRow,
        row_sha256: createHash('sha256').update(semanticRow, 'utf8').digest('hex'),
      },
    ]);
  });

  it.each([
    ['dangling data row', '| Claim | date | evidence |'],
    ['wrong row width', '| Claim | Date |\n|---|---|\n| claim | date | extra |'],
    ['borderless data under a supported header', '| Claim | Date |\n|---|---|\nclaim | date'],
    ['a row disguised as another header in the same table', '| Claim | Date |\n|---|---|\n| Camera.Zoom | 2026-05-10 |\n|---|---|'],
    ['a blockquoted table', '> | Claim | Date |\n> |---|---|\n> | Camera.Zoom | 2026-05-10 |'],
    ['a blockquoted borderless table', '> Claim | Date\n> ---|---\n> Camera.Zoom | 2026-05-10'],
    ['unsupported borderless table', 'Claim | Date\n---|---\nclaim | date'],
    ['unsupported indented table', '    | Claim | Date |\n    |---|---|\n    | claim | date |'],
    ['empty data row', '| Claim | Date |\n|---|---|\n| | |'],
    ['unclosed fence', '```md\n| ignored | content |'],
  ])('refuses %s instead of silently missing a substantive claim', (_label, register) => {
    expect(() => readDisproofRows(register)).toThrow();
  });

  it('does not accept an empty index for a quoted borderless disproof table', () => {
    const register = '> Claim | Date\n> ---|---\n> Camera.Zoom | 2026-05-10';
    const index = { schema: 'appforge-disproof-index/1', hash_algorithm: 'sha256', entries: [] };
    expect(() => validateDisproofIndex(register, index)).toThrow(expect.objectContaining({ code: 'unsupported-shape' }));
  });
});

describe('verification disproof additions', () => {
  it('appends a scoped property disproof and both index namespaces without changing prior bytes', () => {
    const register = '# Synthetic disproofs\r\n';
    const index = { schema: 'appforge-disproof-index/1', hash_algorithm: 'sha256', entries: [] };
    const addition = {
      id: 'synthetic-rejection', claim_ref: 'augmentation:TextInput.ProbeProperty',
      claim_text: 'Probe property | exists\nunder the tested control', date: '2026-09-08',
      evidence_class: 'compile_canvas', evidence_summary: 'synthetic invocation; file outcome; digest 123',
      reason: 'The isolated compiler rejected this exact property.',
    };
    const appended = appendDisproofs(register, index, [addition]);
    expect(appended.registerText.startsWith(register)).toBe(true);
    expect(appended.registerText).toContain('## Verification disproof additions\r\n');
    expect(appended.registerText).toContain('Probe property \\| exists<br>under the tested control');
    expect(readDisproofRows(appended.registerText)).toHaveLength(1);
    expect(validateDisproofIndex(appended.registerText, appended.index).entries).toHaveLength(2);
    expect(matchDisproofs(appended.index, 'augmentation:TextInput.ProbeProperty')).toHaveLength(1);
    expect(matchDisproofs(appended.index, 'dump-property:TextInput.ProbeProperty')).toHaveLength(1);
    expect(index.entries).toEqual([]);
    expect(appendDisproofs(appended.registerText, appended.index, [addition])).toEqual(appended);
  });

  it('adds multiple rows inside the dedicated section while preserving old rows, index records and later prose', () => {
    const oldRow = '| Old claim | 2026-01-01 | documented-consensus | retained |  ';
    const later = '\n\n## Later notes\n\nRetained exactly.\n';
    const register = '# Register\n\n## Verification disproof additions\n\n| Claim | Disproven | Evidence | Notes |\n|---|---|---|---|\n' + oldRow + later;
    const oldEntry = { id: 'old-claim', match: { kind: 'exact', claim_ref: 'rule:old-claim' }, row_sha256: createHash('sha256').update(oldRow).digest('hex') };
    const index = { schema: 'appforge-disproof-index/1', hash_algorithm: 'sha256', entries: [oldEntry] };
    const addition = { id: 'new-claim', claim_ref: 'rule:new-claim', claim_text: 'New claim', date: '2026-09-08',
      evidence_class: 'runtime_observation', evidence_summary: 'Synthetic evidence IDs and hashes.', reason: 'Falsified in a synthetic fixture.' };
    const appended = appendDisproofs(register, index, [addition,
      { ...addition, id: 'new-property', claim_ref: 'dump-property:TextInput.ProbeProperty' },
    ]);
    expect(appended.registerText.endsWith(later)).toBe(true);
    expect(appended.registerText.match(/## Verification disproof additions/gu)).toHaveLength(1);
    expect(readDisproofRows(appended.registerText).map(row => row.text)[0]).toBe(oldRow);
    expect(appended.index.entries[0]).toEqual(oldEntry);
    expect(appended.index.entries).toHaveLength(4);
    expect(readDisproofRows(appended.registerText)).toHaveLength(3);
  });

  it('refuses conflicting repeated evidence or an already-covered scoped claim', () => {
    const addition = { id: 'new-claim', claim_ref: 'rule:new-claim', claim_text: 'New claim', date: '2026-09-08',
      evidence_class: 'runtime_observation', evidence_summary: 'Synthetic evidence.', reason: 'Falsified in a synthetic fixture.' };
    const initial = appendDisproofs('# Register\n', { schema: 'appforge-disproof-index/1', hash_algorithm: 'sha256', entries: [] }, [addition]);
    expect(() => appendDisproofs(initial.registerText, initial.index, [{ ...addition, reason: 'Changed evidence meaning.' }]))
      .toThrow(expect.objectContaining({ code: 'disproof-conflict' }));
    expect(() => appendDisproofs(initial.registerText, initial.index, [{ ...addition, id: 'another-id' }]))
      .toThrow(expect.objectContaining({ code: 'disproof-conflict' }));
  });

  it.each(['invalid date', 'extra field', 'duplicate ID', 'duplicate heading', 'unsupported heading body', 'fenced heading'])(
    'refuses %s without returning a partly rewritten register', variant => {
      let register = '# Register\n';
      const addition = { id: 'new-claim', claim_ref: 'rule:new-claim', claim_text: 'New claim', date: '2026-09-08',
        evidence_class: 'runtime_observation', evidence_summary: 'Synthetic evidence.', reason: 'Falsified in a synthetic fixture.' };
      const additions = [addition];
      if (variant === 'invalid date') addition.date = '2026-02-30';
      if (variant === 'extra field') Object.assign(addition, { replacement: 'arbitrary' });
      if (variant === 'duplicate ID') additions.push({ ...addition });
      if (variant === 'duplicate heading') register += '## Verification disproof additions\n\n## Verification disproof additions\n';
      if (variant === 'unsupported heading body') register += '## Verification disproof additions\nUnstructured data.\n';
      if (variant === 'fenced heading') register += '```md\n## Verification disproof additions\n```\n';
      expect(() => appendDisproofs(register, { schema: 'appforge-disproof-index/1', hash_algorithm: 'sha256', entries: [] }, additions)).toThrow();
    },
  );
});

describe('verification disproof identity', () => {
  it('covers every shipped historical row without expanding generations or SQL claims', () => {
    const register = readFileSync(new URL('../../knowledge/disproofs.md', import.meta.url), 'utf8');
    const index = validateDisproofIndex(register, JSON.parse(readFileSync(new URL('../../knowledge/disproofs.index.json', import.meta.url), 'utf8')));
    expect(readDisproofRows(register)).toHaveLength(21);
    expect(index.entries).toHaveLength(38);
    expect(matchDisproofs(index, 'dump-property:Camera.Brightness')).toHaveLength(1);
    expect(matchDisproofs(index, 'augmentation:Classic/Toggle.ValueHoverFill')).toHaveLength(1);
    expect(matchDisproofs(index, 'augmentation:ModernDatePicker.DefaultDate')).toEqual([]);
    expect(matchDisproofs(index, 'rule:modern-text-input-onselect-extractor-declaration')).toHaveLength(1);
    expect(matchDisproofs(index, 'augmentation:ModernTextInput.OnSelect')).toEqual([]);
    expect(matchDisproofs(index, 'rule:delegation-sql-isblank')).toEqual([]);
    expect(matchDisproofs(index, 'rule:sharepoint-delegates-isblank')).toHaveLength(1);
  });

  it('matches exact generations and both property namespaces of reviewed prefix families', () => {
    const dateRow = '| DatePicker.DefaultDate | 2026-05-10 | compile_canvas |';
    const toggleRow = '| Classic/Toggle.Rail* | 2026-05-10 | compile_canvas |';
    const sqlRow = '| SharePoint delegates IsBlank | 2026-08-10 | documented-consensus |';
    const register = ['| Claim | Disproven | Evidence |', '|---|---|---|', dateRow, toggleRow, sqlRow].join('\n');
    const index = {
      schema: 'appforge-disproof-index/1', hash_algorithm: 'sha256', entries: [
        { id: 'classic-date', match: { kind: 'exact', claim_ref: 'augmentation:DatePicker.DefaultDate' }, row_sha256: createHash('sha256').update(dateRow).digest('hex') },
        { id: 'classic-toggle-rail', match: { kind: 'property-prefix', control: 'Classic/Toggle', prefix: 'Rail' }, row_sha256: createHash('sha256').update(toggleRow).digest('hex') },
        { id: 'sharepoint-isblank', match: { kind: 'exact', claim_ref: 'rule:sharepoint-delegates-isblank' }, row_sha256: createHash('sha256').update(sqlRow).digest('hex') },
      ],
    };
    expect(validateDisproofIndex(register, index)).toEqual(index);
    expect(matchDisproofs(index, 'augmentation:DatePicker.DefaultDate').map(entry => entry.id)).toEqual(['classic-date']);
    expect(matchDisproofs(index, 'augmentation:ModernDatePicker.DefaultDate')).toEqual([]);
    expect(matchDisproofs(index, 'augmentation:Classic/Toggle.RailFill').map(entry => entry.id)).toEqual(['classic-toggle-rail']);
    expect(matchDisproofs(index, 'dump-property:Classic/Toggle.RailHoverFill').map(entry => entry.id)).toEqual(['classic-toggle-rail']);
    expect(matchDisproofs(index, 'augmentation:Toggle.RailFill')).toEqual([]);
    expect(matchDisproofs(index, 'augmentation:Classic/Toggle.ValueFill')).toEqual([]);
    expect(matchDisproofs(index, 'rule:delegation-sql-isblank')).toEqual([]);
  });

  it.each(['unindexed row', 'stale hash', 'duplicate identical row', 'closed shape'])(
    'refuses %s before returning a usable disproof index', variant => {
      const row = '| Camera.Brightness | 2026-05-10 | compile_canvas |';
      let register = `| Claim | Date | Evidence |\n|---|---|---|\n${row}\n`;
      const index = {
        schema: 'appforge-disproof-index/1', hash_algorithm: 'sha256', entries: [
          { id: 'camera-brightness', match: { kind: 'exact', claim_ref: 'augmentation:Camera.Brightness' }, row_sha256: createHash('sha256').update(row).digest('hex') },
        ],
      };
      if (variant === 'unindexed row') register += '| SharePoint delegates IsBlank | 2026-08-10 | documented-consensus |\n';
      if (variant === 'stale hash') register = register.replace('Camera.Brightness', 'Camera.Contrast');
      if (variant === 'duplicate identical row') register += `${row}\n`;
      if (variant === 'closed shape') Object.assign(index, { bypass: true });
      expect(() => validateDisproofIndex(register, index)).toThrow();
    },
  );
});
