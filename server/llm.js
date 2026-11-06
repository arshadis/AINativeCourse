// The LLM classifies intent ONLY. The server alone constructs answers from approved sources.
// GapGPT (Chat Completions) is preferred when configured; OpenAI Responses is optional.
import {INTENTS} from './intents.js';

const modelOptions = [INTENTS.PROJECT, INTENTS.READING, INTENTS.JOB, INTENTS.UNCLEAR, INTENTS.OUT];
const instructions = `Classify a user's question for a personal portfolio. Return ONLY a JSON object like {"intent":"project_summary"} with one of these values: ${modelOptions.join(', ')}. Never answer the question or add factual claims. If the request does not concern a project, reading based on the listed courses, or job fit, choose out_of_scope. If unclear, choose unclear.`;

function extractIntent(raw) {
  if (typeof raw !== 'string') return null;
  try {
    const text = raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
    const data=JSON.parse(text);
    return modelOptions.includes(data.intent) ? data.intent : null;
  } catch { return null; }
}

export async function modelIntent(question, fetcher = fetch) {
  if (process.env.GAPGPT_API_KEY && process.env.GAPGPT_MODEL) {
    const base = (process.env.GAPGPT_BASE_URL || 'https://api.gapgpt.app/v1').replace(/\/+$/, '');
    // Restrict endpoint to HTTPS to avoid sending credentials over plain HTTP.
    if (!base.startsWith('https://')) return null;
    const response = await fetcher(`${base}/chat/completions`, {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: {'Content-Type':'application/json', 'Authorization':`Bearer ${process.env.GAPGPT_API_KEY}`},
      body: JSON.stringify({model:process.env.GAPGPT_MODEL, temperature:0,
        messages:[{role:'system',content:instructions},{role:'user',content:question}]})
    });
    if (!response.ok) return null;
    const data = await response.json();
    return extractIntent(data.choices?.[0]?.message?.content);
  }

  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) return null;
  const response = await fetcher('https://api.openai.com/v1/responses', {
    method: 'POST', signal: AbortSignal.timeout(10000),
    headers: {'Content-Type':'application/json','Authorization':`Bearer ${process.env.OPENAI_API_KEY}`},
    body: JSON.stringify({model:process.env.OPENAI_MODEL,store:false,instructions,input:question,
      text:{format:{type:'json_schema',name:'portfolio_intent',strict:true,
        schema:{type:'object',properties:{intent:{type:'string',enum:modelOptions}},required:['intent'],additionalProperties:false}}}})
  });
  if (!response.ok) return null;
  const data=await response.json();
  const raw=(data.output||[]).flatMap(x=>x.content||[]).find(c=>c.type==='output_text')?.text;
  return extractIntent(raw);
}
