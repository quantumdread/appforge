/**
 * Branch-point whole-byte fixtures captured before Plan 4 changed Issue or CLI parsing.
 * v2.4.13 (2026-09-07): the `version-pin-in-control-type` detail sentence was substituted
 * for the adjudicated observational wording (review F06); every other byte is the original capture.
 */
export const LEGACY_VALIDATE_YAML_INPUT = `Screens:
  Main:
    Children:
      - typo:
          Control: Labl
      - pinned:
          Control: Button@1.0.0
          Properties:
            Text: ="Save"
            AccessibleLabel: ="Save"
            OnSelect: =true
`;

export const LEGACY_VALIDATE_YAML_RESPONSE = `{
  "gate_decision": "BLOCK",
  "summary": {
    "pass": 3,
    "warn": 1,
    "refuse": 1,
    "controls_seen": 2,
    "files": 1
  },
  "per_file": [
    {
      "file": "legacy-byte.pa.yaml",
      "pass": 3,
      "warn": 1,
      "refuse": 1,
      "controls_seen": 2
    }
  ],
  "issues": {
    "refuse": [
      {
        "level": "REFUSE",
        "file": "legacy-byte.pa.yaml",
        "line": 4,
        "control": "typo",
        "type": "Labl",
        "detail": "control-type-not-in-manifest",
        "rule": "unknown-control",
        "did_you_mean": "Label"
      }
    ],
    "warn": [
      {
        "level": "WARN",
        "file": "legacy-byte.pa.yaml",
        "line": 6,
        "control": "pinned",
        "type": "Button",
        "rule": "version-pin-in-control-type",
        "detail": "1 control type(s) carry @version pins — observed, not judged: a suffix alone establishes neither lag nor incompatibility; see the version-lag inventory for evidence-backed migrations. This repository authors bare control types (generator convention). Pinned: pinned",
        "controls": [
          "pinned"
        ]
      }
    ]
  }
}`;

export const LEGACY_CLI_JSON = `{
  "tool": {
    "name": "analyzer-core",
    "version": "<VERSION>"
  },
  "reports": [
    {
      "file": <TARGET_JSON>,
      "issues": [
        {
          "level": "REFUSE",
          "line": 4,
          "control": "typo",
          "type": "Labl",
          "detail": "control-type-not-in-manifest"
        },
        {
          "level": "WARN",
          "line": 6,
          "control": "pinned",
          "type": "Button",
          "rule": "version-pin-in-control-type",
          "detail": "1 control type(s) carry @version pins — observed, not judged: a suffix alone establishes neither lag nor incompatibility; see the version-lag inventory for evidence-backed migrations. This repository authors bare control types (generator convention). Pinned: pinned",
          "controls": [
            "pinned"
          ]
        }
      ],
      "summary": {
        "pass": 3,
        "warn": 1,
        "refuse": 1,
        "controls_seen": 2
      }
    }
  ]
}
`;

export const LEGACY_CLI_TEXT = `
── <TARGET> ──

✗ REFUSE (1)
  <TARGET>:4  typo  Labl  → control-type-not-in-manifest

! WARN (1)
  <TARGET>:6  pinned  Button  → 1 control type(s) carry @version pins — observed, not judged: a suffix alone establishes neither lag nor incompatibility; see the version-lag inventory for evidence-backed migrations. This repository authors bare control types (generator convention). Pinned: pinned

  pass=3  warn=1  refuse=1  controls=2

══ analyzer-core v<VERSION> totals: refuse=1 warn=1 files=1 ══
`;

export const LEGACY_CLI_BASELINE_JSON = `{
  "tool": {
    "name": "analyzer-core",
    "version": "<VERSION>"
  },
  "reports": [
    {
      "file": <TARGET_JSON>,
      "issues": [
        {
          "level": "REFUSE",
          "line": 4,
          "control": "typo",
          "type": "Labl",
          "detail": "control-type-not-in-manifest"
        }
      ],
      "summary": {
        "pass": 3,
        "warn": 0,
        "refuse": 1,
        "controls_seen": 2,
        "accepted": 1
      },
      "accepted": [
        {
          "level": "WARN",
          "line": 6,
          "control": "pinned",
          "type": "Button",
          "rule": "version-pin-in-control-type",
          "detail": "1 control type(s) carry @version pins — observed, not judged: a suffix alone establishes neither lag nor incompatibility; see the version-lag inventory for evidence-backed migrations. This repository authors bare control types (generator convention). Pinned: pinned",
          "controls": [
            "pinned"
          ],
          "fingerprint": "39cbf8e92587"
        }
      ]
    }
  ],
  "accepted_total": 1,
  "stale_baseline_entries": []
}
`;

export function materializeLegacyCliFixture(
  fixture: string,
  target: string,
  version: string,
): string {
  return fixture
    .replaceAll('<TARGET_JSON>', JSON.stringify(target))
    .replaceAll('<TARGET>', target)
    .replaceAll('<VERSION>', version);
}

/**
 * New v2.4.10 pins (captured 2026-08-30, not branch-point fixtures): the
 * unknown-property near-miss surface on both execution surfaces, and the CLI's
 * two invalid `--datasources` diagnostics.
 */
export const NEAR_MISS_YAML_INPUT = `Screens:
  Main:
    Children:
      - lblOne:
          Control: Label
          Properties:
            Texd: ="hello"
            Wrap: =false
`;

export const NEAR_MISS_VALIDATE_YAML_RESPONSE = `{
  "gate_decision": "BLOCK",
  "summary": {
    "pass": 1,
    "warn": 0,
    "refuse": 1,
    "controls_seen": 1,
    "files": 1
  },
  "per_file": [
    {
      "file": "near-miss-byte.pa.yaml",
      "pass": 1,
      "warn": 0,
      "refuse": 1,
      "controls_seen": 1
    }
  ],
  "issues": {
    "refuse": [
      {
        "level": "REFUSE",
        "file": "near-miss-byte.pa.yaml",
        "line": 7,
        "control": "lblOne",
        "type": "Label",
        "property": "Texd",
        "detail": "property-not-in-catalog",
        "rule": "unknown-property",
        "did_you_mean": "Text"
      }
    ],
    "warn": []
  }
}`;

export const NEAR_MISS_CLI_JSON = `{
  "tool": {
    "name": "analyzer-core",
    "version": "<VERSION>"
  },
  "reports": [
    {
      "file": <TARGET_JSON>,
      "issues": [
        {
          "level": "REFUSE",
          "line": 7,
          "control": "lblOne",
          "type": "Label",
          "property": "Texd",
          "detail": "property-not-in-catalog"
        }
      ],
      "summary": {
        "pass": 1,
        "warn": 0,
        "refuse": 1,
        "controls_seen": 1
      }
    }
  ]
}
`;

export const NEAR_MISS_CLI_TEXT = `
── <TARGET> ──

✗ REFUSE (1)
  <TARGET>:7  lblOne  Label.Texd  → property-not-in-catalog

  pass=1  warn=0  refuse=1  controls=1

══ analyzer-core v<VERSION> totals: refuse=1 warn=0 files=1 ══
`;

/** Unreadable/absent `--datasources` path. */
export const SURVEY_DATASOURCES_UNREADABLE_STDERR =
  'unable to load --datasources: expected a readable JSON file\n';

/** Readable JSON whose values are not declared backend types. */
export const SURVEY_DATASOURCES_INVALID_STDERR =
  'unable to load --datasources: datasources values must be one of the declared datasource backend types\n';
