/* ════════════════════════════════════════════════════════════════════
   KHALSA AKHARA WRESTLING COVENTRY — join.js
   Two-step membership wizard → POST /api/member
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var step1      = document.getElementById('step1');
  var step2      = document.getElementById('step2');
  var successEl  = document.getElementById('memberSuccess');
  var form       = document.getElementById('memberForm');
  var toStep2Btn = document.getElementById('toStep2');
  var toStep1Btn = document.getElementById('toStep1');
  var branchErr  = document.getElementById('branchError');
  var memberErr  = document.getElementById('memberError');
  var mark1      = document.getElementById('stepMark1');
  var mark2      = document.getElementById('stepMark2');
  var bar        = document.getElementById('stepBar');

  if (!step1 || !step2 || !form) return;

  /* ────────────────────────── BRANCH SWITCH ───────────────────────── */
  var u16   = document.getElementById('branchU16');
  var adult = document.getElementById('branchAdult');

  function currentBranch() {
    var checked = form.querySelector('input[name="branch"]:checked');
    return checked ? checked.value : '';
  }

  function syncBranch() {
    var val = currentBranch();
    if (u16)   { u16.hidden   = val !== 'u16';    u16.disabled   = val !== 'u16'; }
    if (adult) { adult.hidden = val !== 'adult';  adult.disabled = val !== 'adult'; }
  }

  form.querySelectorAll('input[name="branch"]').forEach(function (r) {
    r.addEventListener('change', syncBranch);
  });

  /* ────────────────────────── STEP NAVIGATION ─────────────────────── */
  function showStep(n) {
    var onTwo = n === 2;
    step1.hidden = onTwo;
    step2.hidden = !onTwo;
    mark1.classList.toggle('is-done', onTwo);
    mark1.classList.toggle('is-active', !onTwo);
    mark2.classList.toggle('is-active', onTwo);
    if (bar) bar.classList.toggle('is-done', onTwo);
    window.scrollTo({ top: 0, behavior: prefersReduced ? 'auto' : 'smooth' });
  }

  toStep2Btn.addEventListener('click', function () {
    var val = currentBranch();
    if (!val) {
      if (branchErr) {
        branchErr.textContent = 'Please choose who is joining — Under 16 or 16 and over.';
        branchErr.hidden = false;
      }
      return;
    }
    if (branchErr) branchErr.hidden = true;
    syncBranch();
    showStep(2);
  });

  toStep1Btn.addEventListener('click', function () { showStep(1); });

  /* ────────────────────────── FORM SUBMIT ─────────────────────────── */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (memberErr) memberErr.hidden = true;
    form.querySelectorAll('.is-invalid').forEach(function (f) { f.classList.remove('is-invalid'); });

    if (!form.checkValidity()) { form.reportValidity(); return; }

    var data = Object.fromEntries(new FormData(form).entries());
    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      var res = await fetch('/api/member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      var json = await res.json().catch(function () { return {}; });

      if (res.ok && json.ok) {
        /* success — hide the whole wizard and celebrate */
        step2.hidden = true;
        mark2.classList.add('is-done');
        successEl.hidden = false;
        successEl.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'center' });
      } else {
        var errs = json.errors || {};
        var fields = Object.keys(errs);
        if (fields.length) {
          fields.forEach(function (k) {
            var el = form.querySelector('[name="' + k + '"]');
            if (el && el.closest('.field')) {
              el.closest('.field').classList.add('is-invalid');
            }
          });
          if (memberErr) {
            memberErr.innerHTML = fields.map(function (k) { return esc(errs[k]); }).join('<br>');
            memberErr.hidden = false;
          }
        } else if (memberErr) {
          memberErr.textContent = json.error || 'Something went wrong — please try again.';
          memberErr.hidden = false;
        }
      }
    } catch (err) {
      if (memberErr) {
        memberErr.textContent = 'Could not reach the server. Please try again in a moment.';
        memberErr.hidden = false;
      }
    } finally {
      btn.disabled = false;
    }
  });

  /* ────────────────────────── PRE-FILL FROM URL ───────────────────── */
  /* The dashboard's "Convert to member" links here like:
     /join.html?name=…&email=…&wrestler=…&age=… */
  (function prefill() {
    var params = new URLSearchParams(location.search);
    var name     = params.get('name');
    var email    = params.get('email');
    var wrestler = params.get('wrestler');
    var age      = params.get('age');
    if (!name && !wrestler) return;

    var under16 = age !== null && parseInt(age, 10) < 16;
    var radio = form.querySelector('input[name="branch"][value="' + (under16 ? 'u16' : 'adult') + '"]');
    if (radio) radio.checked = true;
    syncBranch();

    var set = function (sel, val) {
      var el = form.querySelector(sel);
      if (el && val) el.value = val;
    };
    if (under16) {
      set('[name="guardian_name"]', name);
      set('[name="guardian_email"]', email);
      set('[name="wrestler_name"]', wrestler || name);
      /* approximate DOB from the age the prospect gave us */
      if (age) {
        var dobEl = form.querySelector('[name="dob"]');
        if (dobEl) {
          var year = new Date().getFullYear() - parseInt(age, 10) - 1;
          dobEl.value = year + '-07-01';
        }
      }
      /* jump straight to the form, branch already chosen */
      showStep(2);
    } else {
      set('[name="wrestler_name"]', wrestler || name);
      set('[name="email"]', email);
      set('[name="dob"]', age ? (new Date().getFullYear() - parseInt(age, 10) - 1) + '-07-01' : '');
      showStep(2);
    }
  })();
})();
