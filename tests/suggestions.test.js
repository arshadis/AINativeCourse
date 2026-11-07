import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {suggestNextQuestions} from '../server/suggestions.js';
import {published} from '../server/guardrails.js';
const profile=JSON.parse(readFileSync(new URL('../profile.json',import.meta.url),'utf8'));

const validateSuggestions=(p,items)=>{
  assert.ok(items.length<=5);
  for(const s of items){
    assert.ok(s.label && s.question && ['reply','new'].includes(s.mode));
    assert.ok(s.source_fields.every(f=>published(p,f)));
    assert.doesNotMatch(s.question,/معدل|شماره موبایل|نمره|ارسال ایمیل/);
  }
};

test('reading clarification offers only recorded public course or project titles as replies',()=>{
  const items=suggestNextQuestions(profile,{
    intent:'reading_recommendation',capability:'ask_clarifying_question',
    next_state:{pending_intent:'reading_recommendation',entity_id:null},fields_read:[]
  });
  assert.equal(items.length,5);
  assert.ok(items.every(i=>i.mode==='reply'));
  assert.match(items[1].question,/اینترنت اشیا/);
  validateSuggestions(profile,items);
});

test('project summary suggestions are sourced from approved project fields',()=>{
  const items=suggestNextQuestions(profile,{intent:'project_summary',capability:'answer_from_record',fields_read:[]});
  assert.ok(items.some(s=>/قابلیت/.test(s.label)));
  assert.ok(items.some(s=>/فناوری/.test(s.label)));
  validateSuggestions(profile,items);
});

test('reading suggestions prefer courses not used in prior answer',()=>{
  const items=suggestNextQuestions(profile,{intent:'reading_recommendation',capability:'answer_from_external_api',fields_read:['courses[internet_of_things].title']});
  assert.ok(items.length>0);
  assert.doesNotMatch(items[0].question,/اینترنت اشیا/);
  validateSuggestions(profile,items);
});

test('never suggest details hidden by publication policy',()=>{
  const restricted=structuredClone(profile);
  restricted.limits.published_fields=restricted.limits.published_fields.filter(x=>x!=='projects[].features'&&x!=='projects[].stack');
  const items=suggestNextQuestions(restricted,{intent:'project_summary',fields_read:[]});
  assert.ok(!items.some(s=>/قابلیت|فناوری/.test(s.label)));
  validateSuggestions(restricted,items);
});

test('private facts receive safe follow-up ideas and never an unsafe proposal',()=>{
  const items=suggestNextQuestions(profile,{intent:'private_fact',capability:'refuse_unpublished_fact',fields_read:[]});
  assert.ok(items.some(s=>/پروژه|درس/.test(s.label)));
  validateSuggestions(profile,items);
});

test('completely private profile never creates suggestions',()=>{
  const restricted=structuredClone(profile);
  restricted.limits.published_fields=[];
  const items=suggestNextQuestions(restricted,{intent:'list_courses',capability:'refuse_unpublished_fact',fields_read:[]});
  assert.deepEqual(items,[]);
});
