import test from 'node:test';
import assert from 'node:assert/strict';
import { blocks, evaluate } from '../scripts/variant-blocks.mjs';
const binding = fields => Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, {value: String(value)}]));
const result = bindings => ({results: {bindings}});
const mgend = binding({ ch: 'http://identifiers.org/hco/1/GRCh38', position: 100,
  variantID: 'http://med2rdf.org/mgend/variant/GRCh38_chr1_100_100_A_G',
  hgvs: 'NM_1.1:c.10T>C', vtype: 'http://genome-variation.org/SNV',
  dbxref: 'OMIMPS:1', omimps: 'https://omim.org/phenotypicSeries/PS1',
  mondo: 'http://purl.obolibrary.org/obo/MONDO_1', mondolabel: 'example',
  significance: 'Pathogenic', genelabel: 'GENE', geneXref: 'http://identifiers.org/hgnc:1' });
const variant = {id: 'correct', chromosome: '1', position: 100, reference: 'A', alternate: 'G',
  frequencies: [{genotype: {alt_homo_count: 0, hetero_count: 2}}, {aac: 1, arc: 3}]};

test('normalizes parameters consistently and rejects invalid input before SPARQL', () => {
  for (const target of ['mgend', 'MGeND', 'medgen']) {
    const input = evaluate('input', {nando_id: ' NANDO:1200216 ', target});
    assert.equal(input.nando_id, '1200216'); assert.equal(input.target, 'mgend');
    assert.equal(evaluate('variants', {input, mgend_variants: 'mgend', clinvar_variants: 'clinvar'}), 'mgend');
  }
  assert.throws(() => evaluate('input', {nando_id: '1 } UNION {', target: 'clinvar'}));
  assert.throws(() => evaluate('input', {nando_id: '1200216', target: 'typo'}));
});
test('ClinVar falls back to exact genomic identity when the ID is absent or unmatched', () => {
  for (const id of ['', 'missing', 'correct']) {
    const rows = evaluate('clinvar_variants', {
      nando2mondo2medgen: result([]),
      medgen2clinvar2togovar: result([binding({variant: 'http://identifiers.org/hco/1/GRCh38#100-A-G', tgv_id: id})]),
      clinvar_togovar: {'1:100': [variant]}
    });
    assert.equal(rows[0].genotype_count_alt_alt, 1);
    assert.equal(rows[0].genotype_count_alt_ref, 5);
  }
});
test('MGeND reverse-strand HGVS matches genomic alleles, excluding the other ALT', () => {
  const wrong = {...variant, id: 'wrong', reference: 'T', alternate: 'C'};
  const rows = evaluate('mgend_variants', {nando2mondo2mgend: result([mgend]), togovar: {'1:100': [wrong, variant]}});
  assert.equal(rows[0].tgv_id, 'correct');
  assert.equal(rows[0].genotype_count_alt_ref, 5);
});
test('zero counts are preserved, missing counts remain No Data', () => {
  for (const [frequencies, expected] of [[[{aac: 0, arc: 0}], 0], [[], 'No Data']]) {
    const rows = evaluate('mgend_variants', {nando2mondo2mgend: result([mgend]), togovar: {'1:100': [{...variant, frequencies}]}});
    assert.equal(rows[0].genotype_count_alt_alt, expected);
  }
});
test('GRCh37 coordinates are not submitted to GRCh38 search', async () => {
  const fail = () => { throw new Error('unexpected network request'); };
  await evaluate('togovar', {nando2mondo2mgend: result([{...mgend, ch: {value: 'http://identifiers.org/hco/1/GRCh37'}}])}, fail);
  await evaluate('clinvar_togovar', {medgen2clinvar2togovar: result([binding({variant: 'http://identifiers.org/hco/1/GRCh37#100-A-G'})])}, fail);
});
test('empty results do not invoke the REST API', async () => {
  const fail = () => { throw new Error('unexpected network request'); };
  await evaluate('togovar', {nando2mondo2mgend: result([])}, fail);
  await evaluate('clinvar_togovar', {medgen2clinvar2togovar: result([])}, fail);
});
test('MGeND requires a disease mapping and uses named graphs', () => {
  const query = blocks.find(b => b.name === 'nando2mondo2omim').code;
  assert.doesNotMatch(query, /OPTIONAL/);
  assert.doesNotMatch(query, /FROM /);
  assert.equal((query.match(/GRAPH </g) || []).length, 2);
});
test('indels require an exact transcript HGVS match', () => {
  const row = {...mgend, variantID: {value: 'http://med2rdf.org/mgend/variant/GRCh38_chr1_100_101_AT_A'}, hgvs: {value: 'NM_1.1:c.10del'}};
  for (const [hgvs_c, expected] of [['NM_1.1:c.10del', 'correct'], ['NM_2.1:c.10del', '']]) {
    const rows = evaluate('mgend_variants', {nando2mondo2mgend: result([row]), togovar: {'1:100': [{...variant, transcripts: [{hgvs_c}]}]}});
    assert.equal(rows[0].tgv_id, expected);
  }
});
test('REST locations are deduplicated across transcript rows', async () => {
  let calls = 0;
  await evaluate('togovar', {nando2mondo2mgend: result([mgend, mgend])}, async (_, options) => {
    calls++;
    assert.deepEqual(JSON.parse(options.body).query.location, {chromosome: '1', position: 100});
    return {ok: true, json: async () => ({data: []})};
  });
  assert.equal(calls, 1);
});

