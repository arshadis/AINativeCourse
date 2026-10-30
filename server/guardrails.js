// One publication policy for both response construction and tracing.
const normalizePath = path => path.replace(/\[[^\]]+\]/g, '[]');
export function isAllowed(profile, action) {
  return profile.limits.allowed_actions.includes(action);
}
export function published(profile, path) {
  const approved = profile.limits.published_fields;
  return approved.includes(path) || approved.includes(normalizePath(path));
}
export function allPublished(profile, paths) {
  return paths.every(path => published(profile, path));
}
export function traced(profile, action, intent, answer, fields = [], extra = {}) {
  if (!isAllowed(profile, action)) throw new Error(`Action not allowed: ${action}`);
  // Never hide an unauthorized source from the trace while still using it in the answer.
  if (!allPublished(profile, fields)) throw new Error('Attempted to answer from an unpublished field');
  return { intent, capability: action, fields_read: fields, answer, ...extra };
}
// If model context is needed later, it must also follow the publication allowlist.
export function publicModelContext(profile) {
  const c = profile.courses.map(course => ({
    ...(published(profile, `courses[${course.id}].title`) ? {title:course.title} : {}),
    ...(published(profile, `courses[${course.id}].topics`) ? {topics:course.topics} : {})
  }));
  const p = profile.projects.map(project => ({
    ...Object.fromEntries(['title','summary','stack','skills'].filter(field =>
      published(profile, `projects[${project.id}].${field}`)).map(field=>[field,project[field]]))
  }));
  return {courses:c, projects:p, skills:published(profile,'skills[]')?profile.skills:[]};
}
