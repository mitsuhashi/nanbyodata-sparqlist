import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export const markdown = readFileSync(new URL('../nanbyodata_get_clinvar_variant_by_nando_id.md', import.meta.url), 'utf8');
export const blocks = [];
let endpoint;
for (const section of markdown.split(/^\s*## /m).slice(1)) {
  const heading = section.split('\n')[0].trim();
  if (heading === 'Endpoint') endpoint = section.trim().split('\n').slice(1).find(line => line.trim())?.trim();
  const code = section.match(/```(javascript|sparql)\n([\s\S]*?)```/);
  if (code) blocks.push({name: heading.replace(/`/g, ''), endpoint, language: code[1], code: code[2]});
}
export function evaluate(name, context) {
  return vm.runInNewContext(blocks.find(b => b.name === name).code.trim())(context);
}
export function render(code, context) {
  return code.replace(/{{#each medgen}}[\s\S]*?{{\/each}}/g,
    (context.medgen || []).map(uri => `<${uri}>`).join(' '))
    .replace(/{{nando_id}}/g, context.nando_id);
}