function clinvarRow(uri, candidates, id = '') {
  return evaluate('clinvar_variants', {
    nando2mondo2medgen: result([]),
    medgen2clinvar2togovar: result([binding({variant: uri, tgv_id: id})]),
    clinvar_togovar: {'1:100': candidates}
  })[0];
}
test('ClinVar genomic fallback rejects wrong chromosome, position, REF and ALT', () => {
  for (const changed of [{chromosome: '2'}, {position: 101}, {reference: 'T'}, {alternate: 'C'}]) {
    const row = clinvarRow('http://identifiers.org/hco/1/GRCh38#100-A-G', [{...variant, ...changed}]);
    assert.equal(row.genotype_count_alt_alt, 'No Data');
  }
});
test('ClinVar fallback accepts REST records without IDs and supplements links', () => {
  const candidate = {...variant, id: undefined, external_link: {mgend: [{title: 'mgend-example', xref: 'https://example.org/variant'}]}};
  const row = clinvarRow('http://identifiers.org/hco/1/GRCh38#100-A-G', [candidate]);
  assert.equal(row.genotype_count_alt_ref, 5);
  assert.equal(row.mgend_id, 'mgend-example');
  assert.equal(row.tgv_id, '');
  assert.equal(row.tgv_link, '');
});
test('ClinVar prefers ID matches over genomic fallback', () => {
  const sameAlleles = {...variant, id: 'another', frequencies: [{aac: 99}]};
  const row = clinvarRow('http://identifiers.org/hco/1/GRCh38#100-A-G', [sameAlleles, variant], 'correct');
  assert.equal(row.genotype_count_alt_alt, 1);
});
test('ClinVar fallback accepts exact indels but rejects different representations and builds', () => {
  const deletion = {...variant, reference: 'AT', alternate: 'A'};
  assert.equal(clinvarRow('http://identifiers.org/hco/1/GRCh38#100-AT-A', [deletion]).genotype_count_alt_alt, 1);
  for (const uri of ['http://identifiers.org/hco/1/GRCh37#100-AT-A', 'http://identifiers.org/hco/1/GRCh38#100-T-', 'http://identifiers.org/hco/1/GRCh38#100-AT-A-extra']) {
    assert.equal(clinvarRow(uri, [deletion]).genotype_count_alt_alt, 'No Data');
  }
});
test('ClinVar does not choose arbitrarily between duplicate genomic candidates', () => {
  assert.equal(clinvarRow('http://identifiers.org/hco/1/GRCh38#100-A-G', [variant, {...variant, id: 'another'}]).genotype_count_alt_alt, 'No Data');
});

test('count links include zero and No Data in both sources', () => {
  const candidate = {...variant, id: 'tgv47264307', frequencies: [{aac: 0}]};
  const rows = [
    clinvarRow('http://identifiers.org/hco/1/GRCh38#100-A-G', [candidate]),
    ...evaluate('mgend_variants', {nando2mondo2mgend: result([mgend]), togovar: {'1:100': [candidate]}})
  ];
  for (const row of rows) {
    assert.equal(row.genotype_count_alt_alt, 0);
    assert.equal(row.genotype_count_alt_alt_link, 'https://grch38.togovar.org/variant/tgv47264307#frequency');
    assert.equal(row.genotype_count_alt_ref, 'No Data');
    assert.equal(row.genotype_count_alt_ref_link, 'https://grch38.togovar.org/variant/tgv47264307#frequency');
  }
});
test('count links use the matched REST ID and do not invent an ID when missing', () => {
  const uri = 'http://identifiers.org/hco/1/GRCh38#100-A-G';
  const row = clinvarRow(uri, [{...variant, id: 'tgv47264307'}], 'tgv999');
  assert.equal(row.genotype_count_alt_ref_link, 'https://grch38.togovar.org/variant/tgv47264307#frequency');
  const withoutId = clinvarRow(uri, [{...variant, id: undefined}], 'tgv999');
  assert.equal(withoutId.genotype_count_alt_ref, 5);
  assert.equal(withoutId.genotype_count_alt_ref_link, 'https://grch38.togovar.org/variant/tgv999#frequency');
  const unknownId = clinvarRow(uri, [{...variant, id: undefined}]);
  assert.equal(unknownId.genotype_count_alt_ref_link, '');
  const unmatched = clinvarRow(uri, [], 'tgv999');
  assert.equal(unmatched.genotype_count_alt_ref, 'No Data');
  assert.equal(unmatched.genotype_count_alt_ref_link, 'https://grch38.togovar.org/variant/tgv999#frequency');
});
