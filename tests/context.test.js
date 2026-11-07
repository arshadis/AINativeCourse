import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveQuestion} from '../server/resolve.js';
import {publicContext, sanitizeState} from '../server/context.js';
import {modelRoute} from '../server/llm.js';
import {INTENTS} from '../server/intents.js';

const profile=JSON.parse(readFileSync(new URL('../profile.json',import.meta.url),'utf8'));
const routed=(intent, extra={})=>({useModel:true, modelRoute:async()=>({
  route:{intent,...extra}, diagnostics:{status:'ok',latency_ms:25}
})});

test('English question about registered courses uses profile, not invented completions',async()=>{
  const r=await resolveQuestion('What courses have you taken?',profile,routed(INTENTS.LIST_COURSES));
  assert.equal(r.capability,'answer_from_record');
  assert.equal(r.intent,'list_courses');
  assert.match(r.answer,/AI-Native Systems Design/);
  assert.match(r.answer,/اینترنت اشیا/);
  assert.match(r.answer,/وضعیت گذراندن، قبولی و نمره.*مشخص نشده/);
  assert.equal(r.fields_read.length,4);
});

test('list skills reads only approved profile skills',async()=>{
  const r=await resolveQuestion('What technical skills do you have?',profile,routed(INTENTS.LIST_SKILLS));
  assert.equal(r.capability,'answer_from_record');
  assert.match(r.answer,/Python 3/);
  assert.deepEqual(r.fields_read,['skills[]']);
});

test('ambiguous first person statement asks clarification, not out of scope',async()=>{
  const r=await resolveQuestion('I have skill on python',profile,routed(INTENTS.UNCLEAR,{subject:'skills',needs_clarification:true}));
  assert.equal(r.capability,'ask_clarifying_question');
  assert.equal(r.intent,'unclear');
});

test('reading clarification survives next turn, when model is unavailable',async()=>{
  const first=await resolveQuestion('چه کتابی بخونم؟',profile);
  assert.equal(first.capability,'ask_clarifying_question');
  assert.equal(first.next_state.pending_intent,'reading_recommendation');
  const second=await resolveQuestion('اینترنت اشیا',profile,{
    state:first.next_state,
    searchBooks:async(id)=>{assert.equal(id,'internet_of_things');return [{title:'IoT Sample',authors:['A'],url:'https://openlibrary.org/works/OL123W'}];},
  });
  assert.equal(second.capability,'answer_from_external_api');
  assert.match(second.answer,/IoT Sample/);
  assert.equal(second.next_state,null);
});

test('model route for course followup uses compact state and correct evidence',async()=>{
  const r=await resolveQuestion('Internet of Things',profile,{
    ...routed(INTENTS.READING,{subject:'courses',entity_id:'internet_of_things'}),
    state:{pending_intent:'reading_recommendation'},
    searchBooks:async()=>[{title:'Course API Sample',url:'https://openlibrary.org/works/OL123W'}],
  });
  assert.equal(r.intent,'reading_recommendation');
  assert.ok(r.fields_read.includes('courses[internet_of_things].title'));
});

test('project details answer from exact published features fields',async()=>{
  const r=await resolveQuestion('هفته چین چه قابلیت‌هایی داره؟',profile,
    routed(INTENTS.PROJECT_DETAILS,{subject:'projects',entity_id:'haftehchin',focus:'features'}));
  assert.equal(r.capability,'answer_from_record');
  assert.match(r.answer,/Drag & Drop/);
  assert.deepEqual(r.fields_read,['projects[haftehchin].features']);
});

test('reading recommendations can be grounded in a project too',async()=>{
  const r=await resolveQuestion('برای پروژه هفته چین کتاب پیشنهاد بده',profile,{
    ...routed(INTENTS.READING,{subject:'projects',entity_id:'haftehchin'}),
    searchBooks:async(id)=>{assert.equal(id,'haftehchin');return [{title:'Web APIs',authors:['A']}];},
  });
  assert.equal(r.capability,'answer_from_external_api');
  assert.match(r.answer,/پروژه/);
  assert.deepEqual(r.fields_read,['projects[haftehchin].title']);
});

test('unpublished project features are not exposed even if LLM demands them',async()=>{
  const restricted=structuredClone(profile);
  restricted.limits.published_fields=restricted.limits.published_fields.filter(x=>x!=='projects[].features');
  const r=await resolveQuestion('قابلیت های پروژه هفته چین',restricted,
    routed(INTENTS.PROJECT_DETAILS,{subject:'projects',entity_id:'haftehchin',focus:'features'}));
  assert.equal(r.capability,'refuse_unpublished_fact');
  assert.deepEqual(r.fields_read,[]);
});

