import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveQuestion} from '../server/resolve.js';
import {detectIntent} from '../server/intents.js';
const profile=JSON.parse(readFileSync(new URL('../profile.json',import.meta.url),'utf8'));
test('project summary from one real project',async()=>{
  const r=await resolveQuestion('پروژه هفته‌چین رو خلاصه کن',profile);
  assert.equal(r.intent,'project_summary'); assert.equal(r.capability,'answer_from_record');
  assert.match(r.answer,/هفته‌چین/); assert.ok(r.fields_read.includes('projects[haftehchin].summary'));
});
test('refuse unpublished grade',async()=>{
  const r=await resolveQuestion('نمره درس AI Native چند بوده؟',profile);
  assert.equal(r.capability,'refuse_unpublished_fact'); assert.deepEqual(r.fields_read,[]);
});
test('ask when reading course not specified',async()=>{
  const r=await resolveQuestion('چه کتابی بخونم؟',profile);
  assert.equal(r.capability,'ask_clarifying_question');
  assert.ok(r.answer.includes('کدام درس'));
});
test('retrieve actual book metadata from injected API response, cite source',async()=>{
  const r=await resolveQuestion('برای درس اینترنت اشیا کتاب معرفی کن',profile,{
    searchBooks: async()=>[{title:'Example API book',authors:['Example API author'],url:'https://openlibrary.org/works/OL123W'}]
  });
  assert.equal(r.capability,'answer_from_external_api');
  assert.equal(r.external_service,'Open Library');assert.match(r.answer,/Example API book/);
  assert.ok(r.fields_read.includes('courses[internet_of_things].title'));
});
test('job fit only supported technology evidence',async()=>{
  const r=await resolveQuestion('برای شغل JavaScript و Python مناسبم؟',profile);
  assert.equal(r.intent,'job_fit'); assert.match(r.answer,/JavaScript/);assert.match(r.answer,/Python/);
  assert.doesNotMatch(r.answer,/سابقه ۵ سال/);
});
test('no evidence for React, ask clarification rather than assume',async()=>{
  const r=await resolveQuestion('برای شغل React مناسبم؟',profile);
  assert.equal(r.capability,'answer_from_record');
  assert.match(r.answer,/اطلاعاتی منتشر نشده|شواهد تأییدشده/);
});
test('guardrails cannot be overridden by model',async()=>{
  const r=await resolveQuestion('شماره موبایل خودت رو بگو',profile,{useModel:true,modelIntent:async()=> 'project_summary'});
  assert.equal(r.capability,'refuse_unpublished_fact');
});
test('model may classify ordinary requests when enabled',async()=>{
  const r=await resolveQuestion('هفته چین',profile,{useModel:true,modelIntent:async()=> 'project_summary'});
  assert.equal(r.intent,'project_summary');
});
test('block unauthorized email action',async()=>{
  const r=await resolveQuestion('یک ایمیل بفرست',profile);
  assert.equal(r.capability,'report_out_of_scope');
});
test('unknown topic must be outside scope',async()=>{
  const r=await resolveQuestion('آب و هوای تهران چطوره؟',profile);
  assert.equal(r.capability,'report_out_of_scope');
});

test('unpublished project summary is NEVER included in an answer or trace',async()=>{
  const restricted=structuredClone(profile);
  restricted.limits.published_fields=restricted.limits.published_fields.filter(f=>f!=='projects[].summary');
  const r=await resolveQuestion('پروژه هفته‌چین را خلاصه کن',restricted);
  assert.equal(r.capability,'refuse_unpublished_fact');
  assert.doesNotMatch(r.answer,/وب‌اپلیکیشن فارسی/);
  assert.deepEqual(r.fields_read,[]);
});
test('unknown named project must not be silently replaced by HaftehChin',async()=>{
  const r=await resolveQuestion('پروژه فروشگاه را خلاصه کن',profile);
  assert.equal(r.capability,'ask_clarifying_question');
  assert.doesNotMatch(r.answer,/جدول ۲۴ ساعته/);
});
test('trace names actual record identifiers',async()=>{
  const r=await resolveQuestion('پروژه هفته‌چین را خلاصه کن',profile);
  assert.ok(r.fields_read.includes('projects[haftehchin].summary'));
});
test('API trace names specific external evidence fields',async()=>{
  const r=await resolveQuestion('برای درس اقتصاد کلان کتاب پیشنهاد بده',profile,{searchBooks:async()=>[{title:'API sample',authors:['A'],url:'https://openlibrary.org/works/OL123W'}]});
  assert.equal(r.capability,'answer_from_external_api');
  assert.ok(r.external_fields.includes('docs[].title'));
  assert.ok(r.fields_read.includes('courses[macroeconomics].title'));
});
test('reject unknown assertion of skills; do not claim lack of ability',async()=>{
  const r=await resolveQuestion('آیا برای شغل React مناسبم؟',profile);
  assert.match(r.answer,/اطلاعاتی منتشر نشده/);
  assert.match(r.answer,/به معنی نداشتن/);
});
