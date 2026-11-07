import {detectIntent, findCourse, matchJobSkills, policyIntent, INTENTS, normalize} from './intents.js';
import {traced, published, allPublished} from './guardrails.js';
import {searchBooks} from './external.js';
import {modelRoute} from './llm.js';
import {normalizeRoute, sanitizeState} from './context.js';

const unknown = 'این اطلاعات در رکورد عمومی منتشر نشده‌اند؛ نمی‌توانم آن‌ها را حدس بزنم یا اعلام کنم.';
const listField = (collection,id,field)=>`${collection}[${id}].${field}`;
const projectFields = id=>[listField('projects',id,'title'),listField('projects',id,'summary'),listField('projects',id,'stack')];

// Use the visitor's actual words as job criteria, never model-only claims.
// The model identifies semantic requirements; this narrow lexical safety net
// captures explicitly typed Latin tech labels in a Persian job question when
// the model omits one (e.g. "برنامه‌نویس Ansible و Python").
function verifiedJobCriteria(question, modelRequirements=[]) {
  const q=normalize(question);
  const modelTerms=modelRequirements.flatMap(v=>v.split(/\s+و\s+|\s+and\s+|[،,/]/iu))
    .map(v=>v.trim()).filter(v=>v && normalize(q).includes(normalize(v)));
  const explicitTechnicalNames=/[\u0600-\u06ff]/u.test(question)
    ? Array.from(question.matchAll(/\b[A-Za-z][A-Za-z0-9+.#-]{1,39}\b/g),m=>m[0]).slice(0,10)
    : [];
  return [...new Map([...modelTerms,...explicitTechnicalNames]
    .map(v=>[normalize(v),v])).values()].slice(0,10);
}

// Do not substitute the only recorded project for an explicitly named unknown project.
function namesUnrecordedProject(question,profile) {
  const q=normalize(question);
  if (profile.projects.some(p=>q.includes(normalize(p.title)) || q.includes(normalize(p.id)) ||
    (p.id==='haftehchin' && /هفته\s*چین|hafteh\s*chin/i.test(q)))) return false;
  const name=q.match(/(?:پروژه|project)\s+([\p{L}\p{N}-]+)/iu)?.[1];
  return Boolean(name && !['ات','ام','من','خودم','رو','را','ی','ها','هام','هایم','my','the','about'].includes(name));
}

function safeProjectInfo(project,focus,profile) {
  const id=project.id;
  const field=name=>listField('projects',id,name);
  const candidates = focus==='summary' ? ['title','summary','stack'] :
    focus==='architecture'?['architecture.frontend','architecture.backend','architecture.storage','architecture.deployment'] :
    focus==='runtime'?['runtime.local_url','runtime.internet_required','runtime.registration_required','runtime.database_required'] :
    focus==='unspecified'?['title','features','stack'] : [focus];
  const fields=candidates.filter(name=>published(profile,field(name))).map(field);
  if (!fields.length) return null;
  const display={
    title:()=>project.title,
    summary:()=>project.summary,
    goal:()=>project.goal,
    features:()=>project.features.join('، '),
    stack:()=>project.stack.join('، '),
    skills:()=>project.skills.join('، '),
    result:()=>project.result,
    'architecture.frontend':()=>`فرانت‌اند: ${project.architecture.frontend}`,
    'architecture.backend':()=>`بک‌اند: ${project.architecture.backend}`,
    'architecture.storage':()=>`ذخیره‌سازی: ${project.architecture.storage}`,
    'architecture.deployment':()=>`استقرار: ${project.architecture.deployment}`,
    'runtime.local_url':()=>`آدرس اجرای محلی: ${project.runtime.local_url}`,
    'runtime.internet_required':()=>`نیاز به اینترنت: ${project.runtime.internet_required?'بله':'خیر'}`,
    'runtime.registration_required':()=>`نیاز به ثبت‌نام: ${project.runtime.registration_required?'بله':'خیر'}`,
    'runtime.database_required':()=>`نیاز به پایگاه داده: ${project.runtime.database_required?'بله':'خیر'}`,
  };
  return {fields, answer:fields.map(path=>display[path.slice(field('').length)]?.()).filter(Boolean).join('\n')};
}

export async function resolveQuestion(question,profile,deps={}) {
  const q=typeof question==='string'?question.trim().slice(0,1000):'';
  const state=sanitizeState(deps.state,profile);
  let intentSource='rules';
  let modelDiagnostics={status:'not_enabled',latency_ms:0};
  const make=(capability,intent,answer,fields=[],extra={})=>({
    ...traced(profile,capability,intent,answer,fields,extra),
    intent_source:intentSource,
    model_diagnostics:modelDiagnostics,
    next_state:null,
  });
  const clarify=(intent,answer,fields=[],pending=null)=>({
    ...make('ask_clarifying_question',intent,answer,fields),
    next_state:pending?{pending_intent:pending,entity_id:null}:null,
  });

  // Hard policy always runs before transmitting the question to an LLM.
  const policy=policyIntent(q);
  if (policy) {
    modelDiagnostics={status:'skipped_policy',latency_ms:0};
    if(policy===INTENTS.PRIVATE) return make('refuse_unpublished_fact',INTENTS.PRIVATE,unknown);
    return make('report_out_of_scope',INTENTS.UNAUTHORIZED,
      'این صفحه اجازه ارسال ایمیل، رزرو جلسه یا صحبت از طرف دانشگاه را ندارد.', ['limits']);
  }

  let route=null;
  if (deps.useModel) {
    try {
      const router = deps.modelRoute || (deps.modelIntent ? async (text)=>({route:await deps.modelIntent(text)}) : modelRoute);
      const result=await router(q,profile,state);
      const possibleRoute=result?.route ?? result; // accept old test doubles returning intent strings
      route=normalizeRoute(possibleRoute,profile);
      modelDiagnostics=result?.diagnostics ?? {status:route?'ok':'invalid_model_json',latency_ms:0};
      // Attribute source to the router actually called, not the presence of env vars.
      // Injected routers used by tests (or other adapters) are not proof of a GapGPT call.
      intentSource=route ? (deps.modelRoute || deps.modelIntent ? 'llm' : 'gapgpt') : 'rules_fallback';
      if (!route && modelDiagnostics.status==='ok') modelDiagnostics={...modelDiagnostics,status:'invalid_intent'};
    } catch(e) {
      modelDiagnostics={status:'router_error',latency_ms:0};
      intentSource='rules_fallback';
    }
  }
  if (!route) {
    const quick=detectIntent(q);
    const pending=state?.pending_intent;
    const followupCourse=pending===INTENTS.READING && findCourse(q,profile.courses).length===1;
    const followupJob=pending===INTENTS.JOB && /(python|javascript|react|sql|جاوا|پایتون|فرانت|web|وب|html|css)/i.test(normalize(q));
    route=normalizeRoute({intent:followupCourse?INTENTS.READING:followupJob?INTENTS.JOB:quick},profile);
  }
  // A one-word reply to a pending course clarification can be resolved against the
  // validated catalog even if the model itself marked the isolated phrase unclear.
  if (route.intent===INTENTS.UNCLEAR && state?.pending_intent===INTENTS.READING &&
      findCourse(q,profile.courses).length===1) {
    route=normalizeRoute({intent:INTENTS.READING,subject:'courses'},profile);
  }
  // Even if the model used job_fit, explicit general-audience classification
  // cannot be treated as personal suitability evidence.
  if (route.intent===INTENTS.JOB && route.job_target==='general') {
    route=normalizeRoute({intent:INTENTS.OUT},profile);
  }
  const intent=route.intent;
  // The model's extracted requirement is untrusted; accept it only if literally
  // supported by the current visitor question, not invented by the LLM.
  const askedJobRequirements=verifiedJobCriteria(q,route.job_requirements);
  const askedJobRole=route.job_role && normalize(q).includes(normalize(route.job_role))
    ? route.job_role : null;
  // A job comparison has enough information when at least one explicit
  // criterion is present. Do not trust model needs_clarification to override
  // criteria supplied by the visitor (nor assume a role implies all criteria).
  const hasJobCriteria=intent===INTENTS.JOB && (
    askedJobRequirements.length>0 || matchJobSkills(q,profile.skills).length>0);
  if (intent===INTENTS.UNCLEAR || (route.needs_clarification && !hasJobCriteria)) {
    if (intent===INTENTS.READING) return clarify(intent,'برای کدام درس ثبت‌شده کتاب یا منبع مطالعه می‌خواهید؟',[],INTENTS.READING);
    if (intent===INTENTS.JOB) return clarify(intent,'لطفاً مهارت‌های موردنیاز یا شرح موقعیت شغلی را مشخص کنید.',[],INTENTS.JOB);
    if (intent===INTENTS.PROJECT || intent===INTENTS.PROJECT_DETAILS) return clarify(intent,'درباره کدام پروژه ثبت‌شده و کدام بخش آن سؤال دارید؟',[],INTENTS.PROJECT);
    if (detectIntent(q)===INTENTS.READING) return clarify(INTENTS.UNCLEAR,
      'برای کدام درس یا پروژه می‌خواهید پیشنهاد مطالعه بگیرید؟',[],INTENTS.READING);
    if (route.subject==='skills') return clarify(INTENTS.UNCLEAR,
      'می‌خواهید مهارت‌های ثبت‌شده صاحب پروفایل را بدانید یا درباره مهارت‌های خودتان سؤال دارید؟');
    if (route.subject==='job') return clarify(INTENTS.UNCLEAR,
      'منظورتان ارزیابی تناسب مهارت‌های ثبت‌شده صاحب پروفایل با یک موقعیت شغلی است؟ لطفاً شرح شغل را مشخص کنید.');
    return clarify(INTENTS.UNCLEAR,'منظورتان سؤال درباره پروژه‌ها، درس‌ها، مهارت‌های ثبت‌شده، پیشنهاد مطالعه یا تناسب شغلی است؟');
  }

  if (intent===INTENTS.LIST_COURSES) {
    const visible=profile.courses.filter(c=>published(profile,listField('courses',c.id,'title')));
    if (!visible.length) return make('refuse_unpublished_fact',intent,unknown);
    return make('answer_from_record',intent,
      `درس‌های ثبت‌شده در پروفایل:\n${visible.map((c,i)=>`${i+1}. ${c.title}`).join('\n')}\nوضعیت گذراندن، قبولی و نمره این درس‌ها در رکورد مشخص نشده است.`,
      visible.map(c=>listField('courses',c.id,'title')));
  }
  if (intent===INTENTS.LIST_SKILLS) {
    if (!published(profile,'skills[]')) return make('refuse_unpublished_fact',intent,unknown);
    return make('answer_from_record',intent,
      `مهارت‌های ثبت‌شده در پروفایل:\n${profile.skills.map((s,i)=>`${i+1}. ${s}`).join('\n')}\nاین فهرست مدرکی برای سطح تسلط یا سابقه شغلی محسوب نمی‌شود.`,
      ['skills[]']);
  }
  if (intent===INTENTS.LIST_PROJECTS) {
    const visible=profile.projects.filter(p=>published(profile,listField('projects',p.id,'title')));
    if (!visible.length) return make('refuse_unpublished_fact',intent,unknown);
    return make('answer_from_record',intent,
      `پروژه‌های ثبت‌شده:\n${visible.map((p,i)=>`${i+1}. ${p.title}`).join('\n')}`,
      visible.map(p=>listField('projects',p.id,'title')));
  }
  if ([INTENTS.PROJECT,INTENTS.PROJECT_DETAILS].includes(intent)) {
    const projects=profile.projects;
    if (!projects.length) return make('refuse_unpublished_fact',intent,'پروژه‌ای در رکورد عمومی ثبت نشده است.');
    if (namesUnrecordedProject(q,profile)) return clarify(intent,
      `پروژه نام‌برده در رکورد ثبت نشده. منظورتان کدام پروژه است؟ ${projects.filter(p=>published(profile,listField('projects',p.id,'title'))).map(p=>p.title).join('، ')}`);
    const selected=route.entity_id ? projects.find(p=>p.id===route.entity_id) :
      (projects.length===1 ? projects[0] : projects.find(p=>normalize(q).includes(normalize(p.title))));
    if (!selected) return clarify(intent,'منظورتان کدام پروژه ثبت‌شده است؟');
    const focus=intent===INTENTS.PROJECT?'summary':route.focus;
    const data=safeProjectInfo(selected,focus,profile);
    if (!data) return make('refuse_unpublished_fact',intent,unknown);
    // Summary requires all 3 public fields, never answer a partial summary from a secret record.
    if (focus==='summary'&&!allPublished(profile,projectFields(selected.id)))
      return make('refuse_unpublished_fact',intent,unknown);
    return make('answer_from_record',intent,data.answer,data.fields);
  }

  if (intent===INTENTS.READING) {
    const mentionedCourses=findCourse(q,profile.courses);
    const mentionedProjects=profile.projects.filter(p=>
      normalize(q).includes(normalize(p.title)) || normalize(q).includes(normalize(p.id)) ||
      (p.id==='haftehchin' && /هفته\s*چین|hafteh\s*chin/i.test(normalize(q))));
    const listed=mentionedCourses.length+mentionedProjects.length;
    const pending=state?.pending_intent===INTENTS.READING;
    let selected=null, collection=null, kind=null;
    if (listed===1) {
      if (mentionedCourses.length) {selected=mentionedCourses[0];collection='courses';kind='درس';}
      else {selected=mentionedProjects[0];collection='projects';kind='پروژه';}
    } else if (listed===0 && (pending ||
        (route.subject==='projects' && profile.projects.length===1 &&
         /(پروژه|project)/i.test(normalize(q)) && !namesUnrecordedProject(q,profile))) && route.entity_id) {
      collection=route.subject==='projects'?'projects':'courses';
      selected=profile[collection].find(item=>item.id===route.entity_id)||null;
      kind=collection==='courses'?'درس':'پروژه';
    }
    if (!selected) {
      const visibleCourses=profile.courses.filter(c=>published(profile,listField('courses',c.id,'title')));
      const visibleProjects=profile.projects.filter(p=>published(profile,listField('projects',p.id,'title')));
      const names=[...visibleCourses.map(c=>c.title),...visibleProjects.map(p=>p.title)];
      const fields=[...visibleCourses.map(c=>listField('courses',c.id,'title')),
        ...visibleProjects.map(p=>listField('projects',p.id,'title'))];
      return clarify(intent,`برای کدام درس یا پروژه منابع مطالعه می‌خواهید؟ ${names.join('، ')}`,
        fields,INTENTS.READING);
    }
    const field=listField(collection,selected.id,'title');
    if (!published(profile,field)) return make('refuse_unpublished_fact',intent,unknown);
    const search=deps.searchBooks||searchBooks;
    const started=performance.now();
    try {
      const books=await search(selected.id);
      const external_latency_ms=Math.round(performance.now()-started);
      if (!books.length) return make('answer_from_record',intent,
        `${kind} «${selected.title}» ثبت شده است؛ اما Open Library برای آن کتابی برنگرداند. نام منبع دیگری در رکورد نداریم.`,
        [field],{external_service:'Open Library',external_results:[],external_fields:[],external_status:'empty',external_latency_ms});
      const lines=books.map((b,i)=>`${i+1}. ${b.title}${b.authors?.length?' — '+b.authors.join('، '):''}`).join('\n');
      return make('answer_from_external_api',intent,
        `برای ${kind} «${selected.title}»، این کتاب‌ها در جستجوی Open Library پیدا شدند (لزوماً منابع رسمی درس یا پروژه نیستند):\n${lines}`,
        [field],{external_service:'Open Library',external_fields:['docs[].title','docs[].author_name','docs[].key'],external_results:books,
          external_status:'ok',external_latency_ms});
    } catch {
      return make('answer_from_record',intent,
        `${kind} «${selected.title}» ثبت شده، اما فعلاً Open Library در دسترس نیست؛ عنوان کتابی را بدون منبع تأییدشده حدس نمی‌زنم.`,
        [field],{external_service:'Open Library',external_status:'unavailable',external_latency_ms:Math.round(performance.now()-started)});
    }
  }

  if (intent===INTENTS.JOB) {
    if (!published(profile,'skills[]')) return make('refuse_unpublished_fact',intent,unknown);
    const skills=profile.skills;
    // Evidence can come ONLY from skills[]; the list of criteria comes ONLY
    // from text the visitor actually supplied (validated above).
    const matches=matchJobSkills(q,skills);
    const unsupported=askedJobRequirements.filter(requirement=>
      matchJobSkills(requirement,skills).length===0);
    const criteriaProvided=askedJobRequirements.length>0 || matches.length>0;
    if (!criteriaProvided) return clarify(intent,
      'برای ارزیابی تناسب صاحب پروفایل، مهارت‌ها یا شرایط موردنیاز موقعیت شغلی را بفرستید.',
      ['skills[]'],INTENTS.JOB);

    const context=askedJobRole ? `برای شغل «${askedJobRole}»، ` : 'برای این موقعیت شغلی، ';
    const confirmed=matches.length
      ? `مهارت‌های مرتبط و ثبت‌شده در پروفایل: ${matches.join('، ')}.`
      : 'برای معیارهای مطرح‌شده شواهد تأییدشده‌ای در رکورد عمومی نداریم.';
    const missing=unsupported.length
      ? ` درباره ${unsupported.map(x=>`«${x}»`).join('، ')} اطلاعاتی منتشر نشده و شواهدی در پروفایل ثبت نشده است؛ این به معنی نداشتن مهارت نیست، زیرا نبود اطلاعات به معنای نداشتن توانایی نیست.`
      : '';
    return make('answer_from_record',intent,
      `${context}${confirmed}${missing} این مقایسه صرفاً بر اساس اطلاعات منتشرشده است؛ سطح تسلط، تمام شرایط شغلی و مناسب‌بودن قطعی فرد قابل تأیید نیست.`,
      ['skills[]']);
  }
  return make('report_out_of_scope',INTENTS.OUT,
    'این صفحه فقط درباره پروژه‌ها، درس‌ها، مهارت‌های ثبت‌شده، پیشنهاد مطالعه و تناسب با موقعیت شغلی پاسخ می‌دهد.',['limits']);
}
