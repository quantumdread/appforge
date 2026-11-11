import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkContent, main, parseDescribe, previousContent } from '../../cli/extractor.mjs';
import { parseManifest, parseProperties } from '../scripts/lib/catalog-source.mjs';

const capturedNames = ['ModernAvatar', 'Rectangle', 'ModernDataGridColumn', 'Form', 'Star', 'Triangle'];
const fixture = (name: string, generation = '2026-09-09') => readFileSync(resolve(__dirname, 'fixtures/extractor',
  /^(unrecognised|empty-input|garbage-control-properties)\.txt$/.test(name) ? '' : generation, name), 'utf8');
const names = ['Rectangle', 'ModernAvatar', 'ModernDataGridColumn', 'GroupContainer'];
const goodRun = () => {
  const controls = names.map(name => parseDescribe(fixture(`${name}.txt`)).c);
  const enums = {};
  for (const c of controls) {
    for (const bundle of [c.baseInput, ...Object.values(c.variantInput), ...Object.values(c.parentContext)]) {
      for (const value of Object.values(bundle)) {
        if (value && typeof value === 'object' && '_enum' in value) enums[value._enum] = value._values;
      }
    }
  }
  return { controls, enums };
};

describe('current authoring describe format', () => {
  it.each(capturedNames)('preserves %s control records across capture generations', name => {
    // Enum values are sets; the service now sorts the previously inline
    // parent-context enum. Preserve every name/value, ignoring that order only.
    const record = (generation: string) => JSON.parse(JSON.stringify(
      parseDescribe(fixture(`${name}.txt`, generation)).c,
      (key, value) => key === '_values' ? [...value].sort() : value,
    ));
    expect(record('current')).toEqual(record('2026-09-09'));
  });

  it.each([
    ['Default: Mode.First', 'Enum values: First, Second', 'Required: true', 'Enum name: Mode'],
    ['Enum name: Mode', 'Required: false', 'Default: Mode.Second', 'Enum values: First, Second'],
  ])('reads property metadata independently of its order: %j', (...metadata) => {
    const { c, unknownMetadataKeys, defaultsSeen } = parseDescribe(
      '# Control Example\nInput Properties:\n  - Mode: Enum\n'
      + metadata.map(line => `      ${line}\n`).join('')
      + '      FutureKey: future\n  - Width: Number\n      Default: 64\n',
    );
    expect(c.baseInput).toEqual({ Mode: { _enum: 'Mode', _values: ['First', 'Second'] }, Width: 'Number' });
    expect(unknownMetadataKeys).toEqual(['FutureKey']);
    expect(defaultsSeen).toBe(2);
  });

  it('ends unnamed enum blocks before siblings, blanks and new headings', () => {
    const { c } = parseDescribe('# Control Example\nInput Properties:\n'
      + '  - Missing: Enum\n  - Width: Number\n      Default: 64\n'
      + '  - AlsoMissing: Enum\n\nOutput Properties:\n  - Height: Number\n');
    expect(c.baseInput).toEqual({ Missing: 'Enum', Width: 'Number', AlsoMissing: 'Enum' });
    expect(c.output).toEqual(['Height']);
  });

  it.each([
    ['Form', ['Classic', 'Modern']],
    ['Triangle', ['RightAngled']],
    ['Star', ['12Points', '5Points', '6Points', '8Points']],
  ])('preserves the exact captured variant vocabulary for %s', (name, variants) => {
    const { c, error } = parseDescribe(fixture(`${name}.txt`));
    expect(error).toBeNull();
    expect(c.variants).toEqual(variants);
  });

  it.each(['input', 'variant'])('preserves named enums after Required metadata in %s properties', section => {
    // Observed 2026-09-20 on Classic/Icon.Icon and
    // GroupContainer.AutoLayout.LayoutDirection. Keep the following property
    // to detect lookahead consuming a sibling while reading enum metadata.
    const response = '# Control GroupContainer\nPart of the control family Classic.\n'
      + 'The `Variant` keyword is required and must be one of the following:\n- `AutoLayout`\n'
      + 'Input Properties:\n  - Width: Number\n'
      + (section === 'variant' ? 'Additional input properties for variant `AutoLayout`:\n' : '')
      + '  - LayoutDirection: Enum\n      Required: true\n      Enum name: LayoutDirection\n'
      + '      Enum values: Horizontal, Vertical\n  - LayoutGap: Number\n';
    const { c, error } = parseDescribe(response);
    expect(error).toBeNull();
    const properties = section === 'variant' ? c.variantInput.AutoLayout : c.baseInput;
    expect(properties.LayoutDirection).toEqual({ _enum: 'LayoutDirection', _values: ['Horizontal', 'Vertical'] });
    expect(properties.LayoutGap).toBe('Number');
  });

  it('extracts the control identity, properties and twelve variants instead of creation keywords', () => {
    const { c } = parseDescribe(fixture('ModernDataGridColumn.txt'));
    expect(c.type).toBe('ModernDataGridColumn');
    expect(c.family).toBe('React');
    expect(c.variants).toEqual(['Boolean', 'Button', 'ComplexOptionSet', 'ComplexType', 'Currency', 'DateTime', 'Email', 'Image', 'Number', 'Phone', 'Textual', 'Url']);
    expect(c.baseInput).toEqual({ ContentLanguage: 'Text', FieldDisplayName: 'Text', FieldName: 'Text', FieldVariantName: 'Text', Visible: 'Boolean', Width: 'Number' });
    expect(c.variantInput.Button.OnSelect).toBe('Event');
    expect(c.variantInput.Boolean.DisplayType).toEqual({ _enum: 'BooleanDisplay', _values: ['Checkbox', 'Text', 'Toggle'] });
    expect(c.parentContext.grid_layout_child).toHaveProperty('LayoutGridColumnStart', 'Number');
    expect(c.parentContext.vertical_horizontal_autolayout_child.AlignInContainer._values).toContain('Stretch');
    expect(c.output).toEqual(['ContentLanguage', 'FieldDisplayName', 'Visible', 'Width']);
  });

  it('preserves a simple control, named enums, event retagging and CRLF support', () => {
    const text = fixture('Rectangle.txt');
    const parsed = parseDescribe(text);
    expect(parsed).toEqual(parseDescribe(text.replace(/\r?\n/g, '\r\n')));
    expect(parsed.error).toBeNull();
    expect(parsed.c).toMatchObject({ type: 'Rectangle', family: 'Classic', variants: [], baseInput: {
      Width: 'Number', OnSelect: 'Event', BorderStyle: { _enum: 'BorderStyle', _values: ['Dashed', 'Dotted', 'None', 'Solid'] },
    } });
    expect(Object.keys(parsed.c.baseInput)).toHaveLength(20);
    expect(Object.keys(parsed.c.parentContext.grid_layout_child)).toHaveLength(4);
    expect(Object.keys(parsed.c.parentContext.vertical_horizontal_autolayout_child)).toHaveLength(6);
    expect(parsed.c.baseInput).not.toHaveProperty('LayoutGridColumnStart');
  });

  it.each(['unrecognised.txt', 'empty-input.txt'])('reports an unrecognised response: %s', file => {
    expect(parseDescribe(fixture(file)).error).toMatch(/no type|zero input properties/);
  });

  it('does not map an unknown variant or parent heading into an unrelated bundle', () => {
    const response = fixture('ModernDataGridColumn.txt')
      .replace('for variant `Boolean`:', 'for variant `BooleanExtra`:')
      .replace('a Grid GroupContainer:', 'a FutureContainer:');
    const { c, warns } = parseDescribe(response);
    expect(c.variantInput).not.toHaveProperty('Boolean');
    expect(c.parentContext).not.toHaveProperty('grid_layout_child');
    expect(c.baseInput).not.toHaveProperty('DisplayType');
    expect(warns).toHaveLength(2);
  });
});

