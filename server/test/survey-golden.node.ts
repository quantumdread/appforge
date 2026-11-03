import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildGoldenFixture } from './fixtures/survey/build-golden-case';
import { SURVEY_GOLDEN_CASES } from './fixtures/survey/cases';
import { renderTechnical } from '../src/core/survey/render-technical';

const fixtureUrl = (name: string) => new URL(`./fixtures/survey/${name}`, import.meta.url);

describe('survey report goldens', () => {
  for (const fixture of SURVEY_GOLDEN_CASES) {
    it(`byte-compares the deterministic ${fixture.name} report and markdown`, () => {
      const content = readFileSync(fixtureUrl(fixture.source_file), 'utf8');
      const first = buildGoldenFixture(fixture, content);
      const second = buildGoldenFixture(fixture, content);
      const firstJson = JSON.stringify(first, null, 2);
      const secondJson = JSON.stringify(second, null, 2);
      const firstMarkdown = renderTechnical(first);
      const secondMarkdown = renderTechnical(second);

      // No volatile field may survive the injected clock/id boundary.
      expect(firstJson).toBe(secondJson);
      expect(firstMarkdown).toBe(secondMarkdown);

      const expectedJson = readFileSync(fixtureUrl(`${fixture.name}.report.json`), 'utf8');
      const expectedMarkdown = readFileSync(fixtureUrl(`${fixture.name}.report.md`), 'utf8');
      expect(firstJson).toBe(expectedJson);
      expect(firstMarkdown).toBe(expectedMarkdown);

      if (fixture.name === 'clean') {
        expect(first.gate.summary).toMatchObject({ warn: 0, refuse: 0 });
        expect(first.findings).toEqual([]);
      } else {
        expect(first.gate.summary.warn).toBeGreaterThan(0);
        expect(first.gate.summary.refuse).toBeGreaterThan(0);
        expect(first.findings).toEqual(expect.arrayContaining([
          expect.objectContaining({
            rule: 'a11y-inputs-missing-accessiblelabel',
            controls: expect.arrayContaining(['txtAliasOne', 'txtAliasTwo', 'txtAliasThree']),
          }),
        ]));
        expect(first.inventories.version_lag).toEqual(expect.objectContaining({
          state: 'available',
          rows: expect.arrayContaining([
            expect.objectContaining({
              control: 'btnLegacy',
              observed: 'Button@0.0.45',
              newest_known: 'ModernButton@1.0.0',
            }),
          ]),
        }));
        expect(first.inventories.datasources).toEqual(expect.objectContaining({
          state: 'available',
          rows: expect.arrayContaining([
            expect.objectContaining({
              name: 'PendingLedger',
              backend: null,
              resolved_by: 'unresolved',
            }),
          ]),
        }));
      }
    });
  }
});