test('unknown project is not substituted even when model hallucinates an existing id',async()=>{
  const r=await resolveQuestion('پروژه فروشگاه را خلاصه کن',profile,
    routed(INTENTS.PROJECT,{subject:'projects',entity_id:'haftehchin'}));
  assert.equal(r.capability,'ask_clarifying_question');
  assert.doesNotMatch(r.answer,/Drag & Drop/);
});

test('model cannot override private question policy',async()=>{
  let count=0;
  const r=await resolveQuestion('نمره درس من چنده؟',profile,{useModel:true,
    modelRoute:async()=>{count++;return {route:{intent:INTENTS.LIST_COURSES}};}});
  assert.equal(count,0);
  assert.equal(r.capability,'refuse_unpublished_fact');
  assert.equal(r.model_diagnostics.status,'skipped_policy');
});

test('out of scope stays out of scope',async()=>{
  const r=await resolveQuestion('What is the weather?',profile,routed(INTENTS.OUT));
  assert.equal(r.capability,'report_out_of_scope');
});

test('model context excludes unpublished details and grades',()=>{
  const privateProfile=structuredClone(profile);
  privateProfile.about.secret='VERY_PRIVATE';
  privateProfile.courses[0].grade=19;
  privateProfile.limits.published_fields=privateProfile.limits.published_fields.filter(x=>x!=='projects[].title');
  const text=JSON.stringify(publicContext(privateProfile));
  assert.doesNotMatch(text,/VERY_PRIVATE|19|هفته‌چین/);
  assert.equal(publicContext(privateProfile).courses.length,4);
  assert.equal(publicContext(privateProfile).projects.length,0);
});

test('client-provided clarification state cannot inject a fake entity id',()=>{
  assert.deepEqual(sanitizeState({pending_intent:'reading_recommendation',entity_id:'some_secret'},profile),
    {pending_intent:'reading_recommendation',entity_id:null});
  assert.equal(sanitizeState({pending_intent:'send_email',entity_id:'internet_of_things'},profile),null);
});

test('GapGPT request contains only public catalog and state, never private fields',async()=>{
  const oldKey=process.env.GAPGPT_API_KEY, oldModel=process.env.GAPGPT_MODEL;
  try {
    process.env.GAPGPT_API_KEY='test-only-not-real-key';
    process.env.GAPGPT_MODEL='gpt-4o-mini';
    const withPrivate=structuredClone(profile);
    withPrivate.courses[0].grade='SECRET_GRADE';
    const r=await modelRoute('What courses have you taken?',withPrivate,null,
      async(url,req)=>{
        assert.equal(url,'https://api.gapgpt.app/v1/chat/completions');
        assert.equal(req.headers.Authorization,'Bearer test-only-not-real-key');
        const payload=JSON.parse(req.body);
        assert.doesNotMatch(req.body,/SECRET_GRADE/);
        assert.match(payload.messages[1].content,/ai_native_systems_design/);
        return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({
          intent:'list_courses',subject:'courses',entity_id:null,focus:'unspecified',needs_clarification:false
        })}}]})};
      });
    assert.equal(r.diagnostics.status,'ok');
    assert.equal(r.route.intent,'list_courses');
    assert.ok(r.diagnostics.latency_ms>=0);
  } finally {
    if(oldKey===undefined) delete process.env.GAPGPT_API_KEY; else process.env.GAPGPT_API_KEY=oldKey;
    if(oldModel===undefined) delete process.env.GAPGPT_MODEL; else process.env.GAPGPT_MODEL=oldModel;
  }
});

test('diagnostics identify upstream rate limit and invalid JSON without leaking raw messages',async()=>{
  const oldKey=process.env.GAPGPT_API_KEY, oldModel=process.env.GAPGPT_MODEL;
  try {
    process.env.GAPGPT_API_KEY='test-only-not-real-key';
    process.env.GAPGPT_MODEL='gpt-4o-mini';
    const limited=await modelRoute('Project?',profile,null,
      async()=>({ok:false,status:429}));
    assert.equal(limited.route,null);
    assert.deepEqual({status:limited.diagnostics.status,http_status:limited.diagnostics.http_status},
      {status:'http_error',http_status:429});
    const invalid=await modelRoute('Project?',profile,null,
      async()=>({ok:true,json:async()=>({choices:[{message:{content:'not-json'}}]})}));
    assert.equal(invalid.diagnostics.status,'invalid_model_json');
  } finally {
    if(oldKey===undefined) delete process.env.GAPGPT_API_KEY; else process.env.GAPGPT_API_KEY=oldKey;
    if(oldModel===undefined) delete process.env.GAPGPT_MODEL; else process.env.GAPGPT_MODEL=oldModel;
  }
});

