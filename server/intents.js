// Intent recognition: privacy/authority rules take precedence over any model.
export const INTENTS = Object.freeze({
  PROJECT: 'project_summary',
  READING: 'reading_recommendation',
  JOB: 'job_fit',
  UNCLEAR: 'unclear',
  OUT: 'out_of_scope',
  PRIVATE: 'private_fact',
  UNAUTHORIZED: 'unauthorized_action',
});
export function normalize(value = '') {
  return String(value).toLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک')
    .replace(/[\u200c\u200d]/g, ' ').replace(/\s+/g, ' ').trim();
}
export function detectIntent(question) {
  const q = normalize(question);
  if (!q) return INTENTS.UNCLEAR;
  if (/(شماره (تلفن|موبایل|تماس)|تلفن شخصی|آدرس خانه|آدرس منزل|نمره|معدل|حقوق شخصی|شماره ملی|تاریخ تولد|کارفرمای قبلی|سابقه شغلی شخصی|phone number|home address|grade|gpa|salary|date of birth|previous employer)/i.test(q)) return INTENTS.PRIVATE;
  if (/(ایمیل (بفرست|ارسال کن)|ایمیل بزن|جلسه (رزرو|ثبت) کن|قرار ملاقات (بذار|بگیر)|از طرف دانشگاه|send (an )?email|book (a )?meeting|on behalf of sharif)/i.test(q)) return INTENTS.UNAUTHORIZED;
  if (/(شغل|استخدام|موقعیت شغلی|رزومه|job|vacanc|hire|career|fit for|مناسب.*(کار|توسعه دهنده|برنامه نویس)|توسعه دهنده|برنامه نویس)/i.test(q)) return INTENTS.JOB;
  if (/(مطالعه|کتاب|چه بخون|بخونم|بخوان|منبع|منابع|یاد بگیر|پیشنهاد (خواندن|مطالعه)|reading|read|book|learn|study)/i.test(q)) return INTENTS.READING;
  if (/(پروژه|هفته چین|hafteh|خلاصه|معرفی.*(کار|اپ)|project)/i.test(q)) return INTENTS.PROJECT;
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
});
// Only match evidence from published skills. A lack of evidence is NOT proof of inability.
export function matchJobSkills(question, skills) {
  const q = normalize(question);
  const matches = [];
  for (const skill of skills) {
    const words = SKILLS[skill];
    if (words && words.some(w => q.includes(normalize(w)))) matches.push(skill);
  }
  return [...new Set(matches)];
}
