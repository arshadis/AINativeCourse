// The only external knowledge source for reading suggestions.
// Official API: https://openlibrary.org/dev/docs/api/search
const queries = {
  ai_native_systems_design: 'artificial intelligence software architecture',
  internet_of_things: 'internet of things',
  macroeconomics: 'macroeconomics',
  world_economic_history: 'economic history world',
  haftehchin: 'javascript web applications',
};
export async function searchBooks(courseId, fetcher = fetch) {
  const q = queries[courseId];
  if (!q) return [];
  const params = new URLSearchParams({q, limit:'3', fields:'key,title,author_name'});
  const url = `https://openlibrary.org/search.json?${params}`;
  const response = await fetcher(url, {signal: AbortSignal.timeout(6000), headers:{'User-Agent': 'PersonalAINativePage/0.1 (educational assignment)'}});
  if (!response.ok) throw new Error('External API unavailable');
  const body = await response.json();
  return (Array.isArray(body.docs) ? body.docs : []).filter(b=>typeof b.title==='string')
    .slice(0,3).map(b=>({title:b.title, authors: Array.isArray(b.author_name)?b.author_name.slice(0,2):[],
      url: /^\/works\/OL\d+W$/.test(b.key || '') ? `https://openlibrary.org${b.key}` : (/^OL\d+W$/.test(b.key || '') ? `https://openlibrary.org/works/${b.key}` : 'https://openlibrary.org/')}));
}