test('project-focused reading with implicit sole project accepts a validated model entity',async()=>{
  const r=await resolveQuestion('What should I read for my project?',profile,{
    ...routed(INTENTS.READING,{subject:'projects',entity_id:'haftehchin'}),
    searchBooks:async(id)=>{assert.equal(id,'haftehchin');return [{title:'Learning JavaScript',authors:[]}];},
  });
  assert.equal(r.capability,'answer_from_external_api');
  assert.deepEqual(r.fields_read,['projects[haftehchin].title']);
});


test('unclear skills keeps semantic subject for targeted clarification',async()=>{
  const r=await resolveQuestion('I know Python',profile,routed(INTENTS.UNCLEAR,{
    subject:'skills',needs_clarification:true
  }));
  assert.equal(r.capability,'ask_clarifying_question');
  assert.match(r.answer,/مهارت‌های ثبت‌شده صاحب پروفایل/);
  assert.equal(r.intent_source,'llm');
});

test('unclear job question gets a targeted request for described role',async()=>{
  const r=await resolveQuestion('Could Python be my job?',profile,routed(INTENTS.UNCLEAR,{
    subject:'job',needs_clarification:true
  }));
  assert.equal(r.capability,'ask_clarifying_question');
  assert.match(r.answer,/شرح شغل/);
});

test('future course selection is outside assignment and never lists current courses',async()=>{
  const r=await resolveQuestion('چه درس‌هایی بعداً بگذرونم؟',profile,routed(INTENTS.OUT));
  assert.equal(r.intent,'out_of_scope');
  assert.equal(r.capability,'report_out_of_scope');
  assert.doesNotMatch(r.answer,/AI-Native Systems Design/);
});

test('asking for job listings is out of scope, not job fit',async()=>{
  const r=await resolveQuestion('I know Python; find me a job',profile,routed(INTENTS.OUT));
  assert.equal(r.capability,'report_out_of_scope');
  assert.doesNotMatch(r.answer,/مهارت‌های مستند و مرتبط/);
});

test('route prompt distinguishes recorded courses, future curricula, reading, and job search',async()=>{
  const oldKey=process.env.GAPGPT_API_KEY, oldModel=process.env.GAPGPT_MODEL;
  try {
    process.env.GAPGPT_API_KEY='test-secret';process.env.GAPGPT_MODEL='test-model';
    const r=await modelRoute('What courses should I take next year?',profile,null,
      async(url,req)=>{
        const payload=JSON.parse(req.body);
        const sys=payload.messages[0].content;
        assert.match(sys,/future curriculum planning/);
        assert.match(sys,/Find me a Python job/);
        assert.match(sys,/enumerate ALREADY RECORDED courses/);
        assert.match(sys,/needs_clarification=true/);
        assert.doesNotMatch(payload.messages[1].content,/SECRET/);
        return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({
          intent:'out_of_scope',subject:'courses',entity_id:null,focus:'unspecified',needs_clarification:false
        })}}]})};
      });
    assert.equal(r.route.intent,'out_of_scope');
  } finally {
    if(oldKey===undefined) delete process.env.GAPGPT_API_KEY;else process.env.GAPGPT_API_KEY=oldKey;
    if(oldModel===undefined) delete process.env.GAPGPT_MODEL;else process.env.GAPGPT_MODEL=oldModel;
  }
});

// A job/requirement already supplied is not a missing job description.
test('named job with unrecorded physical requirement reports evidence gap, no re-ask',async()=>{
  const q='آیا صاحب این پروفایل برای شغل آتش نشانی از نظر مهارت بدنی مناسبه؟';
  const r=await resolveQuestion(q,profile,routed(INTENTS.JOB,{
    job_target:'owner',job_role:'آتش نشانی',job_requirements:['مهارت بدنی'],needs_clarification:true
  }));
  assert.equal(r.intent,'job_fit');
  assert.equal(r.capability,'answer_from_record');
  assert.match(r.answer,/شواهدی.*ثبت نشده/);
  assert.match(r.answer,/نبود اطلاعات به معنای نداشتن توانایی نیست/);
  assert.deepEqual(r.fields_read,['skills[]']);
});

test('general occupation question is outside scope even if model says job_fit',async()=>{
  const r=await resolveQuestion('آیا آمادگی بدنی برای شغل آتش نشانی مناسبه؟',profile,
    routed(INTENTS.JOB,{job_target:'general',job_role:'آتش نشانی',job_requirements:['آمادگی بدنی']}));
  assert.equal(r.intent,'out_of_scope');
  assert.equal(r.capability,'report_out_of_scope');
});

test('model cannot insert unstated job requirements as if supplied by the visitor',async()=>{
  const q='آیا برای شغل آتش نشانی مناسبه؟';
  const r=await resolveQuestion(q,profile,routed(INTENTS.JOB,{
    job_target:'owner',job_role:'آتش نشانی',job_requirements:['توانایی بالا رفتن از نردبان']
  }));
  assert.equal(r.capability,'ask_clarifying_question');
  assert.doesNotMatch(r.answer,/نردبان/);
});

