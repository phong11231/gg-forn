let job = null;

self.addEventListener('message', (e) => {
  const msg = e.data;
  if (msg.action === 'start') {
    job = { ...msg, running: true, ok: 0, fail: 0, current: 0 };
    e.waitUntil(runJob(job));
  } else if (msg.action === 'stop') {
    if (job) job.running = false;
  } else if (msg.action === 'status') {
    broadcast(job ? { type: 'status', running: job.running, ok: job.ok || 0, fail: job.fail || 0, current: job.current || 0, total: job.count } : { type: 'status', running: false });
  }
});

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickByPct(options, pcts) {
  const total = pcts.reduce((a, b) => a + b, 0);
  if (total === 0) return options[0];
  const r = Math.random() * total;
  let sum = 0;
  for (let i = 0; i < pcts.length; i++) {
    sum += pcts[i];
    if (r < sum) return options[i];
  }
  return options[options.length - 1];
}

function pickMulti(options, pcts) {
  const sel = [];
  for (let i = 0; i < options.length; i++) {
    if (Math.random() * 100 < pcts[i]) sel.push(options[i]);
  }
  return sel.length ? sel : [options[0]];
}

function genAnswer(q, cfg) {
  if (q.type === 'text' || q.type === 'paragraph') {
    return (!cfg.values || !cfg.values.length) ? '' : cfg.values[Math.floor(Math.random() * cfg.values.length)];
  }
  if (q.type === 'checkbox') return pickMulti(q.options, cfg.percentages || []);
  return pickByPct(q.options, cfg.percentages || []);
}

async function submitOnce(formAction, formData, configs, pageCount) {
  const params = new URLSearchParams();
  for (let i = 0; i < formData.length; i++) {
    const q = formData[i];
    const answer = genAnswer(q, configs[i]);
    if (q.type === 'checkbox' && Array.isArray(answer)) {
      answer.forEach(a => params.append(q.entryId, a));
    } else {
      params.append(q.entryId, answer);
    }
  }
  params.append('fvv', '1');
  const ph = [];
  for (let p = 0; p < pageCount; p++) ph.push(p);
  params.append('pageHistory', ph.join(','));
  params.append('fbzx', String(Date.now() * -1 + Math.floor(Math.random() * 1000000)));
  await fetch(formAction, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    mode: 'no-cors',
    credentials: 'include'
  });
}

async function runJob(j) {
  for (let n = 0; n < j.count; n++) {
    if (!j.running) break;
    try {
      await submitOnce(j.formAction, j.formData, j.configs, j.pageCount || 1);
      j.ok++;
    } catch (e) {
      j.fail++;
    }
    j.current = n + 1;
    broadcast({
      type: 'progress',
      current: j.current,
      total: j.count,
      ok: j.ok,
      fail: j.fail
    });

    if (j.running && n < j.count - 1) {
      const delay = randInt(j.delayMin, j.delayMax);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  j.running = false;
  broadcast({
    type: 'done',
    ok: j.ok,
    fail: j.fail,
    total: j.count
  });
  job = null;
}

async function broadcast(msg) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach(c => c.postMessage(msg));
}
