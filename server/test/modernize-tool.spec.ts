import { describe, expect, it } from 'vitest';
import { modernizeControlsTool } from '../src/tools/modernize';

const content = 'Screens:\n  Home:\n    Children:\n      - greeting:\n          Control: Label\n          Properties:\n            Text: ="Hi"\n';
describe('modernize_controls MCP', () => {
  it('returns the complete converted file set, report and one-line summary', () => {
    const input = { files: [{ name: 'Home.pa.yaml', content }, { name: '_EditorState.pa.yaml', content: 'ScreensOrder:\n  - Home\n' }] };
    const response = modernizeControlsTool.handler(input);
    expect(response.isError).not.toBe(true);
    expect(JSON.parse(response.content[0].text)).toMatchObject({ files: [{ name: 'Home.pa.yaml', content: content.replace('Label', 'ModernText') + '            PaddingTop: =0\n            PaddingBottom: =0\n            VerticalAlign: =VerticalAlign.Middle\n' }, input.files[1]], report: { summary: { converted: 1 } }, human_summary: expect.stringContaining('compare_child_order') });
  });
  it.each([
    null, {}, { files: [] },
    { files: [{ name: '../Home.pa.yaml', content }] },
    { files: [{ name: 'Home.pa.yaml', content }, { name: 'home.pa.yaml', content }] },
    { files: [{ name: 'Home.pa.yaml', content, extra: true }] },
    { files: [{ name: 'Home.pa.yaml', content }], types: 'Label' },
    { files: [{ name: 'Home.pa.yaml', content }], controls: [''] },
    { files: [{ name: 'Home.pa.yaml', content }], include_review: 'true' },
    { files: [{ name: 'Home.pa.yaml', content }], submit_envelope: true },
    { files: Array.from({ length: 513 }, (_, index) => ({ name: `${index}.pa.yaml`, content: '' })) },
    { files: [{ name: 'Home.pa.yaml', content: ' '.repeat(1_500_001) }] },
    { files: [{ name: 'x'.repeat(1025), content }] },
    { files: Array.from({ length: 100 }, (_, index) => ({ name: `${index}${'x'.repeat(700)}.pa.yaml`, content: '' })) },
    { files: [{ name: 'Home.pa.yaml', content: 'Control: Label\n'.repeat(5001) }] },
  ])('rejects invalid or oversized input without returning a partial file set', input => {
    const response = modernizeControlsTool.handler(input);
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('Modernization error:');
  });
  it('canonicalizes survey-compatible portable file names and applies filters', () => {
    const response = modernizeControlsTool.handler({ files: [{ name: '.\\Screens//Home.pa.yaml', content }], types: ['Classic/Button'] });
    expect(response.isError).not.toBe(true);
    expect(JSON.parse(response.content[0].text)).toMatchObject({ files: [{ name: 'Screens/Home.pa.yaml', content }], report: { summary: { converted: 0 } } });
  });
});
