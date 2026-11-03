import { describe, it, expect } from 'vitest';
import { validateFiles } from '../src/lib/validator';

const recognition = (content: string, name = 'a.pa.yaml') =>
  validateFiles([{ name, content }]).coverage.files[0];

describe('per-file recognition diagnostics', () => {
  it('fully recognized screen file → no spans', () => {
    const r = recognition(`Screens:
  Main:
    Children:
      - lblOne:
          Control: Label
          Properties:
            Wrap: =false
            Text: ="hi"
`);
    expect(r.unrecognizedLines).toBe(0);
    expect(r.unrecognizedSpans).toEqual([]);
  });

  it('stray top-level key and its nested body → one span, exact lines', () => {
    const r = recognition(`Screens:
  Main:
    Children:
      - lblOne:
          Control: Label
          Properties:
            Wrap: =false
            Text: ="hi"
StrayBlock:
  nested: 1
  deeper:
    more: 2
`);
    expect(r.unrecognizedSpans).toEqual([[9, 12]]);
    expect(r.unrecognizedLines).toBe(4);
  });

  it('blanks and full-line comments are never unrecognized', () => {
    const r = recognition(`# provenance header

Screens:
  Main:
    Children:
      - lblOne:
          Control: Label
          Properties:
            Wrap: =false
            Text: ="hi"

# trailing note
`);
    expect(r.unrecognizedLines).toBe(0);
  });

  it('content the walker cannot read at all → everything unrecognized', () => {
    const r = recognition('this: is not\n  pa-yaml: at all\n');
    expect(r.recognizedRoots).toBe(0);
    expect(r.unrecognizedSpans).toEqual([[1, 2]]);
    expect(r.unrecognizedLines).toBe(2);
  });

  it('App: and ComponentDefinitions: blocks are consumed', () => {
    const r = recognition(`App:
  Properties:
    OnStart: =Set(gblReady, true)
ComponentDefinitions:
  cCard:
    DefinitionType: CanvasComponent
    CustomProperties:
      Title:
        PropertyKind: Input
        DataType: Text
        Default: ="x"
`);
    expect(r.recognizedRoots).toBe(2);
    expect(r.unrecognizedLines).toBe(0);
  });

  it('headerless fallback-root files (the template shape) are fully recognized', () => {
    const r = recognition(`- btnCustom:
    Control: Classic/Button
    Properties:
      Text: ="Go"
      OnSelect: =false
- lblCaption:
    Control: Label
    Properties:
      Wrap: =false
      Text: ="x"
`);
    expect(r.recognizedRoots).toBeGreaterThan(0);
    expect(r.unrecognizedLines).toBe(0);
  });

  it('EditorState-rooted file: list items never become fallback roots', () => {
    const r = recognition(`EditorState:
  ScreensOrder:
    - Main
    - Settings
`, '_EditorState.pa.yaml');
    expect(r.recognizedRoots).toBe(0);
    expect(r.unrecognizedSpans).toEqual([[1, 4]]);
    expect(r.unrecognizedLines).toBe(4);
  });

  it('App As App: header form is recognized', () => {
    const r = recognition(`App As App:
  Properties:
    OnStart: =Set(gblReady, true)
`);
    expect(r.unrecognizedLines).toBe(0);
  });
});
