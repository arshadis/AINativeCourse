# Explainability & Creativity — Assignment 1

## Explainability: evidence journey

The page already shows an exact Trace with intent, intent source, capability,
profile fields read, external API fields, provider status and latency.
The upgraded UI adds a **three-step evidence journey** derived exclusively from
those existing response fields:

1. Classification / policy path (`intent_source`).
2. The source of the answer (`fields_read`, `external_service`, capability).
3. The permitted action (`capability`).

The journey is a readable summary **of the trace**, not an independent source of facts.
The detailed technical trace stays available and authoritative.

## Creativity: context-aware exploration

Beyond the assignment's minimum requirements, each answer may include a short
set of **context-dependent suggested next questions**, computed by
`server/suggestions.js` from the public profile and the response intent.

Examples:
- After a project summary: explore the project's documented features,
  technologies or related reading.
- After a course list: explore books related to registered courses.
- After the question "چه کتابی بخونم؟": offer titles of recorded courses as
  one-click clarification replies without discarding the pending question.
- After a refusal: show safe questions still answerable within the portfolio.

Important guardrails:
- Suggestions are built from the record; no new courses, skills or projects
  are invented or saved.
- Each suggestion has `source_fields`, which must all pass the publication
  allowlist. These indicate the evidence supporting the **suggestion**, not the
  fields read while constructing the **previous answer**.
- Clicking a suggestion only fills the input; the visitor submits it explicitly.
- A clarification `mode=reply` preserves the pending intent; a new question
  resets it. The server always revalidates the state.
- No extra external API call or key is required to construct suggestions.
- Suggestions do not perform email, meeting booking, employment search or any
  other forbidden action.

## Local verification

```powershell
npm test
npm start
```

Try "چه کتابی بخونم؟" and click the proposed Internet of Things course.
Confirm that the follow-up is treated as a reading request. Then ask for a
project summary and inspect the three-step evidence journey and detailed Trace.

Before submission, deploy the changes to Hamravesh and capture screenshots
from the **public** page. The offline tests use simulated model responses and
cannot establish live GapGPT availability.
