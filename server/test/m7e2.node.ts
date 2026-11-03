import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { modernize, modernizeSummary } from '../src/core/modernize';
import { buildAppBundle } from '../src/core/analyzer';
import { controlNodes } from '../src/core/model';
import { ANALYZER_CATALOG_DATA as catalog } from '../src/lib/catalog-data';

const file = (type: string, props: string) => [{ name: 'Home.pa.yaml', content:
  `Screens:\n  Home:\n    Children:\n      - sample:\n          Control: ${type}\n          Properties:\n${props.split('\n').map(line => '            ' + line).join('\n')}\n` }];
const convert = (type: string, props: string, include_review = true) => modernize(file(type, props), catalog, { include_review });
const values = (result: ReturnType<typeof modernize>) => Object.fromEntries(controlNodes(buildAppBundle(result.files))[0].properties.map(p => [p.name, p.value]));
const opens = (result: ReturnType<typeof modernize>) => result.report.converted.flatMap(row => row.open_items);

describe('M7e-2 review mappings', () => {
  it('splits uniform radii and preserves authored corners in either spelling, including multiline formulas', () => {
    const result = convert('Button', 'Text: ="Go"\nBorderRadius: |-\n  =If(true,\n    8, 4)\nBorderRadiusTopLeft: =2\nRadiusBottomRight: =3');
    expect(values(result)).toMatchObject({ RadiusTopLeft: '=2', RadiusTopRight: '=If(true,\n8, 4)', RadiusBottomLeft: '=If(true,\n8, 4)', RadiusBottomRight: '=3' });
    expect(values(result)).not.toHaveProperty('BorderRadius');
    expect(result.report.self_check.regression).toBe(false);
    expect(values(convert('TextInput', 'BorderRadius: =6'))).toMatchObject({RadiusTopLeft:'=6', RadiusBottomRight:'=6'});
  });
  it('parses and gates split targets, rejecting absent or duplicate target properties', async () => {
    const modulePath = '../scripts/lib/modernization-catalog.mjs';
    const { parseModernization, validateModernization } = await import(modulePath);
    const source = `schema_version: 1\nlast_reviewed: 2026-10-09\nmodernization:\n  Button:\n    target: ModernButton\n    properties:\n      BorderRadius:\n        to: [RadiusTopLeft, RadiusTopRight]\n        basis: field-report-2026-10-08#9\n    references:\n      BorderRadius: ~\n    verified: false\n`;
    const data = {manifestControls:[{type:'Button',family:'FluentV9'},{type:'ModernButton',family:'React'}],controlProperties:{Button:{input_properties:{BorderRadius:'Number'}},ModernButton:{input_properties:{RadiusTopLeft:'Number',RadiusTopRight:'Number'}}}};
    expect(() => validateModernization(parseModernization(source),data)).not.toThrow();
    expect(() => validateModernization(parseModernization(source.replace('RadiusTopRight]', 'Unknown]')),data)).toThrow(/target input property/);
    expect(() => parseModernization(source.replace('RadiusTopRight]', 'RadiusTopLeft]'))).toThrow(/unique/);
  });
  it('drops TabIndex and Label Tooltip with notes, and opens focus review for selectable icons and buttons', () => {
    for (const type of ['Classic/Icon', 'Icon', 'Classic/Button', 'Button', 'Classic/ComboBox', 'ComboBox']) {
      const result = convert(type, 'Text: ="Go"\nIcon: =Icon.Home\nTabIndex: =0');
      expect(values(result)).not.toHaveProperty('TabIndex');
      expect(result.report.converted[0].properties.find(p => p.property === 'TabIndex')?.reason).toBeTruthy();
    }
    for (const type of ['Classic/Icon', 'Classic/Button', 'Button']) {
      const result = convert(type, 'Text: ="Go"\nIcon: =Icon.Home\nTabIndex: =0\nOnSelect: =true');
      expect(values(result)).not.toHaveProperty('TabIndex');
      expect(opens(result).some(p => p.property === 'TabIndex')).toBe(true);
      expect(result.report.self_check.regression).toBe(false);
    }
    const label = convert('Label','Text: ="Help"\nTooltip: ="Hint"');
    expect(values(label)).not.toHaveProperty('Tooltip');
    expect(opens(label)).toEqual([]);
  });
  it('maps one DisplayFields literal, quotes column names and leaves multi-field or computed shapes open', () => {
    for (const [column,formula] of [['name','ThisItem.name'],['x y',"ThisItem.'x y'"],["owner's name","ThisItem.'owner''s name'"]]) {
      const result = convert('Classic/ComboBox',`DisplayFields: =["${column}"]\nSearchFields: =["name"]\nNoSelectionText: ="Pick"`);
      expect(values(result)).toMatchObject({ItemDisplayText:'='+formula,InputTextPlaceholder:'="Pick"'});
      expect(values(result)).not.toHaveProperty('DisplayFields');
      expect(values(result)).not.toHaveProperty('SearchFields');
      expect(opens(result)).toEqual([]);
    }
    const placeholder = convert('Classic/ComboBox','NoSelectionText: ="Old"\nInputTextPlaceholder: ="Keep"');
    expect(values(placeholder)).toMatchObject({InputTextPlaceholder:'="Keep"'});
    expect(values(placeholder)).not.toHaveProperty('NoSelectionText');
    for (const fields of ['=["a","b"]','=varFields']) {
      const result = convert('Classic/ComboBox','DisplayFields: '+fields);
      expect(opens(result)).toEqual([expect.objectContaining({property:'DisplayFields',reason:expect.stringContaining('one-element')})]);
      expect(values(result)).not.toHaveProperty('DisplayFields');
      expect(result.report.self_check.regression).toBe(false);
    }
  });
  it('maps Mode Multiline, drops default SingleLine and opens formulas or authored Type conflicts', () => {
    for (const mode of ["'TextInputCanvas.Mode'.Multiline",'TextInputCanvas.Mode.Multiline','"Multiline"']) {
      const result = convert('TextInput','Mode: ='+mode);
      expect(values(result)).toMatchObject({Type:"='TextInputType'.Multiline"});
      expect(values(result)).not.toHaveProperty('Mode');
      expect(opens(result)).toEqual([]);
    }
    for (const mode of ["'TextInputCanvas.Mode'.SingleLine",'TextInputCanvas.Mode.SingleLine','"SingleLine"']) {
      const result = convert('TextInput','Mode: ='+mode);
      expect(values(result)).not.toHaveProperty('Mode');
      expect(values(result)).not.toHaveProperty('Type');
      expect(opens(result)).toEqual([]);
    }
    for (const props of ['Mode: =varMode', "Mode: ='TextInputCanvas.Mode'.Multiline\nType: ='TextInputCanvas.Type'.Password"]) {
      const result = convert('TextInput',props);
      expect(opens(result).some(p=>p.property==='Mode' && p.reason.includes('Merge Mode'))).toBe(true);
      expect(values(result)).not.toHaveProperty('Mode');
      expect(result.report.self_check.regression).toBe(false);
    }
  });
  it('wraps text defaults in record block scalars only for literal single-column Items', () => {
    for (const type of ['Classic/DropDown','Classic/Radio']) for (const items of ['=["a","b"]','=Table({Value: "a"}, {Value: "b"})']) {
      const result = convert(type,'Items: '+items+'\nDefault: =If(true, "a", "b")');
      expect(values(result).Default).toBe('={Value: If(true, "a", "b")}');
      expect(result.files[0].content).toContain('Default: |-\n              ={Value: If(true, "a", "b")}');
      expect(result.report.self_check.new_refusals).toEqual([]);
    }
    for (const items of ['=varItems','=Table({Value:"a", Other:1})','=[varName]','=Table({Value:varName})']) {
      const result = convert('Classic/Radio','Items: '+items+'\nDefault: ="a"');
      expect(values(result).Default).toBe('="a"');
      expect(opens(result).some(p=>p.property==='Default')).toBe(true);
    }
  });
  it('adds dropdown display text for single-column Items and reports the radio display-text question', () => {
    for (const type of ['Classic/DropDown','DropDown']) {
      const result = convert(type,'Items: =["a","b"]');
      expect(values(result)).toMatchObject({ItemDisplayText:'=ThisItem.Value'});
      expect(result.report.self_check.regression).toBe(false);
    }
    expect(values(convert('Classic/DropDown','Items: =varItems'))).not.toHaveProperty('ItemDisplayText');
    const authored = convert('Classic/DropDown','Items: =["a"]\nItemDisplayText: =ThisItem.Caption');
    expect(values(authored).ItemDisplayText).toBe('=ThisItem.Caption');
    const radio = convert('Classic/Radio','Items: =["a"]');
    expect(opens(radio).some(p=>p.property==='ItemDisplayText' && p.reason.includes('ModernRadio'))).toBe(true);
  });
  it('rewrites Self members and references inside split formulas, while strings and unsafe members stay open', () => {
    const result = convert('TextInput', 'Value: ="a"\nOnChange: |-\n  =Set(total, Value(Self.Value));\n  Set(label, "Self.Value");\n  Set(mode, Self.Mode)');
    expect(values(result).OnChange).toContain('Value(Self.Text)');
    expect(values(result).OnChange).toContain('"Self.Value"');
    expect(values(result).OnChange).toContain('Self.Mode');
    expect(opens(result).some(p=>p.reason.includes('Self.Mode') && p.reason.includes('(~)'))).toBe(true);
    expect(result.report.converted[0].references).toEqual([expect.objectContaining({before:'Self.Value',after:'Self.Text'})]);
    const files = file('TextInput','Value: ="a"');
    files[0].content += '      - button:\n          Control: Button\n          Properties:\n            Text: ="Go"\n            BorderRadius: =Len(sample.Value)\n';
    const split = modernize(files,catalog,{include_review:true});
    expect(split.files[0].content).not.toContain('sample.Value');
    expect(split.files[0].content).toContain('RadiusTopLeft: =Len(sample.Text)');
    const computed = convert('Classic/Icon','Icon: =If(Self.Color = Color.Red, Icon.Check, Icon.Home)');
    expect(values(computed).Icon).toContain('Self.IconColor');
    expect(opens(computed).some(p=>p.property==='Icon')).toBe(true);
  });
  it('drops classic RadioSize with the Fluent circle-size note', () => {
    const result = convert('Classic/Radio','RadioSize: =35');
    expect(values(result)).not.toHaveProperty('RadioSize');
    expect(result.report.converted[0].properties.find(p=>p.property==='RadioSize')).toMatchObject({action:'dropped',impact:'cosmetic',reason:'Fluent default circle size; classic pixel sizes made huge circles and clipped rows'});
    expect(opens(result)).toEqual([]);
  });
  it('maps field-report icons in all enum spellings and opens unmapped or computed icon formulas', () => {
    const pairs = {Check:'Checkmark',Information:'Info',Trash:'Delete',CheckBadge:'CheckmarkCircle',OfficeBuilding:'Building',Phone:'Call',CalendarBlank:'Calendar',DocumentWithContent:'Document',ChevronRight:'ChevronRight',ChevronLeft:'ChevronLeft',Home:'Home',Mail:'Mail',Warning:'Warning',Person:'Person',Settings:'Settings',History:'History',Camera:'Camera',Location:'Location'};
    for (const [classic,name] of Object.entries(pairs)) for (const formula of ['Icon.'+classic,"'Icon'."+classic,'"'+classic+'"']) {
      const result = convert('Classic/Icon','Icon: ='+formula);
      expect(values(result).Icon).toBe('="'+name+'"');
      expect(opens(result)).toEqual([]);
    }
    for (const formula of ['Icon.Add','Switch(varState, 1, Icon.Check, Icon.Home)']) {
      const result = convert('Classic/Icon','Icon: ='+formula);
      expect(result.report.summary.converted).toBe(1);
      expect(values(result).Icon).toBe('='+formula);
      expect(opens(result).some(p=>p.property==='Icon')).toBe(true);
    }
  });
  it('reports every enum icon use elsewhere after all classic icons convert, without rewriting tables or Switch', () => {
    const files = file('Classic/Icon','Icon: =Icon.Check');
    files.push({name:'Details.pa.yaml',content:'Screens:\n  Details:\n    Properties:\n      OnVisible: |-\n        =ClearCollect(iconRows, {Glyph: Icon.Trash});\n        Set(glyph, Switch(state, 1, Icon.Phone, Icon.Home));\n        Set(note, "Icon.Check")\n    Children:\n      - modern:\n          Control: ModernIcon\n          Properties:\n            Icon: =ThisItem.Glyph\n'});
    const result = modernize(files,catalog,{include_review:true});
    const items = opens(result).filter(p=>p.file==='Details.pa.yaml');
    expect(items).toHaveLength(3);
    expect(items.map(p=>p.reason)).toEqual([expect.stringContaining('"Delete"'),expect.stringContaining('"Call"'),expect.stringContaining('"Home"')]);
    expect(items.map(p=>p.line)).toEqual([5,6,6]);
    expect(result.files[1].content).toBe(files[1].content);
    files[0].content += '      - remaining:\n          Control: Classic/Icon\n          Properties:\n            Icon: =Icon.Home\n';
    expect(opens(modernize(files,catalog,{include_review:true,controls:['sample']})).filter(p=>p.file==='Details.pa.yaml')).toEqual([]);
  });
  it('maps authored date locale counterparts and always opens the exact locale reminder without inventing values', () => {
    const message = "ModernDatePicker does not inherit the app's locale; set ContentLanguage, StartOfWeek and Format if the app needs a specific locale.";
    const bare = convert('DatePicker',`ContentLanguage: ="sv-SE"\nStartOfWeek: ='DatePickerCanvas.StartOfWeek'.Monday\nFormat: ='DatePickerCanvas.Format'.Short`);
    expect(values(bare)).toMatchObject({ContentLanguage:'="sv-SE"',StartOfWeek:'=StartOfWeek.Monday',Format:'=DatePickerFormat.Short'});
    const classic = convert('Classic/DatePicker','Language: ="sv-SE"\nStartOfWeek: =StartOfWeek.Monday\nFormat: =DateTimeFormat.ShortDate');
    expect(values(classic)).toMatchObject({ContentLanguage:'="sv-SE"',StartOfWeek:'=StartOfWeek.Monday',Format:'=DatePickerFormat.Short'});
    expect(values(classic)).not.toHaveProperty('Language');
    for (const result of [bare,classic,convert('DatePicker','Height: =30'),convert('Classic/DatePicker','Height: =30')]) {
      expect(opens(result).filter(p=>p.reason===message)).toHaveLength(1);
      expect(result.report.self_check.regression).toBe(false);
    }
    expect(values(convert('DatePicker','Height: =30'))).not.toHaveProperty('ContentLanguage');
  });
  it('preserves quoted radius scalars and corner aliases on every split pair, without creating target collisions', () => {
    for (const type of ['Text','TextInput','Button','ComboBox','DatePicker','DropDown','NumberInput','Link']) {
      const result = convert(type,'BorderRadius: \'=If(true, 8, 4)\' # keep\nBorderRadiusTopLeft: =2');
      expect(values(result)).toMatchObject({RadiusTopLeft:'=2',RadiusTopRight:'=If(true, 8, 4)'});
      expect(result.files[0].content).toContain("RadiusTopRight: '=If(true, 8, 4)' # keep");
      expect(opens(result).some(p=>p.property==='BorderRadiusTopLeft')).toBe(false);
      expect(result.report.self_check.regression).toBe(false);
    }
    const locale = convert('Classic/DatePicker','Language: ="sv-SE"\nContentLanguage: ="en-US"');
    expect(values(locale).ContentLanguage).toBe('="en-US"');
    expect(locale.files[0].content.match(/ContentLanguage:/gu)).toHaveLength(1);
    expect(opens(locale).some(p=>p.property==='Language' && p.reason.includes('authored'))).toBe(true);
  });
  it('modernizes the synthetic multi-screen field fixture with zero new REFUSE and no regression', () => {
    const files = ['App','Home','Details'].map(name=>({name:name+'.pa.yaml',content:readFileSync(new URL('./m7e2-fixtures/'+name+'.pa.yaml',import.meta.url),'utf8')}));
    const result = modernize(files,catalog,{include_review:true});
    expect(result.report.summary.converted).toBe(9);
    expect(result.report.self_check.new_refusals).toEqual([]);
    expect(result.report.self_check.regression).toBe(false);
    expect(result.files.find(p=>p.name==='Home.pa.yaml')!.content).toContain('Value(Self.Text)');
    expect(opens(result).map(p=>p.property)).toEqual(expect.arrayContaining(['TabIndex','ItemDisplayText','Icon','ContentLanguage','OnVisible','OnStart']));
    expect(modernizeSummary(result.report)).toContain('0 new REFUSE.');
  });
  it('gates conditional additions, open items, transforms and restoring target defaults', async () => {
    const modulePath = '../scripts/lib/modernization-catalog.mjs';
    const {parseModernization,validateModernization}=await import(modulePath);
    const text=readFileSync(new URL('../../knowledge/catalogs/control-modernization.yml',import.meta.url),'utf8');
    const data={manifestControls:catalog.controls,controlProperties:catalog.controlProperties,augmentations:catalog.augmentations,enums:catalog.enums};
    const parse=()=>parseModernization(text);
    expect(()=>validateModernization(parse(),data)).not.toThrow();
    const missing=parse(); missing.modernization.DropDown.add[0].property='Missing';
    expect(()=>validateModernization(missing,data)).toThrow(/target input property/);
    const condition=parse(); condition.modernization.DropDown.add[0].when='guess';
    expect(()=>validateModernization(condition,data)).toThrow(/when/);
    const open=parse(); open.modernization.DatePicker.open_items[0].basis='imagined';
    expect(()=>validateModernization(open,data)).toThrow(/basis/);
    const reason=parse(); reason.modernization.DatePicker.open_items[0].reason='';
    expect(()=>validateModernization(reason,data)).toThrow(/reason/);
    const transform=parse(); transform.modernization.TextInput.properties.Mode.transform='guess';
    expect(()=>validateModernization(transform,data)).toThrow(/transform/);
    const guard=parse(); guard.modernization.TextInput.properties.Mode.unless_present=['Missing'];
    expect(()=>validateModernization(guard,data)).toThrow(/source input surface/);
    const restore=parse(); restore.modernization['Classic/Radio'].properties.TabIndex.restore_default=true;
    expect(()=>validateModernization(restore,data)).toThrow(/compatible target/);
    expect(Object.values(parse().modernization).every((pair:any)=>pair.verified===false)).toBe(true);
  });
});
