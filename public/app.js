const form=document.getElementById('ask');
const question=document.getElementById('question');
const send=document.getElementById('submit');
let state=null; // minimal clarification context; lives only in this browser tab.

document.querySelectorAll('[data-q]').forEach(b=>b.addEventListener('click',()=>{
  state=null;
  question.value=b.dataset.q;
  question.focus();
}));
document.getElementById('reset').addEventListener('click',()=>{
  state=null;
  question.value='';
  question.focus();
});

form.addEventListener('submit',async(e)=>{
  e.preventDefault();
  send.disabled=true;
  send.textContent='در حال بررسی…';
  try {
    const r=await fetch('/api/ask',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({question:question.value,state}),
    });
    const data=await r.json();
    if (!r.ok) throw new Error(data.error||'Server error');
    state=data.next_state||null;
    document.getElementById('result').hidden=false;
    document.getElementById('answer').textContent=data.answer;
    document.getElementById('intent').textContent=data.intent;
    document.getElementById('intent-source').textContent=data.intent_source||'rules';
    document.getElementById('capability').textContent=data.capability;
    document.getElementById('fields').textContent=(data.fields_read||[]).join(', ')||'—';
    document.getElementById('external').textContent=data.external_service||'—';
    document.getElementById('external-fields').textContent=(data.external_fields||[]).join(', ')||'—';
    const d=data.model_diagnostics||{};
    document.getElementById('model-status').textContent=d.status||'—';
    document.getElementById('model-time').textContent=Number.isFinite(d.latency_ms)?`${d.latency_ms} ms`:'—';
    document.getElementById('model-http').textContent=d.http_status||'—';
    document.getElementById('external-time').textContent=Number.isFinite(data.external_latency_ms)?`${data.external_latency_ms} ms`:'—';
    document.getElementById('total-time').textContent=Number.isFinite(data.total_latency_ms)?`${data.total_latency_ms} ms`:'—';
    const links=document.getElementById('links');
    links.replaceChildren();
    for(const book of data.external_results||[]){
      const a=document.createElement('a');
      a.href=book.url;
      a.textContent=book.title+' — Open Library';
      a.target='_blank';
      a.rel='noopener noreferrer';
      links.appendChild(a);
    }
    document.getElementById('followup-hint').hidden=!state;
    document.getElementById('result').scrollIntoView({behavior:'smooth',block:'start'});
  } catch(err) {
    document.getElementById('result').hidden=false;
    document.getElementById('answer').textContent='خطا در دریافت پاسخ: '+err.message;
  } finally {
    send.disabled=false;
    send.textContent='بررسی سؤال';
  }
});