describe('whole-run content gate', () => {
  it.each([1, 2])('allows at most 5%% unnamed Enum properties (%s of 20)', lost => {
    const run = goodRun();
    run.controls = [{ type: 'Example', baseInput: Object.fromEntries(Array.from({ length: 18 }, (_, i) =>
      [`Property${i}`, i < lost ? 'Enum' : '@enum:Named'])),
      variantInput: { Sample: { VariantEnum: '@enum:Named' } },
      parentContext: { child: { ParentEnum: { _enum: 'Named', _values: ['One'] } } } }];
    const failures = checkContent(run.controls, run.enums);
    expect(failures.map(f => f.check)).toEqual(lost === 1 ? [] : ['enum-name-loss']);
    if (lost === 2) expect(failures[0].examples).toEqual(['Example.Property0', 'Example.Property1']);
  });

  it('rejects the saved 125-entry garbage run even though the counts agree', () => {
    // Preserve every duplicate key from the actual failed YAML output. A map
    // parser would collapse the duplicates and hide the original failure.
    const text = fixture('garbage-control-properties.txt');
    const controls = [...text.matchAll(/^  "(creation keywords:)":\r?\n    family:\s*\r?\n    variants: \[\]\r?\n    input_properties: \{\}/gm)]
      .map(m => ({ type: m[1], baseInput: {}, variantInput: {} }));
    const run = { controls, enums: parseProperties(text).enums };
    expect(run.controls).toHaveLength(125);
    const failures = checkContent(run.controls, run.enums);
    expect(failures.map(f => f.check)).toEqual(['duplicate-control-key', 'invalid-control-key', 'empty-input-properties', 'enum-table-size']);
    expect(failures.every(f => f.examples.length === 2)).toBe(true);
    expect(failures[0].examples).toEqual(['creation keywords:', 'creation keywords:']);
  });

  it('accepts real families, properties and enums from the saved responses', () => {
    const run = goodRun();
    expect(Object.keys(run.enums).length).toBeGreaterThanOrEqual(10);
    expect(checkContent(run.controls, run.enums)).toEqual([]);
  });

  it.each([
    ['duplicate-control-key', run => { run.controls[1].type = run.controls[0].type; }],
    ['invalid-control-key', run => { run.controls[0].type = 'Bad Name:'; run.controls[1].type = 'A/B/C'; }],
    ['empty-input-properties', run => { run.controls[0].baseInput = {}; }],
    ['enum-table-size', run => { run.enums = Object.fromEntries(Object.entries(run.enums).slice(0, 9)); }],
    ['control-count-collapse', run => { run.previous = { controls: 9, controlExamples: ['OldA', 'OldB'] }; }],
    ['property-count-collapse', run => { run.previous = { properties: 10000, propertyExamples: ['OldA.Width', 'OldB.Height'] }; }],
  ])('rejects %s independently', (check, mutate) => {
    const run = { ...goodRun(), previous: {} };
    mutate(run);
    const failures = checkContent(run.controls, run.enums, run.previous);
    expect(failures.map(f => f.check)).toEqual([check]);
    expect(failures[0].examples).toHaveLength(2);
  });

  it('accepts the exact 10% empty, 10 enums and 50% replacement boundaries', () => {
    const run = goodRun();
    run.controls = Array.from({ length: 10 }, (_, i) => ({ ...structuredClone(run.controls[0]), type: `Control${i}`, baseInput: i ? { Width: 'Number' } : {} }));
    run.enums = Object.fromEntries(Object.entries(run.enums).slice(0, 10));
    expect(checkContent(run.controls, run.enums, { controls: 20, properties: 18 })).toEqual([]);
  });

  it('measures replaced entries rather than count metadata and excludes parent/output declarations', () => {
    const stats = previousContent('counts:\r\n  controls_in_this_file: 125\r\ncontrols:\r\n  - type: Example\r\n',
      'parent_context_properties:\n  grid_layout_child:\n    LayoutGridRowStart: Number\ncontrols:\n  Example:\n    input_properties:\n      Width: Number\n    variant_input_properties:\n      Textual:\n        Text: Text\n      Empty: {}\n    output_properties: [Width]\n');
    expect(stats).toMatchObject({ controls: 1, properties: 2 });
  });
});

