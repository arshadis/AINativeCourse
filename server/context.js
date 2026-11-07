// The model receives a compact catalog of PUBLIC entity identifiers and titles,
// not unpublished fields, raw biography, or API keys.
import {published} from './guardrails.js';
import {INTENTS, MODEL_INTENTS} from './intents.js';

export function publicContext(profile) {
  return {
    supported_topics: ['portfolio projects and their recorded details', 'registered courses',
      'recorded skills', 'reading suggestions related to courses/projects',
      'skill evidence for a described job'],
    courses: profile.courses.filter(c=>published(profile,`courses[${c.id}].title`))
      .map(c=>({id:c.id,title:c.title})),
    projects: profile.projects.filter(p=>published(profile,`projects[${p.id}].title`))
      .map(p=>({id:p.id,title:p.title})),
    skills: published(profile,'skills[]') ? profile.skills.slice(0,40) : [],
    ...(published(profile,'limits')?{capabilities:{
      allowed_actions:[...profile.limits.allowed_actions],
      forbidden_actions:[...profile.limits.forbidden_actions],
    }}:{}),
    important_missing_facts: ['course completion and grades are not recorded',
      'unpublished personal details must not be inferred'],
  };
}

// Client-carried state is untrusted; reconstruct from an allowlisted shape on every request.
export function sanitizeState(input, profile) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const pending = input.pending_intent;
  if (![INTENTS.READING, INTENTS.JOB, INTENTS.PROJECT, INTENTS.PROJECT_DETAILS].includes(pending)) return null;
  const entityId = typeof input.entity_id === 'string' &&
    [...profile.courses,...profile.projects].some(e=>e.id===input.entity_id)
      ? input.entity_id : null;
  return {pending_intent:pending, entity_id:entityId};
}

export function normalizeRoute(value, profile) {
  if (typeof value === 'string') value={intent:value}; // backwards-compatible test injection
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!MODEL_INTENTS.includes(value.intent)) return null;
  let subject;
  if (value.intent===INTENTS.READING) subject=value.subject==='projects'?'projects':'courses';
  else if (value.intent===INTENTS.LIST_COURSES) subject='courses';
  else if ([INTENTS.PROJECT,INTENTS.PROJECT_DETAILS,INTENTS.LIST_PROJECTS].includes(value.intent)) subject='projects';
  else if ([INTENTS.LIST_SKILLS,INTENTS.JOB].includes(value.intent)) subject='skills';
  else if (value.intent===INTENTS.UNCLEAR &&
    ['projects','courses','skills','job'].includes(value.subject)) subject=value.subject;
  else subject='unknown';
  const candidates = subject==='courses'?profile.courses:subject==='projects'?profile.projects:[];
  const entityId = typeof value.entity_id==='string' && candidates.some(e=>e.id===value.entity_id &&
    published(profile,`${subject}[${e.id}].title`)) ? value.entity_id : null;
  const allowedFocus = new Set(['summary','features','stack','goal','architecture','runtime','result','skills','unspecified']);
  return {
    intent:value.intent,
    subject,
    entity_id:entityId,
    // A named-but-unrecorded entity is merely a quote from the visitor's message,
    // never a new course/project fact. The resolver checks the quote against the input.
    entity_mention:[INTENTS.READING,INTENTS.UNCLEAR].includes(value.intent) &&
      typeof value.entity_mention==='string' ? value.entity_mention.trim().slice(0,100) : null,
    focus:allowedFocus.has(value.focus)?value.focus:'unspecified',
    needs_clarification:value.needs_clarification===true,
    // User-described job information, NEVER a verified external job standard.
    job_target:value.intent===INTENTS.JOB && ['owner','general','unclear'].includes(value.job_target)
      ? value.job_target : 'unclear',
    job_role:value.intent===INTENTS.JOB && typeof value.job_role==='string'
      ? value.job_role.trim().slice(0,100) : null,
    job_requirements:value.intent===INTENTS.JOB && Array.isArray(value.job_requirements)
      ? value.job_requirements.filter(v=>typeof v==='string').slice(0,6).map(v=>v.trim().slice(0,100)).filter(Boolean)
      : [],
  };
}
