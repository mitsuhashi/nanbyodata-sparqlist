import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const markdown = readFileSync(new URL('../nanbyodata_get_variant_by_nando_id.md', import.meta.url), 'utf8');
export const blocks = [];
let name, endpoint;
for (const section of markdown.split(/^## /m).slice(1)) {
  const heading = section.split('\n')[0];
  if (heading === 'Endpoint') endpoint = section.trim().split('\n')[1];
  name = heading.match(/^`([^`]+)`/)?.[1] || heading;
  const code = section.match(/```(javascript|sparql)\n([\s\S]*?)```/);
  if (code) blocks.push({ name, endpoint, language: code[1], code: code[2] });
}
export function evaluate(name, context, fetch) {
  const block = blocks.find(block => block.name === name);
  const fn = vm.runInNewContext(block.code.trim().replace(/;$/, ''), { fetch });
  return fn(context);
}
export function render(query, context) {
  return query.replace(/{{#if nando2mondo2omim.results.bindings.length}}([\s\S]*?){{else}}([\s\S]*?){{\/if}}/g,
    (_, yes, no) => context.nando2mondo2omim?.results.bindings.length ? yes : no)
    .replace(/{{#each nando2mondo2omim.results.bindings}}[\s\S]*?{{\/each}}/g,
    (context.nando2mondo2omim?.results.bindings || []).map(b => `(<${b.mondo.value}> <${b.omimuri.value}>)`).join(' '))
    .replace(/{{#each medgen}}[\s\S]*?{{\/each}}/g,
    (context.medgen || []).map(uri => `<${uri}>`).join(' '))
    .replace(/{{input\.(\w+)}}/g, (_, key) => context.input[key]);
}
