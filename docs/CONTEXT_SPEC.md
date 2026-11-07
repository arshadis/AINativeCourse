# Context contract — AI-Native Personal Page

The model is a semantic **intent router**, NOT an answer generator. `profile.json` is the canonical, separately stored source for biography; Open Library is the external source for book metadata. `limits` remains binding regardless of the model's output.

## Model input

`server/llm.js` sends a system instruction defining the supported intents and output format, then a user message serialized as:

```json
{
  "question": "What courses have you taken?",
  "public_context": {
    "supported_topics": ["..."],
    "courses": [
      {"id":"ai_native_systems_design","title":"AI-Native Systems Design"},
      {"id":"internet_of_things","title":"اینترنت اشیا (Internet of Things)"}
    ],
    "projects": [{"id":"haftehchin","title":"هفته‌چین (HaftehChin)"}],
    "skills": ["HTML5", "..."],
    "capabilities": {
      "allowed_actions": ["answer_from_record", "answer_from_external_api", "ask_clarifying_question", "refuse_unpublished_fact", "report_out_of_scope"],
      "forbidden_actions": ["send_email", "book_meeting", "represent_sharif_university"]
    },
    "important_missing_facts": ["course completion and grades are not recorded", "unpublished personal details must not be inferred"]
  },
  "conversation_state": null
}
```

The example catalog is abbreviated. It is built **at request time** from `profile.json` and the publication allowlist. Actual grades, private biography, project details, and model API credentials are not sent. In particular, existing `courses[].topics` arrays are empty and the data contains no course completion status.

## Model output (classification only)

```json
{
  "intent": "list_courses",
  "subject": "courses",
  "entity_id": null,
  "focus": "unspecified",
  "needs_clarification": false
}
```

Intent enum: `project_summary`, `project_details`, `list_projects`, `list_courses`, `list_skills`, `reading_recommendation`, `job_fit`, `unclear`, `out_of_scope`.

Project focus enum: `summary`, `features`, `stack`, `goal`, `architecture`, `runtime`, `result`, `skills`, `unspecified`.

`server/context.js` validates the route and resolves only existing and published course/project IDs. Unknown IDs are rejected. `server/resolve.js` chooses a permitted capability, retrieves only approved fields, and constructs the final answer. The model does not provide answer text or external URLs.

## State and clarification

The response returns a small `next_state` such as:

```json
{"pending_intent":"reading_recommendation","entity_id":null}
```

The browser sends this back only with its next question. It is not a trusted authorization source, is not stored across browser tabs or page reloads, and `sanitizeState` checks it against the known intent and entity sets. Example: `چه کتابی بخونم؟` -> ask which course/project -> `اینترنت اشیا` -> answer from Open Library.

## Permission boundary

Every answer and Trace passes through `traced()`, which verifies `limits.allowed_actions` and every referenced `limits.published_fields` path. Explicit private/unauthorized queries are blocked before any model request. Model classification does not override those server checks. Missing facts are not inferred. The classifier may be wrong; unclear questions trigger clarification.

## Errors and latency

`model_diagnostics` reports only sanitized status (`ok`, `timeout`, `http_error`, `invalid_model_json`, `invalid_intent`, etc.), HTTP status if available, and latency. `external_latency_ms` and `total_latency_ms` distinguish model, book-search, and total processing time. Raw upstream errors, credentials, private profile data, and prompt text are not returned in diagnostics. If GapGPT fails, the page may answer with a deterministic fallback and marks it `rules_fallback`; this is not proof that a model answered the query.

## Assignment alignment

The minimum three required user tasks are project summary, reading recommendations from courses/projects, and job fit. Extra intents (`list_courses`, `list_skills`, project details) are refinements **within the same portfolio boundary**. Allowed capabilities and authority limits stay unchanged. Public deployment, not local execution alone, is required for final submission.

## Semantic scope precision

The intent classifier now distinguishes what the visitor asks to **do** from a topic mentioned
in the question. Listing *recorded* courses is allowed; recommending *future courses* is not
supported by the profile or the connected book API, and must be out of scope. Reading/book
recommendations grounded in recorded courses/projects remain allowed. Comparing the portfolio
owner's documented skills to a supplied job description is allowed; job search, vacancies, and
career placement are not. Plain first-person statements like "I know Python" are ambiguous
about speaker and requested action and prompt a targeted question.

These contrasts are semantic model instructions rather than a growing list of text-matching
rules. The model can still misclassify; exercise the exact sentences (and paraphrases) against
the live GapGPT API and inspect the Trace. No automated local test proves provider behavior.
