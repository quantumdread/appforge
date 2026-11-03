import { expect, it } from 'vitest';
import { renameControlsTool } from '../src/tools/rename';
const files = [{ name: 'Home.pa.yaml', content: 'Screens:\n  Home:\n    Children:\n      - Label1:\n          Control: Label\n          Properties:\n            Text: ="Title"\n' }];
it('proposes without applying and applies only an explicit map with complete output', () => {
  const proposal = renameControlsTool.handler({ files, mode: 'propose', screen_prefix: 'auto' });
  expect(proposal.isError).toBeUndefined();
  expect(JSON.parse(proposal.content[0].text).proposals).toMatchObject([{ old: 'Label1', new: 'lblTitle' }]);
  const applied = renameControlsTool.handler({ files, mode: 'apply', renames: { Label1: 'lblHeading' } });
  expect(applied.isError).toBeUndefined();
  expect(JSON.parse(applied.content[0].text).files[0].content).toContain('- lblHeading:');
});
it.each([
  { files, mode: 'apply' }, { files, mode: 'wrong' }, { files, mode: 'apply', renames: [] },
  { files, mode: 'propose', screen_prefix: 'true' }, { files, mode: 'propose', unknown: true },
  { files, mode: 'propose', renames: { Label1: 'lblHeading' } }, { files: [...files, ...files], mode: 'propose' },
  { files: [{ name: '../a', content: '' }], mode: 'propose' },
  { files: [{ name: 'a', content: 'x'.repeat(1_500_001) }], mode: 'propose' },
])('rejects invalid input without tenant access', input => expect(renameControlsTool.handler(input).isError).toBe(true));
