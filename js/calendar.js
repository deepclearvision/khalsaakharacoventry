/* ════════════════════════════════════════════════════════════════════
   Competition Calendar — live update.
   The static cards in calendar.html are the fallback (shown when the
   server or the BWA API is unreachable). When GET /api/competitions
   succeeds, this rebuilds the card lists from the live BWA data and
   refreshes the "updated" note.
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var host = document.getElementById('calLive');
  var note = document.getElementById('calUpdated');
  if (!host || !note) return;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function titleCase(s) {
    return String(s).toLowerCase().replace(/(^|\s)([a-z])/g, function (m, p, c) {
      return p + c.toUpperCase();
    }).replace(/\b(and|of|the)\b/g, function (m) { return m; });
  }

  function isLocal(e) {
    return /coventry|warwick/i.test((e.name || '') + ' ' + (e.location || '') + ' ' + (e.town || ''));
  }

  function dateParts(iso) {
    var d = new Date(iso + 'T00:00:00Z');
    return {
      wd: d.toLocaleDateString('en-GB', { weekday: 'short' }),
      day: d.getUTCDate(),
      month: d.toLocaleDateString('en-GB', { month: 'short' }),
      year: d.getUTCFullYear(),
    };
  }

  function buildCard(e) {
    var card = el('div', 'panel event-card' + (isLocal(e) ? ' event-card--local' : ''));

    var d = dateParts(e.start);
    var date = el('div', 'event-card__date');
    date.appendChild(el('strong', null, String(d.day)));
    date.appendChild(el('span', null, d.month));
    card.appendChild(date);

    var body = el('div', 'event-card__body');
    var title = String(e.name || '');
    var sub = '';
    var pendingDate = false;
    var m = title.match(/^(.*?)\s*\(([^)]*)\)\s*$/i);
    if (m) {
      title = titleCase(m[1]);
      sub = m[2].trim().toLowerCase();
      pendingDate = sub.indexOf('date not confirmed') !== -1;
      if (!pendingDate) sub = titleCase(sub);
    }
    var h3 = el('h3', null, title);
    if (sub && !pendingDate) h3.appendChild(el('span', 'accent', '(' + sub + ')'));
    body.appendChild(h3);

    var meta = d.wd + ' ' + d.day + ' ' + d.month;
    var endValid = e.end && e.end > e.start;
    if (endValid) {
      var d2 = dateParts(e.end);
      meta += ' – ' + d2.wd + ' ' + d2.day + ' ' + d2.month + ' ' + d2.year;
    } else {
      meta += ' ' + d.year;
    }
    var venue = (e.location || '').replace(/\s+/g, ' ').trim();
    if (venue && e.town && venue.toLowerCase().indexOf(String(e.town).toLowerCase()) === -1) venue += ', ' + e.town;
    if (!venue) venue = 'Venue to be confirmed';
    meta += ' • ' + venue;
    if (pendingDate) meta += ' — date not confirmed';
    body.appendChild(el('p', 'event-card__meta', meta));

    var chips = el('div', 'event-card__chips');
    if (isLocal(e)) chips.appendChild(el('span', 'chip', 'Home turf'));
    chips.appendChild(el('span', 'chip', e.private ? 'More info soon' : 'Entries open'));
    body.appendChild(chips);
    card.appendChild(body);

    var linkWrap = el('div', 'event-card__link');
    var a = el('a', 'btn btn--solid btn--sm', 'Details & entry ');
    a.appendChild(el('span', 'btn__arrow', '↗'));
    if (/^[A-Za-z0-9-]+$/.test(e.linkId || '')) {
      a.href = 'https://c-mats.com/events/' + e.linkId;
      a.target = '_blank';
      a.rel = 'noopener';
    }
    linkWrap.appendChild(a);
    card.appendChild(linkWrap);

    return card;
  }

  function setNote(d, live) {
    var when = new Date(d.updated);
    if (Number.isNaN(when.getTime())) return;
    var ds = when.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    note.textContent = live
      ? 'updated automatically from the BWA calendar — last checked ' + ds
      : 'showing events checked ' + ds + ' — live refresh unavailable right now';
  }

  function render(d) {
    setNote(d, !d.stale);
    var now = new Date();
    var years = {};
    d.events.forEach(function (e) { (years[e.start.slice(0, 4)] = years[e.start.slice(0, 4)] || []).push(e); });

    host.textContent = '';
    Object.keys(years).sort().forEach(function (y) {
      var kicker = el('p', 'kicker', y === String(now.getFullYear()) ? 'Rest of ' + y : y);
      if (y !== Object.keys(years)[0]) kicker.style.marginTop = '34px';
      host.appendChild(kicker);
      var list = el('div', 'event-card-list');
      years[y].forEach(function (e) { list.appendChild(buildCard(e)); });
      host.appendChild(list);
    });
  }

  fetch('/api/competitions')
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (d) {
      if (!d || !d.ok || !Array.isArray(d.events)) return;
      if (d.events.length) render(d);
      else setNote(d, true); // BWA lists nothing upcoming — keep the static fallback, refresh the note
    })
    .catch(function () { /* offline or no server — the static list stays */ });
})();
