// Run against the PUBLIC deployed URL to generate required evidence from actual HTTP responses.
// npm run check:live -- https://YOUR-PUBLIC-APP.example
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const arg=process.argv[2];
if (!arg) {
  console.error('Usage: npm run check:live -- https://PUBLIC_APP_URL [output-directory]');
  process.exit(2);
}
const base=new URL(arg);
if (!['https:','http:'].includes(base.protocol)) throw new Error('URL must be http(s)');
const output=resolve(process.argv[3] || './submission');
const cases=[
  {name:'good_answer', question:'پروژه هفته‌چین را خلاصه کن', expected:'answer_from_record'},
  {name:'refusal', question:'نمره درس هوش مصنوعی من چند بوده؟', expected:'refuse_unpublished_fact'},
  {name:'clarification', question:'چه کتابی بخونم؟', expected:'ask_clarifying_question'},
  {name:'external_api', question:'برای درس اینترنت اشیا کتاب پیشنهاد بده', expected:['answer_from_external_api','answer_from_record']},
];
const traces=[];
const status=await fetch(new URL('/health',base),{signal:AbortSignal.timeout(10000)});
if (!status.ok) throw new Error(`Unhealthy app: ${status.status}`);
for (const c of cases) {
  const res=await fetch(new URL('/api/ask',base),{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({question:c.question}),signal:AbortSignal.timeout(20000)
  });
  if(!res.ok) throw new Error(`${c.name} returned HTTP ${res.status}`);
  const data=await res.json();
  const allowed=Array.isArray(c.expected)?c.expected:[c.expected];
  if(!allowed.includes(data.capability)) throw new Error(`${c.name} got unexpected capability: ${data.capability}`);
  if(typeof data.answer!=='string' || !Array.isArray(data.fields_read)) throw new Error(`${c.name} invalid response`);
  traces.push({case:c.name,question:c.question,intent:data.intent,intent_source:data.intent_source||'unknown',fields_read:data.fields_read,
    external_service:data.external_service||null, external_fields:data.external_fields||[],
    external_status:data.external_status||null,capability:data.capability,answer:data.answer});
}
await mkdir(output,{recursive:true});
await writeFile(resolve(output,'traces.json'),JSON.stringify({tested_url:base.origin,generated_at:new Date().toISOString(),traces},null,2)+'\n');
const markdown=[`# AI-Native Assignment 1 — Live Traces`, '', `Deployed URL: ${base.origin}`, '',
  ...traces.flatMap(t=>[
    `## ${t.case}`,`- Question: ${t.question}`,`- Intent: \`${t.intent}\``, `- Intent source: \`${t.intent_source}\``,
    `- Fields read: ${t.fields_read.length?t.fields_read.map(v=>'`'+v+'`').join('، '):'هیچ‌کدام'}`,
    `- Capability: \`${t.capability}\``,
    ...(t.external_service?[`- External service: ${t.external_service}`,`- External fields: ${(t.external_fields||[]).join(', ') || '—'}`]:[]),
    `- Answer:`, '',t.answer,'','---',''
  ])];
await writeFile(resolve(output,'traces.md'),markdown.join('\n'),'utf8');
console.log(`PASS: ${traces.length} HTTP traces recorded from ${base.origin}`);
console.log(`Saved: ${resolve(output,'traces.md')}`);
if (traces.find(t=>t.case==='external_api')?.capability!=='answer_from_external_api') {
  console.warn('WARNING: Open Library did not return books. Retry live API test before submission.');
}
