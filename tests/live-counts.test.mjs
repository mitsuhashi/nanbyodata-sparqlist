import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluate } from '../scripts/variant-blocks.mjs';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/live-counts-2026-09-23.json', import.meta.url)));
for (const fixture of fixtures) {
  test(`recorded public API: ${fixture.name}`, () => {
    const result = {results: {bindings: [fixture.binding]}};
    const candidates = {[fixture.position]: [fixture.candidate]};
    const context = fixture.target === 'clinvar'
      ? {medgen2clinvar2togovar: result, nando2mondo2medgen: {results: {bindings: []}}, clinvar_togovar: candidates}
      : {nando2mondo2mgend: result, togovar: candidates};
    const [row] = evaluate(`${fixture.target}_variants`, context);
    for (const [key, expected] of Object.entries(fixture.expected)) assert.equal(row[key], expected);
  });
}