test('job comparison with documented Python skill still works',async()=>{
  const q='آیا برای شغل برنامه نویس Python مناسبه؟';
  const r=await resolveQuestion(q,profile,routed(INTENTS.JOB,{
    job_target:'owner',job_role:'برنامه نویس',job_requirements:['Python']
  }));
  assert.equal(r.capability,'answer_from_record');
  assert.match(r.answer,/Python/);
  assert.deepEqual(r.fields_read,['skills[]']);
});

test('unpublished skills are never exposed through job evidence gaps',async()=>{
  const privateProfile=structuredClone(profile);
  privateProfile.limits.published_fields=privateProfile.limits.published_fields.filter(f=>f!=='skills[]');
  const r=await resolveQuestion('آیا برای شغل آتش نشانی مهارت بدنی دارم؟',privateProfile,
    routed(INTENTS.JOB,{job_target:'owner',job_role:'آتش نشانی',job_requirements:['مهارت بدنی']}));
  assert.equal(r.capability,'refuse_unpublished_fact');
  assert.deepEqual(r.fields_read,[]);
});

test('router prompt requests job scope and explicitly named requirements',async()=>{
  const oldKey=process.env.GAPGPT_API_KEY,oldModel=process.env.GAPGPT_MODEL;
  try {
    process.env.GAPGPT_API_KEY='test-only-not-real-key';process.env.GAPGPT_MODEL='test-model';
    const response=await modelRoute('آیا آمادگی بدنی برای آتش نشانی مناسبه؟',profile,null,async(url,req)=>{
      const instructions=JSON.parse(req.body).messages[0].content;
      assert.match(instructions,/job_target/);
      assert.match(instructions,/Do not invent industry-specific job requirements/);
      assert.match(instructions,/out_of_scope/);
      return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({intent:'out_of_scope',job_target:'general'})}}]})};
    });
    assert.equal(response.route.intent,'out_of_scope');
  } finally {
    if(oldKey===undefined) delete process.env.GAPGPT_API_KEY; else process.env.GAPGPT_API_KEY=oldKey;
    if(oldModel===undefined) delete process.env.GAPGPT_MODEL; else process.env.GAPGPT_MODEL=oldModel;
  }
});

// Regression: a concrete mixed Persian/English job question was incorrectly
// re-asked even though both Python and Ansible were in the user's question.
test('Python and Ansible job: report Python evidence and missing Ansible, not clarify',async()=>{
  const q='آیا برای شغل برنامه‌نویس ansible و Python مناسبم؟';
  const r=await resolveQuestion(q,profile,routed(INTENTS.JOB,{
    job_target:'owner',job_role:'برنامه‌نویس',job_requirements:['ansible','Python'],
    needs_clarification:true
  }));
  assert.equal(r.intent,'job_fit');
  assert.equal(r.capability,'answer_from_record');
  assert.match(r.answer,/Python 3/);
  assert.match(r.answer,/ansible/i);
  assert.match(r.answer,/شواهدی.*ثبت نشده/);
  assert.deepEqual(r.fields_read,['skills[]']);
});

test('incomplete model extraction still sees explicitly typed Python and Ansible',async()=>{
  const q='آیا برای شغل برنامه‌نویس ansible و Python مناسبم؟';
  const r=await resolveQuestion(q,profile,routed(INTENTS.JOB,{
    job_target:'owner',needs_clarification:true,job_requirements:[]
  }));
  assert.equal(r.capability,'answer_from_record');
  assert.match(r.answer,/Python 3/);
  assert.match(r.answer,/ansible/i);
});

test('model cannot inject unmentioned job requirement into answer',async()=>{
  const q='آیا برای شغل برنامه‌نویس Python مناسبم؟';
  const r=await resolveQuestion(q,profile,routed(INTENTS.JOB,{
    job_target:'owner',job_role:'برنامه‌نویس',job_requirements:['Ansible','Python']
  }));
  assert.equal(r.capability,'answer_from_record');
  assert.match(r.answer,/Python 3/);
  assert.doesNotMatch(r.answer,/Ansible/i);
});

test('job with no listed requirements still asks for requirements',async()=>{
  const q='آیا برای این موقعیت شغلی مناسبم؟';
  const r=await resolveQuestion(q,profile,routed(INTENTS.JOB,{
    job_target:'owner',job_role:null,job_requirements:[],needs_clarification:true
  }));
  assert.equal(r.capability,'ask_clarifying_question');
});

test('generic occupation question remains out of scope',async()=>{
  const q='آیا Ansible و Python برای برنامه‌نویسی خوب هستند؟';
  const r=await resolveQuestion(q,profile,routed(INTENTS.JOB,{
    job_target:'general',job_requirements:['Ansible','Python'],needs_clarification:false
  }));
  assert.equal(r.capability,'report_out_of_scope');
});
