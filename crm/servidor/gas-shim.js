/* Faz o CRM achar que está no Google Apps Script: google.script.run.withSuccessHandler(ok).withFailureHandler(erro).funcao(...)
   vira POST /api/funcao. Assim o mesmo index.html roda no Google ou no servidor Docker, sem mudar nada nas telas. */
(function () {
  function chamar(fn, args, ok, erro) {
    fetch('/api/' + encodeURIComponent(fn), { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: args }) })
      .then(function (r) { return r.json().catch(function () { return { __erro: 'Resposta inválida do servidor (HTTP ' + r.status + ')' }; }).then(function (j) { if (!r.ok || j.__erro) throw new Error(j.__erro || ('HTTP ' + r.status)); return j.r; }); })
      .then(ok, erro);
  }
  function executor(ok, erro) {
    return new Proxy({}, {
      get: function (_, k) {
        if (k === 'withSuccessHandler') return function (f) { return executor(f, erro); };
        if (k === 'withFailureHandler') return function (f) { return executor(ok, f); };
        if (typeof k !== 'string' || k === 'then') return undefined;
        return function () { chamar(k, Array.prototype.slice.call(arguments), ok || function () { }, erro || function (e) { console.error(e); }); };
      }
    });
  }
  window.google = { script: { run: executor() } };
  window.DELTA_SERVIDOR = 'docker';
})();
