// Execute the Markdown blocks against the public services without deploying.
// Requires Node.js 18+ and curl. Results are written only when an output path is supplied.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync } from 'node:fs';
import { blocks, evaluate, render } from './variant-blocks.mjs';
const exec = promisify(execFile);
// Keep live verification from flooding the public API.
let active = 0;
const waiting = [];
async function limitedRequest(url, options) {
  if (active >= 4) await new Promise(resolve => waiting.push(resolve));
  active++;
  try { return await request(url, options); }
  finally { active--; waiting.shift()?.(); }
}
async function request(url, options = {}) {
  const args = ['--silent', '--show-error', '--fail-with-body', '--max-time', '45', url];
  for (const [key, value] of Object.entries(options.headers || {})) args.push('-H', `${key}: ${value}`);
  if (options.body) args.push('--data-raw', options.body);
  const { stdout } = await exec('curl', args, {maxBuffer: 32 * 1024 * 1024});
  return {ok: true, status: 200, json: async () => JSON.parse(stdout)};
}
const context = {nando_id: process.argv[2] || '1200216', target: process.argv[3] || 'clinvar'};
for (const block of blocks) {
  if (process.argv.includes('--sparql-only') && block.name === 'togovar') break;
  const start = Date.now();
  if (block.language === 'sparql') {
    const url = new URL(block.endpoint);
    url.searchParams.set('query', render(block.code, context));
    const response = await request(url.href, {headers: {Accept: 'application/sparql-results+json'}});
    context[block.name] = await response.json();
  } else {
    context[block.name] = await evaluate(block.name, context, limitedRequest);
  }
  const result = context[block.name];
  const count = result?.results?.bindings?.length ?? (Array.isArray(result) ? result.length : undefined);
  console.log(`${block.name}: ${Date.now() - start} ms${count === undefined ? '' : `, ${count} rows`}`);
}
if (process.argv[4]) writeFileSync(process.argv[4], JSON.stringify(context.Output ?? context, null, 2) + '\n');
if (process.env.VARIANT_TRACE_PATH) writeFileSync(process.env.VARIANT_TRACE_PATH, JSON.stringify(context, null, 2) + '\n');
