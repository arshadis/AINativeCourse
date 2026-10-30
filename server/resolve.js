import { detectIntent, findCourse, matchJobSkills, INTENTS, normalize } from './intents.js';
import {traced, published, allPublished} from './guardrails.js';
import {searchBooks} from './external.js';
import {modelIntent} from './llm.js';

const unknown = 'این اطلاعات در رکورد عمومی منتشر نشده‌اند؛ نمی‌توانم آن‌ها را حدس بزنم یا اعلام کنم.';
const listedProjectFields = id => [`projects[${id}].title`,`projects[${id}].summary`,`projects[${id}].stack`];
// In a one-project portfolio, "my project" is unambiguous; another explicit project name is not.
function namesUnrecordedProject(q, project) {
  if (normalize(q).includes(normalize(project.title).replace(/[()]/g,'')) || /هفته\s*چین|hafteh\s*chin/i.test(normalize(q))) return false;
  const named = normalize(q).match(/(?:پروژه|project)\s+([\p{L}\p{N}-]+)/iu)?.[1];
  return Boolean(named && !['ات','ام','من','خودم','رو','را','ی','ها','هام','هایم','my','the','about'].includes(named));
}
export async function resolveQuestion(question, profile, deps = {}) {
  const q = typeof question === 'string' ? question.trim().slice(0,1000) : '';
  const quick = detectIntent(q);
  // A model may refine ordinary intents but must not override privacy or authority checks.
  let intent = quick;
  if (![INTENTS.PRIVATE, INTENTS.UNAUTHORIZED].includes(quick) && deps.useModel) {
    try { intent = (await (deps.modelIntent || modelIntent)(q)) || quick; }
    catch { intent = quick; }
  }
  if (quick === INTENTS.PRIVATE) return traced(profile, 'refuse_unpublished_fact', 'private_fact', unknown);
  if (quick === INTENTS.UNAUTHORIZED) return traced(profile, 'report_out_of_scope', 'unauthorized_action',
    'این صفحه اجازه ارسال ایمیل، رزرو جلسه یا صحبت از طرف دانشگاه را ندارد.', ['limits']);
  if (intent === INTENTS.UNCLEAR) return traced(profile, 'ask_clarifying_question', 'unclear',
    'می‌خواهید درباره پروژه، مطالعه برای یکی از درس‌ها یا تناسب با یک شغل بدانید؟');
  if (intent === INTENTS.PROJECT) {
    const projects = profile.projects;
    if (!projects.length) return traced(profile,'refuse_unpublished_fact','project_summary','پروژه‌ای در رکورد عمومی ثبت نشده است.');
    const candidate = projects.length === 1
      ? (namesUnrecordedProject(q,projects[0]) ? null : projects[0])
      : projects.find(p => normalize(q).includes(normalize(p.title)) || normalize(q).includes(p.id));
    if (!candidate) {
      const titles=projects.filter(p=>published(profile,`projects[${p.id}].title`)).map(p=>p.title);
      return traced(profile, 'ask_clarifying_question', 'project_summary',
        `منظورتان کدام پروژه ثبت‌شده است؟ ${titles.join('، ')}`,titles.length?projects.filter(p=>published(profile,`projects[${p.id}].title`)).map(p=>`projects[${p.id}].title`):[]);
    }
    const fields=listedProjectFields(candidate.id);
    if (!allPublished(profile,fields)) return traced(profile,'refuse_unpublished_fact','project_summary',unknown);
    return traced(profile,'answer_from_record','project_summary',
      `${candidate.title}: ${candidate.summary}\nفناوری‌ها: ${candidate.stack.join('، ')}`, fields);
  }
  if (intent === INTENTS.READING) {
    const selected = findCourse(q,profile.courses);
    if (selected.length !== 1) {
      const visible=profile.courses.filter(c=>published(profile,`courses[${c.id}].title`));
      const fields=visible.map(c=>`courses[${c.id}].title`);
      return traced(profile,'ask_clarifying_question','reading_recommendation',
        `برای کدام درس منابع مطالعه می‌خواهید؟ ${visible.map(c=>c.title).join('، ')}`,fields);
    }
    const course=selected[0];
    const field=`courses[${course.id}].title`;
    if (!published(profile,field)) return traced(profile,'refuse_unpublished_fact','reading_recommendation',unknown);
    const search = deps.searchBooks || searchBooks;
    try {
      const books=await search(course.id);
      if (!books.length) return traced(profile,'answer_from_record','reading_recommendation',
        `درس «${course.title}» در رکورد ثبت شده است، اما Open Library نتیجه‌ای برای پیشنهاد کتاب برنگرداند. نام منابع دیگری در رکورد نداریم.`,
        [field],{external_service:'Open Library',external_results:[],external_fields:[]});
      const lines=books.map((b,i)=>`${i+1}. ${b.title}${b.authors?.length?' — '+b.authors.join('، '):''}`).join('\n');
      return traced(profile,'answer_from_external_api','reading_recommendation',
        `برای درس «${course.title}»، این نتایج جستجوی کتاب در Open Library پیدا شدند (فهرست رسمی منابع درس نیستند):\n${lines}`,
        [field], {external_service:'Open Library', external_fields:['docs[].title','docs[].author_name','docs[].key'], external_results:books});
    } catch {
      return traced(profile,'answer_from_record','reading_recommendation',
        `درس «${course.title}» ثبت شده، اما فعلاً سرویس Open Library در دسترس نیست؛ نمی‌توانم عنوان کتابی را بدون منبع تأییدشده پیشنهاد بدهم.`,
        [field],{external_service:'Open Library',external_status:'unavailable'});
    }
  }
  if (intent === INTENTS.JOB) {
    if (!published(profile,'skills[]')) return traced(profile,'refuse_unpublished_fact','job_fit',unknown);
    const skills=profile.skills;
    const matches=matchJobSkills(q,skills);
    // A requested qualification not in the record is unknown, not evidence of inability.
    const missingSkills=['React','SQL','Java','Docker','Kubernetes','TypeScript','AWS','Go'].filter(s =>
      new RegExp(`(^|[^a-z])${s.toLowerCase()}([^a-z]|$)`,'i').test(normalize(q)) &&
      !skills.some(k=>normalize(k).includes(normalize(s))));
    const fields=['skills[]'];
    if (!matches.length && !missingSkills.length) return traced(profile,'ask_clarifying_question','job_fit',
      'برای بررسی تناسب شغلی، کدام مهارت‌ها یا فناوری‌ها در آگهی موردنیاز هستند؟',fields);
    const found=matches.length ? `مهارت‌های مستند و مرتبط: ${matches.join('، ')}.` : 'برای مهارت‌های ذکرشده شواهد تأییدشده‌ای در رکورد نداریم.';
    const gap=missingSkills.length ? ` درباره ${missingSkills.join('، ')} اطلاعاتی منتشر نشده است؛ این به معنی نداشتن آن مهارت‌ها نیست.` : '';
    return traced(profile,'answer_from_record','job_fit',
      `${found}${gap} این یک تطبیق اولیه با رکورد منتشرشده است، نه تضمین استخدام یا اثبات کفایت همه شرایط شغل.`,fields);
  }
  return traced(profile,'report_out_of_scope','out_of_scope',
    'این صفحه فقط درباره پروژه‌ها، درس‌ها، پیشنهاد مطالعه و تناسب مهارتی با موقعیت شغلی پاسخ می‌دهد.', ['limits']);
}
