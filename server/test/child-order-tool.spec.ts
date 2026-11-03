import { describe, expect, it } from 'vitest';
import { compareChildOrderTool } from '../src/tools/child-order.js';

const files = (names: string[]) => [{ name: 'Home.pa.yaml', content: `Screens:\n  Home:\n    Children:\n${names.map(name => `      - ${name}:\n          Control: Label\n`).join('')}` }];
describe('compare_child_order MCP tool', () => {
  it('describes editor_render_risk and returns the new fields for a moved control', () => {
    expect(compareChildOrderTool.description).toContain('editor_render_risk');
    const expected = files(['A']);
    const actual = files(['A']).map(file => ({ ...file, content: file.content.replace('  Home:', '  Other:') }));
    const response = compareChildOrderTool.handler({ expected, actual });
    expect(response.isError).not.toBe(true);
    expect(JSON.parse(response.content[0].text)).toMatchObject({
      moved_between_containers: [{ name: 'A', expected_container: 'Home', actual_container: 'Other' }],
      type_changed: [],
      editor_render_risk: { moved: ['A'], retyped: [], descendants: [], controls: ['A'], advice: expect.any(String) },
    });
  });
  it('returns the structural result and a short summary', () => {
    const response = compareChildOrderTool.handler({ expected: files(['A', 'New', 'B']), actual: files(['A', 'B', 'New']) });
    expect(response.isError).not.toBe(true);
    const result = JSON.parse(response.content[0].text);
    expect(result).toMatchObject({ identical: false, containers: [{ status: 'reordered', appended_at_end: true }] });
    expect(result.human_summary).toContain('1 reordered');
  });
  it.each([
    { expected: [], actual: files(['A']) },
    { expected: files(['A']), actual: [] },
    { expected: [{ name: 'bad', content: 3 }], actual: files(['A']) },
  ])('rejects missing, empty or malformed bundles: %j', input => {
    expect(compareChildOrderTool.handler(input as any).isError).toBe(true);
  });
  it('rejects oversized combined content before parsing', () => {
    const response = compareChildOrderTool.handler({ expected: [{ name: 'a', content: 'x'.repeat(750_001) }], actual: [{ name: 'a', content: 'x'.repeat(750_000) }] });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('1.5 MB');
  });
  it('rejects excessive combined control count before parsing', () => {
    const response = compareChildOrderTool.handler({ expected: files(Array.from({ length: 2501 }, (_, i) => `C${i}`)), actual: files(Array.from({ length: 2500 }, (_, i) => `C${i}`)) });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('5000-control cap');
  });
  it('returns a tool error for unparseable source', () => {
    const response = compareChildOrderTool.handler({ expected: files(['A']), actual: [{ name: 'bad', content: '[broken' }] });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('actual: unable to parse');
  });
});