describe('extraction writing boundary', () => {
  const dirs: string[] = [];
  const setup = () => {
    const outputDir = mkdtempSync(resolve(tmpdir(), 'appforge-extractor-'));
    dirs.push(outputDir);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const mcp = {
      req: vi.fn(async () => ({ serverInfo: { version: '1.1.0.0' } })),
      notify: vi.fn(), close: vi.fn(),
      tool: vi.fn(async (name, args = {}) => name === 'connect' ? 'connected'
        : name === 'list_controls' ? `Power Apps Controls:\n${names.map(n => `- ${n}`).join('\n')}\n`
        : fixture(`${args.controlName}.txt`)),
    };
    return { outputDir, mcp, environmentId: 'fixture-environment', appId: 'fixture-app' };
  };
  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('connects, emits the observed version and enum references, then closes the session', async () => {
    const options = setup();
    const run = await main(options);
    expect(run.skipped).toEqual([]);
    expect(options.mcp.tool.mock.calls[0][0]).toBe('connect');
    expect(options.mcp.close).toHaveBeenCalledOnce();
    const manifest = readFileSync(resolve(options.outputDir, 'control-manifest.yml'), 'utf8');
    const props = readFileSync(resolve(options.outputDir, 'control-properties.yml'), 'utf8');
    expect(manifest).toContain('server_version: 1.1.0.0');
    expect(parseManifest(manifest).source).toEqual({ cluster_category: 'prod', mcp: 'canvas-authoring' });
    expect(manifest).not.toMatch(/environment_id|app_id|fixture-environment|fixture-app/);
    expect(options.mcp.tool.mock.calls[0][1]).toMatchObject({
      environment_id: 'fixture-environment', app_id: 'fixture-app',
    });
    expect(props).toContain('DisplayType: "@enum:BooleanDisplay"');
    expect(props).toContain('BooleanDisplay: [Checkbox, Text, Toggle]');
    const stats = previousContent(manifest, props);
    expect(checkContent(run.controls, run.enums, stats)).toEqual([]);
  });

  it('records an unrecognised control as skipped with a diagnostic', async () => {
    const options = setup();
    const original = options.mcp.tool.getMockImplementation()!;
    options.mcp.tool.mockImplementation(async (name, args) => name === 'list_controls'
      ? `${await original(name, args)}- Unrecognised\n`
      : name === 'describe_control' && args.controlName === 'Unrecognised' ? fixture('unrecognised.txt') : original(name, args));
    const run = await main(options);
    expect(run.skipped).toEqual([{ type: 'Unrecognised', reason: expect.stringContaining('no type') }]);
    expect(readFileSync(resolve(options.outputDir, 'control-manifest.yml'), 'utf8')).toContain('is_partial: true');
  });

  it('reports unknown property metadata keys once per run and emits no defaults', async () => {
    const options = setup();
    const original = options.mcp.tool.getMockImplementation()!;
    options.mcp.tool.mockImplementation(async (name, args) => {
      const text = await original(name, args);
      return name === 'describe_control' ? text.replaceAll('  - Width: Number',
        '  - Width: Number\n      Default: 64\n      FutureKey: first\n      FutureKey: second') : text;
    });
    await main(options);
    const notices = vi.mocked(console.error).mock.calls.filter(([text]) => String(text).includes('unrecognised property metadata keys'));
    expect(notices).toEqual([['! unrecognised property metadata keys: FutureKey']]);
    const output = readFileSync(resolve(options.outputDir, 'control-properties.yml'), 'utf8');
    expect(output).not.toMatch(/FutureKey|Default: 64/);
  });

  it('refuses unnamed enum loss before writing either catalog despite a large enum table', async () => {
    const options = setup();
    const original = options.mcp.tool.getMockImplementation()!;
    options.mcp.tool.mockImplementation(async (name, args) => {
      const text = await original(name, args);
      return name === 'describe_control' ? text.replace('Input Properties:',
        'Input Properties:\n' + Array.from({ length: 20 }, (_, i) => `  - Lost${i}: Enum\n`).join('')) : text;
    });
    await expect(main(options)).rejects.toThrow('content gate refused catalog');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[enum-name-loss]'));
    for (const file of ['control-manifest.yml', 'control-properties.yml']) {
      expect(existsSync(resolve(options.outputDir, file))).toBe(false);
    }
  });

  it('retains named-enum collision warnings and the first value set', async () => {
    const options = setup();
    const original = options.mcp.tool.getMockImplementation()!;
    options.mcp.tool.mockImplementation(async (name, args) => {
      const text = await original(name, args);
      return name === 'describe_control' && args.controlName === 'ModernAvatar'
        ? text.replace('Enum values: Dashed, Dotted, None, Solid', 'Enum values: Dashed, Dotted, None, Solid, Future') : text;
    });
    const run = await main(options);
    expect(run.warnings).toEqual([expect.stringContaining('enum name collision: "BorderStyle"')]);
    expect(run.enums.BorderStyle).toEqual(['Dashed', 'Dotted', 'None', 'Solid']);
  });

  it.each([false, true])('refuses a duplicate run before creating or replacing either file (existing=%s)', async existing => {
    const options = setup();
    const paths = ['control-manifest.yml', 'control-properties.yml'].map(n => resolve(options.outputDir, n));
    if (existing) for (const path of paths) writeFileSync(path, 'preserve these exact bytes\r\n');
    const original = options.mcp.tool.getMockImplementation()!;
    options.mcp.tool.mockImplementation(async (name, args) => name === 'list_controls'
      ? `${await original(name, args)}- Rectangle\n` : original(name, args));
    await expect(main(options)).rejects.toThrow('content gate refused catalog');
    expect(options.mcp.close).toHaveBeenCalledOnce();
    for (const path of paths) {
      if (existing) expect(readFileSync(path, 'utf8')).toBe('preserve these exact bytes\r\n');
      else expect(existsSync(path)).toBe(false);
    }
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[duplicate-control-key]'));
  });

  // Observed 2026-11-11: list_controls stopped listing the superseded bare-named
  // FluentV9 controls, while describe_control still describes them.
  const previousManifest = (extra: string[]) => [...names, ...extra].map(n => `  - type: ${n}`).join('\n') + '\n';

  it('carries a previously catalogued, now unlisted control forward with its replacement', async () => {
    const options = setup();
    writeFileSync(resolve(options.outputDir, 'control-manifest.yml'), previousManifest(['CheckBox']));
    const original = options.mcp.tool.getMockImplementation()!;
    options.mcp.tool.mockImplementation(async (name, args) =>
      name === 'describe_control' && args.controlName === 'CheckBox' ? fixture('CheckBox.txt', '2026-11-11') : original(name, args));
    const run = await main(options);
    expect(run.skipped).toEqual([]);
    expect(run.lost).toEqual([]);
    const manifest = parseManifest(readFileSync(resolve(options.outputDir, 'control-manifest.yml'), 'utf8'));
    expect(manifest.counts).toMatchObject({ controls_total_in_tenant: names.length, controls_in_this_file: names.length + 1,
      controls_unlisted_carried: 1, is_partial: false });
    expect(manifest.controls.find(c => c.type === 'CheckBox')).toEqual({ type: 'CheckBox', family: 'FluentV9',
      version: null, variants: [], listed: false, superseded_by: 'ModernCheckbox' });
    for (const n of names) expect(manifest.controls.find(c => c.type === n)).not.toHaveProperty('listed');
    const props = parseProperties(readFileSync(resolve(options.outputDir, 'control-properties.yml'), 'utf8'));
    expect(props.controls.CheckBox.input_properties).toHaveProperty('CheckboxSize');
  });

  it('ignores the open app\'s canvas components listed after the controls', async () => {
    const options = setup();
    const original = options.mcp.tool.getMockImplementation()!;
    options.mcp.tool.mockImplementation(async (name, args) => name === 'list_controls'
      ? `${await original(name, args)}\r\nCanvas Components:\r\n\r\n- cStepBar - \r\n- cProbe - \r\n` : original(name, args));
    const run = await main(options);
    expect(run.skipped).toEqual([]);
    expect(options.mcp.tool.mock.calls.filter(([n]) => n === 'describe_control').map(([, a]) => a.controlName)).toEqual(names);
    expect(readFileSync(resolve(options.outputDir, 'control-manifest.yml'), 'utf8')).toContain('is_partial: false');
  });

  it('refuses to drop a previously catalogued control that no longer describes, leaving both files untouched', async () => {
    const options = setup();
    const manifestPath = resolve(options.outputDir, 'control-manifest.yml');
    writeFileSync(manifestPath, previousManifest(['Gone']));
    const original = options.mcp.tool.getMockImplementation()!;
    options.mcp.tool.mockImplementation(async (name, args) => {
      if (name === 'describe_control' && args.controlName === 'Gone') throw new Error('HTTP 500');
      return original(name, args);
    });
    await expect(main(options)).rejects.toThrow('content gate refused catalog');
    expect(readFileSync(manifestPath, 'utf8')).toBe(previousManifest(['Gone']));
    expect(existsSync(resolve(options.outputDir, 'control-properties.yml'))).toBe(false);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[catalogued-control-lost]'));
  });
});

describe('superseded controls (2026-11-11 describe format)', () => {
  it('records the replacement named in the service notice', () => {
    const { c, error } = parseDescribe(fixture('CheckBox.txt', '2026-11-11'));
    expect(error).toBeNull();
    expect(c.type).toBe('CheckBox');
    expect(c.supersededBy).toBe('ModernCheckbox');
    expect(Object.keys(c.baseInput)).toContain('Checked');
  });

  it('leaves current controls without a replacement', () => {
    expect(parseDescribe(fixture('ModernAvatar.txt')).c).not.toHaveProperty('supersededBy');
  });
});
