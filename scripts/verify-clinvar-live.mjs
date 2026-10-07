// Executes this standalone Markdown's blocks directly, without deploying SPARQList.
import {execFileSync} from 'node:child_process';
import {writeFileSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {blocks, markdown, evaluate, render} from './clinvar-blocks.mjs';
const directory = new URL('../verification/2026-10-07-clinvar/', import.meta.url);
mkdirSync(directory, {recursive: true});
const evidence = {date: new Date().toISOString(), sha256: createHash('sha256').update(markdown).digest('hex'), cases: []};
for (const nando_id of process.argv.slice(2).length ? process.argv.slice(2) : ['1200030', '1200061', '1200183', '9999999', '']) {
  const context = {nando_id};
  const record = {nando_id, steps: []};
  for (const block of blocks) {
    const start = Date.now();
    try {
      if (block.language === 'sparql') {
        const query = render(block.code, context);
        const url = new URL(block.endpoint);
        url.searchParams.set('query', query);
        const raw = execFileSync('curl', ['-sS', '--fail-with-body', '--max-time', '45', '-H', 'Accept: application/sparql-results+json', url.href], {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
        context[block.name] = JSON.parse(raw);
      } else context[block.name] = evaluate(block.name, context);
      const value = context[block.name];
      record.steps.push({name: block.name, ms: Date.now() - start, count: value?.results?.bindings?.length ?? value.length});
      console.log(nando_id, JSON.stringify(record.steps.at(-1)));
    } catch (error) {
      record.error = {block: block.name, message: error.message, stdout: error.stdout?.toString()};
      console.log(nando_id, 'ERROR', block.name, record.error.stdout || error.message);
      break;
    }
  }
  record.context = context;
  evidence.cases.push(record);
  writeFileSync(new URL(process.env.CLINVAR_EVIDENCE_FILE || 'evidence.json', directory), JSON.stringify(evidence, null, 2) + '\n');
}
if (evidence.cases.some(record => record.error)) process.exitCode = 1;
