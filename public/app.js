const form = document.getElementById('ask');
const question = document.getElementById('question');
const send = document.getElementById('submit');
const sendLabel = send.querySelector('.button-label');
const resultPanel = document.getElementById('result');
const answerNode = document.getElementById('answer');
const statusNode = document.getElementById('request-status');
const countNode = document.getElementById('char-count');
const copyButton = document.getElementById('copy-answer');
const resultTag = document.getElementById('result-tag');
const nextQuestions = document.getElementById('next-questions');
const nextQuestionsList = document.getElementById('next-questions-list');
let state = null; // Only the pending clarification context, in this browser tab.
let isBusy = false;

const formatFa = value => new Intl.NumberFormat('fa-IR').format(value);
const updateCounter = () => { countNode.textContent = `${formatFa(question.value.length)} / ۱۰۰۰`; };
const setRequestStatus = (message, isError = false) => {
  statusNode.hidden = !message;
  statusNode.textContent = message;
  statusNode.classList.toggle('is-error', isError);
};
const setBusy = busy => {
  isBusy = busy;
  send.disabled = busy;
  question.readOnly = busy;
  sendLabel.textContent = busy ? 'در حال پردازش…' : 'بررسی سؤال';
  send.setAttribute('aria-busy', String(busy));
};
const setResultTag = capability => {
  const labels = {
    answer_from_record: 'پاسخ از پروفایل',
    answer_from_external_api: 'پاسخ از API خارجی',
    ask_clarifying_question: 'نیاز به روشن‌سازی',
    refuse_unpublished_fact: 'اطلاعات منتشرنشده',
    report_out_of_scope: 'خارج از محدوده',
  };
  resultTag.textContent = labels[capability] || 'پاسخ مستند';
  resultTag.className = 'result-pill';
  if (capability === 'ask_clarifying_question') resultTag.classList.add('is-clarifying');
  else if (capability === 'refuse_unpublished_fact' || capability === 'report_out_of_scope') resultTag.classList.add('is-refusal');
};

question.addEventListener('input', updateCounter);
question.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    if (!isBusy && question.value.trim()) form.requestSubmit();
  }
});
updateCounter();

document.querySelectorAll('[data-q]').forEach(button => button.addEventListener('click', () => {
  if (isBusy) return;
  state = null; // A new example is a new question, not a clarification reply.
  question.value = button.dataset.q;
  updateCounter();
  setRequestStatus('');
  question.focus();
}));

document.getElementById('reset').addEventListener('click', () => {
  if (isBusy) return;
  state = null;
  question.value = '';
  resultPanel.hidden = true;
  nextQuestions.hidden = true;
  nextQuestionsList.replaceChildren();
  document.getElementById('followup-hint').hidden = true;
  setRequestStatus('');
  updateCounter();
  question.focus();
});

copyButton.addEventListener('click', async () => {
  const value = answerNode.textContent.trim();
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    copyButton.textContent = '✓ کپی شد';
  } catch {
    copyButton.textContent = 'کپی امکان‌پذیر نبود';
  }
  // No timer needed; the button resets when the next result arrives.
});

function renderEvidenceFlow(data) {
  const sourceLabels = {
    gapgpt: 'GapGPT: تشخیص معنایی سؤال',
    llm: 'مدل زبانی: تشخیص سؤال',
    rules: 'بررسی محلی و سیاست دسترسی',
    rules_fallback: 'قواعد جایگزین پس از خطای مدل',
  };
  const actionLabels = {
    answer_from_record: 'پاسخ بر اساس رکورد',
    answer_from_external_api: 'پاسخ با داده API',
    ask_clarifying_question: 'درخواست روشن‌سازی',
    refuse_unpublished_fact: 'امتناع از اطلاعات منتشرنشده',
    report_out_of_scope: 'اعلام محدودیت صفحه',
  };
  const fields = Array.isArray(data.fields_read) ? data.fields_read : [];
  let evidence = fields.length ? `profile.json · ${fields.length} فیلد` : 'بدون خواندن اطلاعات شخصی';
  if (data.capability === 'answer_from_external_api' && data.external_service)
    evidence = `profile.json + ${data.external_service}`;
  else if (data.capability === 'ask_clarifying_question')
    evidence = fields.length ? 'عناوین عمومی پروفایل' : 'نیاز به اطلاعات بیشتر از کاربر';
  else if (data.capability === 'refuse_unpublished_fact') evidence = 'سیاست انتشار و حریم خصوصی';
  else if (data.capability === 'report_out_of_scope') evidence = 'محدوده مجاز صفحه';
  document.getElementById('flow-intent').textContent = sourceLabels[data.intent_source] || 'تشخیص سؤال';
  document.getElementById('flow-source').textContent = evidence;
  document.getElementById('flow-action').textContent = actionLabels[data.capability] || 'پاسخ مستند';
}

