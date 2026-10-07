import test from 'node:test';
import assert from 'node:assert/strict';
import {blocks, evaluate, render} from '../scripts/clinvar-blocks.mjs';
const result = bindings => ({results: {bindings}});
const binding = fields => Object.fromEntries(Object.entries(fields).map(([k, value]) => [k, {value}]));
const mapping = binding({medgen_id: 'http://ncbi.nlm.nih.gov/medgen/1', medgen_cid: 'http://ncbi.nlm.nih.gov/medgen/1', mondo: 'http://purl.obolibrary.org/obo/MONDO_0000001'});
const output = rows => JSON.parse(JSON.stringify(evaluate('result', {nando2mondo2medgen: result([mapping]), medgen2clinvar2togovar: result(rows)})));
test('extracts all four executable blocks and their endpoints', () => {
  assert.deepEqual(blocks.map(b => b.name), ['nando2mondo2medgen', 'medgen', 'medgen2clinvar2togovar', 'result']);
  assert.equal(blocks[2].endpoint, 'https://grch38.togovar.org/sparql');
  assert.equal(blocks[0].endpoint, 'https://dev-nanbyodata.dbcls.jp/sparql');
});
test('MedGen mapping and empty input', () => {
  assert.equal(JSON.stringify(evaluate('medgen', {nando2mondo2medgen: result([mapping])})), '["http://ncbi.nlm.nih.gov/medgen/1"]');
  assert.equal(JSON.stringify(evaluate('medgen', {nando2mondo2medgen: result([])})), '[]');
  assert.deepEqual(output([]), []);
});
test('formats a complete ClinVar record', () => {
  assert.deepEqual(output([binding({variant: 'http://identifiers.org/hco/1/GRCh38#100-A-G', tgv_id: 'tgv1', title: 'example', clinvar: 'https://www.ncbi.nlm.nih.gov/clinvar/variation/1', vcv: 'VCV000000001', interpretation: 'Pathogenic', type: 'http://genome-variation.org/resource#SNV', med_id: mapping.medgen_id.value})])[0], {
    tgv_id: 'tgv1', tgv_link: 'https://grch38.togovar.org/variant/tgv1', position: '1:100', title: 'example', Clinvar_link: 'https://www.ncbi.nlm.nih.gov/clinvar/variation/1', Clinvar_id: 'VCV000000001', Interpretation: 'Pathogenic', type: 'SNV', MedGen_id: '1', MedGen_link: mapping.medgen_id.value, mondo: mapping.mondo.value, mondo_id: 'MONDO:0000001'
  });
});
test('missing fields produce empty strings without exceptions', () => {
  assert.equal(Object.keys(output([{}])[0]).length, 12);
  assert(Object.values(output([{}])[0]).every(v => v === ''));
});
test('record without TogoVar ID retains ClinVar fields and position', () => {
  const row = output([binding({variant: 'http://identifiers.org/hco/X/GRCh38#123-A-T', vcv: 'VCV1'})])[0];
  assert.equal(row.position, 'X:123'); assert.equal(row.Clinvar_id, 'VCV1');
  assert.equal(row.tgv_id, ''); assert.equal(row.tgv_link, '');
});
test('coordinate-form TogoVar IDs are retained with their links', () => {
  const row = output([binding({tgv_id: '1-100-A-G', variant: 'http://identifiers.org/hco/1/GRCh38#100-A-G', type: 'http://genome-variation.org/resource#SNV'})])[0];
  assert.equal(row.tgv_id, '1-100-A-G');
  assert.equal(row.tgv_link, 'https://grch38.togovar.org/variant/1-100-A-G');
  assert.equal(row.type, 'SNV');
});
test('ClinVar-only records retain clinical fields while TogoVar fields are empty', () => {
  const row = output([binding({vcv: 'VCV1', title: 'example', interpretation: 'Pathogenic', med_id: mapping.medgen_id.value, clinvar: 'http://ncbi.nlm.nih.gov/clinvar/variation/1'})])[0];
  for (const key of ['tgv_id', 'tgv_link', 'position', 'type']) assert.equal(row[key], '');
  assert.equal(row.Clinvar_id, 'VCV1');
  assert.equal(row.title, 'example');
  assert.equal(row.Interpretation, 'Pathogenic');
  assert.equal(row.mondo_id, 'MONDO:0000001');
  assert.equal(row.Clinvar_link, 'http://ncbi.nlm.nih.gov/clinvar/variation/1');
});
test('unknown coordinate format and unmapped MedGen are safe', () => {
  const row = output([binding({variant: 'urn:unknown', med_id: 'http://ncbi.nlm.nih.gov/medgen/2'})])[0];
  assert.equal(row.position, ''); assert.equal(row.mondo, ''); assert.equal(row.MedGen_id, '2');
});
test('renders populated and empty VALUES without residual templates', () => {
  for (const medgen of [[], [mapping.medgen_id.value]]) {
    const query = render(blocks[2].code, {medgen});
    assert.doesNotMatch(query, /{{/);
    if (medgen.length) assert(query.includes(`<${medgen[0]}>`));
    else assert.match(query, /VALUES \?med_id \{\s*\}/);
  }
});
