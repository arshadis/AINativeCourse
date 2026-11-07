// Contextual discovery: prompts are built ONLY from published profile fields.
// They are suggestions, not facts about the visitor or evidence used in the answer.
import {published} from './guardrails.js';
import {INTENTS} from './intents.js';

const clean = text => String(text || '').replace(/[\r\n\t]/g, ' ').trim();

export function suggestNextQuestions(profile, answer) {
  const options=[];
  const seen=new Set();
  const add=(label,question,sourceFields=[],mode='new')=>{
    if(sourceFields.some(field=>!published(profile,field))) return;
    const text=clean(question);
    if(!text || text.length>260 || seen.has(text)) return;
    seen.add(text);
    options.push({label:clean(label).slice(0,80),question:text,mode,source_fields:sourceFields});
  };
  const courses=profile.courses.filter(c=>published(profile,`courses[${c.id}].title`));
  const projects=profile.projects.filter(p=>published(profile,`projects[${p.id}].title`));
  const canReadSkills=published(profile,'skills[]');

  // A pending reading clarification gets *replies*, not unrelated questions.
  // The UI preserves its validated state when one of these is selected.
  if(answer?.next_state?.pending_intent===INTENTS.READING) {
    for(const c of courses) add(c.title,c.title,[`courses[${c.id}].title`],'reply');
    for(const p of projects) add(p.title,p.title,[`projects[${p.id}].title`],'reply');
    return options.slice(0,5);
  }

  const intent=answer?.intent;
  if([INTENTS.PROJECT,INTENTS.PROJECT_DETAILS,INTENTS.LIST_PROJECTS].includes(intent)) {
    for(const p of projects.slice(0,2)) {
      if(published(profile,`projects[${p.id}].features`))
        add('قابلیت‌های پروژه',`پروژه «${p.title}» چه قابلیت‌هایی دارد؟`,[`projects[${p.id}].title`,`projects[${p.id}].features`]);
      if(published(profile,`projects[${p.id}].stack`))
        add('فناوری‌های پروژه',`پروژه «${p.title}» با چه فناوری‌هایی ساخته شده؟`,[`projects[${p.id}].title`,`projects[${p.id}].stack`]);
      add('مطالعه مرتبط با پروژه',`برای پروژه «${p.title}» کتاب پیشنهاد بده`,[`projects[${p.id}].title`]);
    }
  }
  if([INTENTS.LIST_COURSES,INTENTS.READING].includes(intent)) {
    // Prefer a different course from the answer just given.
    const used=new Set(answer?.fields_read || []);
    for(const c of [...courses.filter(c=>!used.has(`courses[${c.id}].title`)),
      ...courses.filter(c=>used.has(`courses[${c.id}].title`))].slice(0,3)) {
      add(`کتاب برای ${c.title}`,`برای درس «${c.title}» کتاب پیشنهاد بده`,[`courses[${c.id}].title`]);
    }
  }
  if([INTENTS.LIST_SKILLS,INTENTS.JOB].includes(intent)) {
    if(canReadSkills) add('مهارت‌های مستند','چه مهارت‌هایی در پروفایل ثبت شده‌اند؟',['skills[]']);
    if(projects.length && published(profile,`projects[${projects[0].id}].stack`)) {
      add('فناوری‌های پروژه',`پروژه «${projects[0].title}» با چه فناوری‌هایی ساخته شده؟`,
        [`projects[${projects[0].id}].title`,`projects[${projects[0].id}].stack`]);
    }
  }
  // For refusals and unknown queries, offer safe on-topic ways to continue.
  if(options.length<2) {
    if(projects.length) add('پروژه‌های ثبت‌شده','چه پروژه‌هایی در پروفایل ثبت شده‌اند؟',
      projects.map(p=>`projects[${p.id}].title`));
    if(courses.length) add('درس‌های ثبت‌شده','چه درس‌هایی در پروفایل ثبت شده‌اند؟',
      courses.map(c=>`courses[${c.id}].title`));
    if(canReadSkills) add('مهارت‌های ثبت‌شده','چه مهارت‌هایی در پروفایل ثبت شده‌اند؟',['skills[]']);
  }
  // No unsupported or invented facts are needed to produce suggestions.
  // Policy outcomes never become a basis for suggesting a prohibited action.
  return options.slice(0,4);
}