function renderNextQuestions(data) {
  nextQuestionsList.replaceChildren();
  const suggestions = Array.isArray(data.suggested_questions) ? data.suggested_questions : [];
  const valid = suggestions.filter(item =>
    item && typeof item.label === 'string' && typeof item.question === 'string' &&
    item.label.length <= 80 && item.question.length <= 260 && item.question.trim());
  nextQuestions.hidden = valid.length === 0;
  document.getElementById('next-questions-description').textContent = data.next_state?.pending_intent
    ? 'برای پاسخ به سؤال روشن‌سازی، یکی از گزینه‌ها را انتخاب کنید.'
    : 'سؤال‌های مرتبط با همین پاسخ، ساخته‌شده از اطلاعات عمومی پروفایل';
  for (const suggestion of valid.slice(0,5)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'next-question-button';
    const label = document.createElement('span');
    label.textContent = suggestion.label;
    const arrow = document.createElement('span');
    arrow.setAttribute('aria-hidden','true');
    arrow.textContent = '↖';
    button.append(label,arrow);
    button.title = 'انتقال سؤال به کادر برای بررسی';
    button.addEventListener('click', () => {
      if (isBusy) return;
      // When replying to a clarification, the pending state must be retained.
      // Otherwise the clicked suggestion begins a fresh request.
      if (suggestion.mode !== 'reply') state = null;
      question.value = suggestion.question;
      updateCounter();
      setRequestStatus('');
      question.focus();
      question.scrollIntoView({behavior:'smooth',block:'center'});
    });
    nextQuestionsList.append(button);
  }
}

function renderResponse(data) {
  resultPanel.hidden = false;
  resultPanel.querySelector('.answer-surface').classList.remove('is-error');
  answerNode.textContent = data.answer || 'پاسخی دریافت نشد.';
  setResultTag(data.capability);
  renderEvidenceFlow(data);
  renderNextQuestions(data);
  copyButton.textContent = '⧉ کپی پاسخ';
  document.getElementById('intent').textContent = data.intent || '—';
  document.getElementById('intent-source').textContent = data.intent_source || 'rules';
  document.getElementById('capability').textContent = data.capability || '—';
  document.getElementById('fields').textContent = (data.fields_read || []).join(', ') || '—';
  document.getElementById('external').textContent = data.external_service || '—';
  document.getElementById('external-fields').textContent = (data.external_fields || []).join(', ') || '—';
  const diagnostics = data.model_diagnostics || {};
  document.getElementById('model-status').textContent = diagnostics.status || '—';
  document.getElementById('model-http').textContent = diagnostics.http_status || '—';
  document.getElementById('model-time').textContent = Number.isFinite(diagnostics.latency_ms) ? `${diagnostics.latency_ms} ms` : '—';
  document.getElementById('external-time').textContent = Number.isFinite(data.external_latency_ms) ? `${data.external_latency_ms} ms` : '—';
  document.getElementById('total-time').textContent = Number.isFinite(data.total_latency_ms) ? `${data.total_latency_ms} ms` : '—';
  const links = document.getElementById('links');
  links.replaceChildren();
  for (const book of data.external_results || []) {
    if (typeof book.url !== 'string' || !/^https:\/\/openlibrary\.org\//.test(book.url)) continue;
    const link = document.createElement('a');
    link.href = book.url;
    link.textContent = `${book.title} — Open Library`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    links.appendChild(link);
  }
  document.getElementById('followup-hint').hidden = !state;
  resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderError(message) {
  resultPanel.hidden = false;
  resultPanel.querySelector('.answer-surface').classList.add('is-error');
  answerNode.textContent = message;
  resultTag.textContent = 'خطای ارتباط';
  resultTag.className = 'result-pill is-error';
  nextQuestions.hidden = true;
  nextQuestionsList.replaceChildren();
  document.getElementById('followup-hint').hidden = true;
  document.getElementById('links').replaceChildren();
  for (const id of ['intent', 'intent-source', 'capability', 'fields', 'external', 'external-fields', 'model-status', 'model-http', 'model-time', 'external-time', 'total-time']) {
    document.getElementById(id).textContent = '—';
  }
  setRequestStatus('درخواست کامل نشد؛ می‌توانید دوباره تلاش کنید.', true);
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  if (isBusy || !question.value.trim()) return;
  setBusy(true);
  setRequestStatus('در حال بررسی سؤال و بازیابی اطلاعات مستند…');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: question.value, state }),
      signal: controller.signal,
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = null; }
    if (!response.ok || !data) {
      if (response.status === 504 || /Gateway Timeout/i.test(text)) {
        throw new Error('زمان پاسخ‌گویی سرور به پایان رسید. لطفاً دوباره تلاش کنید.');
      }
      if (data && typeof data.error === 'string') throw new Error(data.error);
      throw new Error('پاسخ معتبر از سرور دریافت نشد. لطفاً دوباره تلاش کنید.');
    }
    state = data.next_state || null;
    renderResponse(data);
    setRequestStatus('');
  } catch (error) {
    const message = error.name === 'AbortError'
      ? 'درخواست بیش از حد طول کشید. اتصال را بررسی کنید و دوباره تلاش کنید.'
      : error.message === 'Failed to fetch'
        ? 'ارتباط با سرور برقرار نشد. لطفاً اتصال اینترنت را بررسی کنید.'
        : error.message;
    renderError(message);
  } finally {
    clearTimeout(timeoutId);
    setBusy(false);
  }
});
