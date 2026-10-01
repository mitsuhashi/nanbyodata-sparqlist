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

// Compare the serialized final response with the documented examples, so undefined
// values cannot silently disappear and internal enrichment cannot leak into the API.
const markdown = readFileSync(new URL('../nanbyodata_get_variant_by_nando_id.md', import.meta.url), 'utf8');
const examples = [...markdown.slice(markdown.indexOf('- レスポンス例')).matchAll(/\{[\s\S]*?\}/g)]
  .map(match => JSON.parse(match[0]));
for (const fixture of fixtures) {
  for (const matched of [true, false]) {
    test(`response schema: ${fixture.name}, REST matched=${matched}`, () => {
      const target = fixture.target;
      const result = {results: {bindings: [fixture.binding]}};
      const candidates = {[fixture.position]: matched ? [fixture.candidate] : []};
      const context = target === 'clinvar'
        ? {medgen2clinvar2togovar: result, nando2mondo2medgen: {results: {bindings: []}}, clinvar_togovar: candidates}
        : {nando2mondo2mgend: result, togovar: candidates};
      const internal = evaluate(`${target}_variants`, context);
      const variants = evaluate('variants', {
        input: {target}, clinvar_variants: [], mgend_variants: [], [`${target}_variants`]: internal
      });
      const [row] = JSON.parse(JSON.stringify(evaluate('Output', {variants})));
      const example = examples[target === 'clinvar' ? 0 : 1];
      assert.deepEqual(Object.keys(row).sort(), Object.keys(example).sort());
      for (const key of Object.keys(example)) assert.deepEqual(row[key], internal[0][key]);
      assert.equal('ClinVar_id' in row, false);
      if (target === 'mgend') {
        for (const [key, expected] of Object.entries(fixture.expected)) {
          assert.equal(row[key], matched ? expected : 'No Data');
        }
      }
    });
  }
}
for (const target of ['clinvar', 'mgend']) {
  test(`empty final response: ${target}`, () => {
    const variants = evaluate('variants', {input: {target}, clinvar_variants: [], mgend_variants: []});
    assert.equal(JSON.stringify(evaluate('Output', {variants})), '[]');
  });
}
