(function () {
  var form = document.getElementById('login-form');
  var input = document.getElementById('pin');
  var errorEl = document.getElementById('login-error');

  function nextPath() {
    var next = new URLSearchParams(location.search).get('next');
    if (next && next.charAt(0) === '/' && next.indexOf('//') !== 0 && next.indexOf('\\') === -1) return next;
    return '/';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errorEl.hidden = true;
    fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: input.value })
    })
      .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
      .then(function (r) {
        if (r.ok) {
          location.replace(nextPath());
          return;
        }
        errorEl.textContent = (r.body && r.body.error) || 'Errore';
        errorEl.hidden = false;
        input.value = '';
        input.focus();
      })
      .catch(function () {
        errorEl.textContent = 'Server non raggiungibile';
        errorEl.hidden = false;
      });
  });
})();
