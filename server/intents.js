// Deterministic policy checks and model-independent fallback classification.
// The LLM is the normal intent router; these rules are not the primary classifier.
export const INTENTS = Object.freeze({
  PROJECT: 'project_summary',
  PROJECT_DETAILS: 'project_details',
  LIST_PROJECTS: 'list_projects',
  LIST_COURSES: 'list_courses',
  LIST_SKILLS: 'list_skills',
  READING: 'reading_recommendation',
  JOB: 'job_fit',
  UNCLEAR: 'unclear',
  OUT: 'out_of_scope',
  PRIVATE: 'private_fact',
  UNAUTHORIZED: 'unauthorized_action',
});

export const MODEL_INTENTS = Object.freeze([
  INTENTS.PROJECT, INTENTS.PROJECT_DETAILS, INTENTS.LIST_PROJECTS,
  INTENTS.LIST_COURSES, INTENTS.LIST_SKILLS, INTENTS.READING,
  INTENTS.JOB, INTENTS.UNCLEAR, INTENTS.OUT,
]);

export const PROJECT_FOCI = Object.freeze([
  'summary', 'features', 'stack', 'goal', 'architecture', 'runtime', 'result', 'skills', 'unspecified',
]);

export function normalize(value = '') {
  return String(value).toLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک')
    .replace(/[\u200c\u200d]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function policyIntent(question) {
  const q = normalize(question);
  if (/(شماره (تلفن|موبایل|تماس)|تلفن شخصی|آدرس خانه|آدرس منزل|نمره|معدل|حقوق شخصی|شماره ملی|تاریخ تولد|کارفرمای قبلی|سابقه شغلی شخصی|phone number|home address|grade|gpa|salary|date of birth|previous employer)/i.test(q)) return INTENTS.PRIVATE;
  if (/(ایمیل (بفرست|ارسال کن)|ایمیل بزن|جلسه (رزرو|ثبت) کن|قرار ملاقات (بذار|بگیر)|از طرف دانشگاه|send (an )?email|book (a )?meeting|on behalf of sharif)/i.test(q)) return INTENTS.UNAUTHORIZED;
  return null;
}

// A fallback should be useful but should not pretend to replace semantic understanding.
export function detectIntent(question) {
  const q = normalize(question);
  if (!q) return INTENTS.UNCLEAR;
  const policy = policyIntent(q);
  if (policy) return policy;
  if (/(i have (a )?skill|i know python|من مهارت دارم)/i.test(q)) return INTENTS.UNCLEAR;
  if (/(شغل|استخدام|موقعیت شغلی|رزومه|job|vacanc|hire|career|fit for|مناسب.*(کار|توسعه دهنده|برنامه نویس)|توسعه دهنده|برنامه نویس)/i.test(q)) return INTENTS.JOB;
  if (/(مطالعه|کتاب|چه بخون|بخونم|بخوان|منبع|منابع|یاد بگیر|پیشنهاد (خواندن|مطالعه)|reading|read|book|learn|study)/i.test(q)) return INTENTS.READING;
  if (/(چه درس|کدام درس|درس هایی|درسهای|دروس|واحدهای درسی|course|classes|subjects)/i.test(q)) return INTENTS.LIST_COURSES;
  if (/(مهارت( ها|ها|های|ت)|توانایی( ها|ها|های)|skills|what can you do|tech skills)/i.test(q)) return INTENTS.LIST_SKILLS;
  if (/(چه پروژه|کدام پروژه|پروژه ها|پروژه های|projects)/i.test(q)) return INTENTS.LIST_PROJECTS;
  if (/(قابلیت|ویژگی|فناوری|تکنولوژی|معماری|تکنیک|چطور کار|پیاده سازی|امکانات|feature|architecture|technology|stack|how does)/i.test(q)) return INTENTS.PROJECT_DETAILS;
  if (/(پروژه|هفته چین|hafteh|خلاصه|معرفی.*(کار|اپ)|project)/i.test(q)) return INTENTS.PROJECT;
  if (/(^|\s)(سلام|hello|hi)(\s|$)/i.test(q)) return INTENTS.UNCLEAR;
  return INTENTS.OUT;
}

export function findCourse(question, courses) {
  const q = normalize(question);
  const aliases = {
    ai_native_systems_design: ['ai native', 'ai-native', 'ای آی نیتیو', 'هوش مصنوعی نیتیو', 'ai native systems design'],
    internet_of_things: ['اینترنت اشیا','iot', 'internet of things'],
    macroeconomics: ['اقتصاد کلان','ماکرو','macroeconomics'],
    world_economic_history: ['تاریخ اقتصادی جهان','تاریخ اقتصادی','economic history'],
  };
  return courses.filter(c => (aliases[c.id] || [c.title]).some(a => q.includes(normalize(a))));
}

export const SKILLS = Object.freeze({
  'HTML5': ['html', 'فرانت اند', 'frontend', 'وب'],
  'CSS3': ['css', 'فرانت اند', 'frontend', 'وب'],
  'JavaScript (Vanilla JS)': ['javascript', 'java script','جاوا اسکریپت','js', 'فرانت اند', 'frontend', 'وب'],
  'Python 3': ['python', 'پایتون'],
  'JSON': ['json'],
  'طراحی واکنش‌گرا': ['responsive','ریسپانسیو','واکنش گرا'],
  'طراحی رابط کاربری راست‌به‌چپ': ['rtl','راست به چپ'],
});

export function matchJobSkills(question, skills) {
  const q = normalize(question);
  const matches = [];
  for (const skill of skills) {
    const words = SKILLS[skill] || [skill];
    if (words.some(w => q.includes(normalize(w)))) matches.push(skill);
  }
  return [...new Set(matches)];
}
