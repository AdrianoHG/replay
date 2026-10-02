(function () {
  'use strict';

  // Replaced at image build time. Left as the placeholder when the file is
  // opened straight from a checkout, which is how you can tell the two apart.
  var VERSION = 'v1.1.1-personal';
  var CINEMETA = 'https://v3-cinemeta.strem.io';
  var SPELLS = ['Lendo seu histórico', 'Organizando os títulos', 'Calculando as estatísticas', 'Carregando os metadados'];
  var spellTimer = null;

  // Shuffled per run and drained before reshuffling, so a slow account gets a
  // different sequence each time and never the same line twice in a row.
  function shuffled(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function startSpells() {
    var deck = shuffled(SPELLS), i = 0;
    say(deck[0] + '\u2026');
    spellTimer = setInterval(function () {
      i++;
      if (i >= deck.length) { deck = shuffled(SPELLS); i = 0; }
      say(deck[i] + '\u2026');
    }, 1600);
  }
  function stopSpells() { if (spellTimer) { clearInterval(spellTimer); spellTimer = null; } }
  // Store product, not published at time of writing. Check it resolves before
  // this page goes live or both CTAs land on a 404.
  var STREMIO_WEB = 'https://web.stremio.com/#/detail';

  // Nuvio's publishable key is the one its own clients ship. A self-hosted
  // backend publishes its own at /.well-known/nuvio, which is how the Nuvio
  // apps discover a custom server, so a URL is all anyone needs to type.
  var BACKENDS = {
    stremio: { name: 'Stremio', host: 'api.strem.io', base: 'https://api.strem.io', kind: 'stremio' },
    nuvio:   { name: 'Nuvio', host: 'api.nuvio.tv', base: 'https://api.nuvio.tv', kind: 'nuvio',
               key: 'sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN' },
    custom:  { name: 'your backend', host: '', base: '', kind: 'nuvio', key: '' }
  };

  // The form asks for an email and a password, which says nothing about WHICH
  // account. Name it, and name the one people reasonably confuse it with.
  var CREDS = {
    stremio: { email: 'E-mail do Stremio', pw: 'Senha do Stremio', hint: 'Entre com sua conta <b>Stremio</b>.' },
    nuvio: { email: 'E-mail do Nuvio', pw: 'Senha do Nuvio', hint: 'Entre com sua conta <b>Nuvio</b>, a mesma usada para sincronizar seus dispositivos.' },
    custom: { email: 'E-mail no backend escolhido', pw: 'Senha no backend escolhido', hint: 'Use a conta do <b>backend próprio informado acima</b>.' }
  };
  function applyCreds() {
    var c = CREDS[backendId] || CREDS.stremio;
    $('email').placeholder = c.email;
    $('password').placeholder = c.pw;
    $('credhint').innerHTML = c.hint;
  }

  var backendId = 'nuvio', backend = BACKENDS.nuvio;
  var session = null, realEmail = '', allRows = [], extras = {}, metaById = {};
  var timelineMode = 'played', yearFilter = 'all', monthFilter = 'all';

  var $ = function (id) { return document.getElementById(id); };
  var statusEl = $('status');

  // Everything renders in the visitor's own locale and zone. The servers store
  // UTC; these are what those instants look like where they live.
  var LOC = Intl.DateTimeFormat('pt-BR').resolvedOptions();
  var fmtDay = new Intl.DateTimeFormat(LOC.locale, { day: 'numeric', month: 'short' });
  var fmtFull = new Intl.DateTimeFormat(LOC.locale, { dateStyle: 'long' });
  var fmtMonth = new Intl.DateTimeFormat(LOC.locale, { month: 'long' });

  function say(msg, isErr) {
    statusEl.textContent = msg;
    statusEl.className = 'status show' + (isErr ? ' err' : '');
  }
  function clear() { statusEl.className = 'status'; }
  function n(x) { return Number(x || 0).toLocaleString(LOC.locale); }
  function plural(c, one, many) { return c === 1 ? one : (many || one + 's'); }
  function maskEmail(a) {
    if (!a || a.indexOf('@') < 0) { return 'not set'; }
    var q = a.split('@');
    return q[0].slice(0, 1) + '•'.repeat(Math.max(q[0].length - 1, 3)) + '@' + q[1];
  }
  function monthYear(d) {
    return new Intl.DateTimeFormat(LOC.locale, { month: 'long', year: 'numeric' }).format(d);
  }
  function clockStr(ms) {
    var t = Math.round(ms / 1000), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60);
    var pad = function (x) { return String(x).padStart(2, '0'); };
    return h ? h + ':' + pad(m) + ':' + pad(t % 60) : m + ':' + pad(t % 60);
  }
  function toDate(v) {
    if (!v) { return null; }
    var d = new Date(v);
    return isNaN(d) ? null : d;
  }
  function hostOf(url) {
    try { return new URL(url).host; } catch (e) { return ''; }
  }

  // ---- session storage --------------------------------------------------
  // The password is never stored. What is stored is the session key the backend
  // returns, which is a full-account bearer credential — so it lives in
  // sessionStorage (this tab only) unless the visitor opts into keeping it, and
  // signing out invalidates it upstream as well as deleting it here. Every
  // access is guarded: private windows throw rather than return null.
  var STORE_PREFIX = 'replay.session.';
  var LAST_KEY = 'replay.last';
  var LEGACY_KEY = 'replay.session';
  var REMEMBER_DAYS = 30;

  function stores() {
    var out = [];
    try { if (window.sessionStorage) { out.push(window.sessionStorage); } } catch (e) {}
    try { if (window.localStorage) { out.push(window.localStorage); } } catch (e) {}
    return out;
  }
  // One slot per backend, so signing in to Nuvio does not evict a Stremio
  // session you are still using. Keyed by backend id; a custom backend stores
  // its own base URL inside the payload, so one custom slot is enough.
  function keyFor(id) { return STORE_PREFIX + id; }

  function saveSession(remember) {
    if (!session) { return; }
    var payload = JSON.stringify({
      backendId: backendId, kind: session.kind, at: Date.now(),
      authKey: session.authKey || null,
      cfg: session.cfg ? { base: session.cfg.base, key: session.cfg.key, token: session.cfg.token } : null
    });
    forgetSession(backendId);
    try {
      (remember ? window.localStorage : window.sessionStorage).setItem(keyFor(backendId), payload);
    } catch (e) {}
    try { window.sessionStorage.setItem(LAST_KEY, backendId); } catch (e) {}
  }

  function loadSession(id) {
    var found = null;
    stores().forEach(function (st) {
      if (found) { return; }
      try {
        var raw = st.getItem(keyFor(id));
        if (!raw) { return; }
        var v = JSON.parse(raw);
        if (st === window.localStorage &&
            Date.now() - (v.at || 0) > REMEMBER_DAYS * 864e5) { st.removeItem(keyFor(id)); return; }
        v._persistent = (st === window.localStorage);
        found = v;
      } catch (e) {}
    });
    return found;
  }

  function forgetSession(id) {
    stores().forEach(function (st) {
      try { st.removeItem(keyFor(id)); } catch (e) {}
    });
  }

  // A single-slot version shipped first; drop anything it left behind.
  stores().forEach(function (st) {
    try { st.removeItem(LEGACY_KEY); } catch (e) {}
  });

  // ---- backend picker ---------------------------------------------------
  Array.prototype.forEach.call($('backends').children, function (b) {
    b.addEventListener('click', function () {
      backendId = b.dataset.backend;
      backend = BACKENDS[backendId];
      Array.prototype.forEach.call($('backends').children, function (o) {
        o.setAttribute('aria-selected', o === b ? 'true' : 'false');
      });
      $('panel-url').hidden = backendId !== 'custom';
      if (shownBackendId === backendId) {
        $('results').hidden = false;
        $('actions').hidden = false;

        $('signedin').hidden = false;
        $('signin').hidden = true;
        return;
      }
      $('signin').hidden = false;
      $('results').hidden = true;
      $('actions').hidden = true;

      $('signedin').hidden = true;
      refreshResume();
      if (backendId !== 'stremio') { selectMode(true); }
      $('targethost').textContent = backend.host || 'the backend you name';
      applyCreds();
      applyIntro();
      // The picker stays live after a RePlay has rendered, so switching
      // backends brings the form back rather than stranding the visitor.
      if ($('signin').hidden) {
        $('signin').hidden = false;
        $('signedin').hidden = true;
        $('signin').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      }
    });
  });
  // A saved session should stand in for the sign-in form, not sit below it, so
  // the visitor is offered one choice rather than two competing ones.
  function showSignInForm(show) {
    $('form').hidden = !show;
    $('signinfine').hidden = !show;
    $('mode-toggle').hidden = !show || backendId !== 'stremio';
    $('resume').hidden = show;
  }

  var STANDFIRST = {
    stremio: 'Veja seus títulos, horários e estatísticas a partir da conta Stremio. O processamento acontece no seu navegador.',
    nuvio: 'Explore títulos, perfis, tempo registrado e hábitos de reprodução da sua conta Nuvio. Sem adicionar outro catálogo ao player.',
    custom: 'Conecte um backend Nuvio próprio. Esta instância do RePlay não cria nem hospeda um backend de sincronização.'
  };
  function applyIntro() { $('standfirst').textContent = STANDFIRST[backendId] || STANDFIRST.nuvio; }

  var authMode = 'pw';
  function selectMode(pw) {
    authMode = pw ? 'pw' : 'key';
    $('panel-pw').hidden = !pw;
    $('panel-key').hidden = pw;
    $('mode-toggle').textContent = pw ? "Usar uma chave de autenticação"
                                      : "Usar e-mail e senha";
  }
  $('switchacct').addEventListener('click', function () {
    $('signin').hidden = false;
    $('signedin').hidden = true;
    showSignInForm(true);
    savedSession = null;
    $('signin').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  });

  // The cold CTA and the one at the end of the options are the same offer, so
  // only ever show one of them.

  // The export is already in memory, so handing it over is a blob rather than
  // another round trip. It carries addon URLs, which are bearer credentials for
  // whatever sits behind them, so the note says so before anyone shares the file.
  $('dl-export').addEventListener('click', function () {
    if (!exportDoc) { return; }
    var blob = new Blob([JSON.stringify(exportDoc, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (backendId === 'stremio' ? 'stremio' : 'nuvio') + '-export-' +
                 new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  });

  $('mode-toggle').addEventListener('click', function () { selectMode(authMode !== 'pw'); });

  // ---- Stremio adapter --------------------------------------------------
  // Every payload carries the `type` discriminator the shipped Stremio clients
  // send. Copied from a working client rather than written from the docs.
  function stremioCall(path, body) {
    return fetch(BACKENDS.stremio.base + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.error) { throw new Error(j.error.message || 'Stremio returned an error'); }
      return j.result;
    });
  }

  function readStremio(creds) {
    var start = creds.authKey
      ? Promise.resolve(creds.authKey)
      : stremioCall('/api/login', { type: 'Auth', email: creds.email, password: creds.password })
          .then(function (r) { return r && r.authKey; });

    return start.then(function (key) {
      if (!key) { throw new Error('No auth key was returned.'); }
      session = { kind: 'stremio', authKey: key };
      say("Lendo seu histórico…");
      return Promise.all([
        stremioCall('/api/getUser', { type: 'GetUser', authKey: key }),
        stremioCall('/api/datastoreGet', { type: 'DatastoreGet', authKey: key, collection: 'libraryItem', all: true })
      ]);
    }).then(function (both) {
      var user = both[0] || {}, items = both[1];
      if (!Array.isArray(items)) { items = (items && items.library) || []; }
      realEmail = user.email || '';

      var account = [
        ['Email', maskEmail(realEmail)],
        ['Account id', user._id || 'unknown'],
        ['Registered', user.dateRegistered ? fmtFull.format(new Date(user.dateRegistered)) : 'not set'],
        ['Last changed', user.lastModified ? fmtFull.format(new Date(user.lastModified)) : 'not set']
      ];
      if (user.trakt && (user.trakt.access_token || user.trakt.created_at)) {
        account.push(['Trakt', 'linked, token held by Stremio']);
      }
      if (user.fbId) { account.push(['Facebook', 'linked']); }
      if (user.gdpr_consent) {
        var c = user.gdpr_consent;
        var flags = ['privacy', 'tos', 'marketing'].filter(function (k) {
          return Object.prototype.hasOwnProperty.call(c, k);
        }).map(function (k) { return k + ': ' + (c[k] ? 'yes' : 'no'); });
        if (c.from) { flags.push('captured in ' + c.from); }
        account.push(['Consent recorded', flags.join(', ') || 'none']);
      }
      // Stremio calls this tier "Supporter" to users; the API kept the older
      // `premium_*` field names. And premium_expire uses a far-future sentinel
      // rather than a null when there is no end date, so rendering it as a date
      // reads as a bug.
      if (user.premium_expire) {
        var exp = new Date(user.premium_expire);
        var far = exp.getFullYear() >= 2099;
        account.push(['Stremio Supporter',
          exp < new Date() ? 'lapsed ' + fmtFull.format(exp)
          : far ? 'active, with no expiry date set'
          : 'active until ' + fmtFull.format(exp)]);
      }

      var prof = user.premiumPrefs && user.premiumPrefs.userProfiles;
      var profiles = prof ? Object.keys(prof).map(function (k) {
        var p = prof[k] || {};
        return { name: p.name || 'Unnamed profile',
                 detail: p.hasPin ? 'PIN set' : 'no PIN',
                 avatar: user.avatar || '' };
      }) : [];

      return { provider: 'Stremio', handle: handleFrom(user),
               account: account, rows: items.map(stremioRow),
               extras: { withheld: [], profiles: profiles } };
    });
  }

  // A row is a row, not a title: Stremio writes one the moment you open a
  // detail page, and keeps it after you remove the item from your library.
  // season/episode live in video_id ("tt0903747:1:5"); state.season is 0 on
  // real accounts.
  function stremioRow(item) {
    var st = item.state || {};
    var id = String(item._id || '').split(':')[0];
    var se = null, ep = null, vid = st.video_id;
    if (item.type === 'series' && typeof vid === 'string') {
      var b = vid.split(':');
      if (b.length >= 3) {
        var a1 = parseInt(b[1], 10), a2 = parseInt(b[2], 10);
        if (a1 > 0 || a2 > 0) { se = a1; ep = a2; }
      }
    }
    var watched = st.overallTimeWatched > 0 ? st.overallTimeWatched
                : st.timeWatched > 0 ? st.timeWatched
                : (st.duration > 0 && st.timeOffset > 0 ? Math.min(st.timeOffset, st.duration) : 0);
    var played = watched > 0 || st.timeOffset > 0 || st.flaggedWatched > 0 || st.timesWatched > 0;
    return {
      key: id + ':' + (se || 0) + ':' + (ep || 0),
      // Accounts carry more than movies and series: `tv` and `events` rows show
      // up too, and mapping them to "movie" would send Cinemeta and the detail
      // links somewhere that does not exist.
      id: id, videoId: vid || id, type: item.type || 'movie',
      name: item.name || id, season: se, episode: ep,
      positionMs: st.timeOffset || 0, durationMs: st.duration || 0, watchedMs: watched,
      last: toDate(st.lastWatched || item._mtime || item._ctime), created: toDate(item._ctime),
      plays: st.timesWatched || 0, finished: st.flaggedWatched > 0,
      // This is a log, not a library. stremio-core writes a row with
      // removed:true, temp:true the moment you open or play something, then
      // derives two views from the log. Both predicates are lifted verbatim:
      // in_library  = !removed && !temp
      // continue_watching = type != "other" && (!removed || temp) && time_offset > 0
      rawId: item._id,
      inLibrary: !item.removed && !item.temp,
      inContinue: item.type !== 'other' && (!item.removed || item.temp) && st.timeOffset > 0,
      shelf: !item.removed ? 'library' : (item.temp ? 'never-added' : 'taken-out'),
      played: played,
      poster: item.poster || '', background: item.background || '', genres: [], addonHost: '',
      year: item.year || ''
    };
  }

  // ---- Nuvio adapter ----------------------------------------------------
  function discover(base) {
    return fetch(base.replace(/\/+$/, '') + '/.well-known/nuvio')
      .then(function (r) {
        if (!r.ok) { throw new Error('That URL did not answer /.well-known/nuvio.'); }
        return r.json();
      })
      .then(function (j) {
        if (!j || !j.publishable_key) { throw new Error('That backend did not publish a key.'); }
        return { base: (j.backend_url || base).replace(/\/+$/, ''), key: j.publishable_key };
      });
  }

  function rpc(cfg, fn, args) {
    return fetch(cfg.base + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'Accept': 'application/json',
        'apikey': cfg.key, 'Authorization': 'Bearer ' + cfg.token
      },
      body: JSON.stringify(args || {})
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (j) {
        if (!r.ok) {
          throw new Error((j && (j.message || j.error_description)) || (fn + ' failed (' + r.status + ')'));
        }
        return j;
      });
    });
  }

  function readNuvio(creds, rawBase) {
    var resolve = backendId === 'custom'
      ? discover(rawBase)
      : Promise.resolve({ base: backend.base, key: backend.key });

    var cfg;
    return resolve.then(function (c) {
      cfg = c;
      say('Signing in to ' + hostOf(cfg.base) + '…');
      return fetch(cfg.base + '/auth/v1/token?grant_type=password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': cfg.key },
        body: JSON.stringify({ email: creds.email, password: creds.password })
      }).then(function (r) {
        return r.json().catch(function () { return null; }).then(function (j) {
          if (!r.ok || !j || !j.access_token) {
            throw new Error((j && (j.error_description || j.msg || j.message)) || 'Sign-in failed.');
          }
          return j;
        });
      });
    }).then(function (auth) {
      cfg.token = auth.access_token;
      session = { kind: 'nuvio', cfg: cfg };
      var user = auth.user || {};
      realEmail = user.email || creds.email || '';
      say("Lendo seu histórico…");
      // The membership functions exist on Nuvio's own backend but are absent
      // from the published self-host schema, so a self-hosted backend answers
      // 404 and the section simply does not render.
      return Promise.all([
        rpc(cfg, 'sync_export_account_backup', {}),
        rpc(cfg, 'sync_pull_profile_locks', {}).catch(function () { return null; }),
        rpc(cfg, 'get_my_membership_overview', {}).catch(function () {
          return rpc(cfg, 'get_my_member_access', {}).catch(function () { return null; });
        })
      ]).then(function (parts) {
        return { user: user, backup: parts[0], locks: parts[1], member: parts[2] };
      });
    }).then(function (got) { return buildNuvio(got, cfg); });
  }

  // Shared by a fresh sign-in and a restored session, which differ only in
  // whether an auth response was seen this time round.
  function buildNuvio(got, cfg) {
    exportDoc = got.backup || null;
    realEmail = (got.user && got.user.email) || realEmail || '';
    var rows = nuvioRows(got.backup);
    var m = got.member;
    if (Array.isArray(m)) { m = m[0]; }
    var tier = m && (m.membership_level || m.tier || m.level || m.access_level);
    var account = [
      ['Email', maskEmail(realEmail)],
      ['Account id', got.user.id || 'unknown'],
      ['Registered', got.user.created_at ? fmtFull.format(new Date(got.user.created_at)) : 'not set'],
      ['Last sign-in', got.user.last_sign_in_at ? fmtFull.format(new Date(got.user.last_sign_in_at)) : 'not set'],
      ['Backend', hostOf(cfg.base)]
    ];
    if (tier) {
      account.push(['Supporter tier', String(tier).toLowerCase().replace(/_/g, ' ') +
        (m.supporter_since ? ', since ' + fmtFull.format(new Date(m.supporter_since)) : '')]);
    }
    return {
      provider: backendId === 'custom' ? 'your backend' : 'Nuvio',
      providerHost: hostOf(cfg.base),
      handle: handleFrom(got.user),
      account: account, rows: rows,
      extras: {
        profiles: nuvioProfiles(got.backup, got.locks),
        publicly: tier ? [
          'Supporting ' + (backendId === 'custom' ? 'the upstream service' : 'Nuvio') +
          ' is handled through Patreon, and supporters appear on a wall that any client ' +
          'can read without signing in: display name, Patreon avatar and the date you ' +
          'started. It is meant as a thank-you page. It also ties this account to a ' +
          'public identity.'
        ] : [],
        withheld: [
          'Your debrid and metadata provider keys, which the apps pull down to configure themselves',
          'Tracker tokens, such as a linked Trakt account',
          'Profile PIN hashes and their lockout state',
          'Your signed-in devices and active sessions'
        ]
      }
    };
  }

  // The backup envelope is a JSON document rather than a fixed API, and it
  // differs between backend versions, so the tables are found by the columns
  // they carry instead of by where they sit in the object.
  function collect(doc, test) {
    var found = [];
    (function walk(node, depth) {
      if (!node || depth > 6) { return; }
      if (Array.isArray(node)) {
        if (node.length && typeof node[0] === 'object' && node[0] && test(node[0])) {
          found = found.concat(node);
          return;
        }
        node.forEach(function (c) { walk(c, depth + 1); });
        return;
      }
      if (typeof node === 'object') {
        Object.keys(node).forEach(function (k) { walk(node[k], depth + 1); });
      }
    })(doc, 0);
    return found;
  }
  function has(o) {
    var keys = Array.prototype.slice.call(arguments, 1);
    return keys.every(function (k) { return Object.prototype.hasOwnProperty.call(o, k); });
  }
  // `position` and `duration` are stored in seconds; older rows and some
  // backends write milliseconds. Anything past a couple of days can only be ms.
  // Nuvio stores milliseconds. This used to guess the unit per value, treating
  // anything under 200000 as seconds, which turned a position of 7911 -- eight
  // seconds into an episode -- into 7911 seconds, or 2.2 hours. Worse, the
  // inflated position sailed past the 90% mark, so an episode barely started
  // was reported as finished and credited with its whole runtime.
  //
  // The unit is now decided ONCE for the whole export, from the durations,
  // which are always populated and are never plausibly a few seconds long. A
  // per-value guess is what allowed two neighbouring rows to be read on
  // different scales.
  function unitScale(progress) {
    var d = [], maxPos = 0;
    progress.forEach(function (p) {
      var x = Number(p && p.duration);
      if (isFinite(x) && x > 0) { d.push(x); }
      var q = Number(p && p.position);
      if (isFinite(q) && q > maxPos) { maxPos = q; }
    });
    // Durations are the better signal, but a backend can omit them, in which
    // case the longest position stands in: it approaches a full runtime.
    var probe = 0;
    if (d.length) { d.sort(function (a, b) { return a - b; }); probe = d[Math.floor(d.length / 2)]; }
    else { probe = maxPos; }
    if (!probe) { return 1; }
    // Nothing anyone watches runs under a minute, so a figure below 60000
    // cannot be milliseconds; and 60000 seconds is sixteen hours, longer than
    // anything a library realistically holds. That splits the two scales for
    // every plausible record, including a seconds-based backend whose longest
    // item is a six-hour stream.
    return probe < 60000 ? 1000 : 1;
  }

  function toMs(v, scale) {
    var x = Number(v || 0);
    if (!isFinite(x) || x <= 0) { return 0; }
    return x * (scale || 1);
  }

  // Anything that is not a film or an episode keeps its own type, so that a
  // live channel is never mistaken for a ninety-minute film and credited as one.
  function nuvioType(contentType, season) {
    if (contentType === 'series' || Number(season) > 0) { return 'series'; }
    return contentType ? String(contentType) : 'movie';
  }

  function nuvioRows(backup) {
    var progress = collect(backup, function (o) { return has(o, 'content_id') && (has(o, 'position') || has(o, 'last_watched')); });
    var library  = collect(backup, function (o) { return has(o, 'content_id') && has(o, 'name'); });
    var watched  = collect(backup, function (o) { return has(o, 'content_id') && has(o, 'watched_at'); });

    var scale = unitScale(progress);
    var byKey = {}, inLibrary = {};
    var keyOf = function (o) {
      return String(o.content_id) + ':' + (Number(o.season) || 0) + ':' + (Number(o.episode) || 0);
    };

    library.forEach(function (l) {
      inLibrary[String(l.content_id)] = l;
    });

    progress.forEach(function (p) {
      var lib = inLibrary[String(p.content_id)] || {};
      var dur = toMs(p.duration, scale);
      // A position past the end of the file is not a longer viewing, it is bad
      // data. Cap it so one row cannot invent hours that were never watched.
      var pos = toMs(p.position, scale);
      if (dur > 0 && pos > dur) { pos = dur; }
      byKey[keyOf(p)] = {
        key: keyOf(p), id: String(p.content_id), videoId: p.video_id || String(p.content_id),
        type: nuvioType(p.content_type, p.season),
        name: lib.name || p.title || String(p.content_id),
        season: Number(p.season) || null, episode: Number(p.episode) || null,
        positionMs: pos, durationMs: dur, watchedMs: Math.min(pos, dur || pos),
        last: toDate(p.last_watched), created: toDate(lib.added_at || lib.created_at),
        plays: 0, finished: dur > 0 && pos / dur >= 0.9,
        shelf: inLibrary[String(p.content_id)] ? 'library' : 'not-in-library',
        inLibrary: !!inLibrary[String(p.content_id)], inContinue: pos > 0,
        progressKey: p.progress_key || null, profileId: p.profile_id || null,
        played: pos > 0,
        poster: lib.poster || '', background: lib.background || '',
        genres: Array.isArray(lib.genres) ? lib.genres : [],
        addonHost: hostOf(lib.addon_base_url || ''), year: lib.release_info || ''
      };
    });

    watched.forEach(function (w) {
      var k = keyOf(w), row = byKey[k];
      var when = toDate(w.watched_at);
      if (!row) {
        var lib2 = inLibrary[String(w.content_id)] || {};
        row = byKey[k] = {
          key: k, id: String(w.content_id), videoId: String(w.content_id),
          type: nuvioType(w.content_type, w.season),
          name: w.title || lib2.name || String(w.content_id),
          season: Number(w.season) || null, episode: Number(w.episode) || null,
          positionMs: 0, durationMs: 0, watchedMs: 0,
          last: when, created: toDate(lib2.added_at), plays: 0, finished: true,
          shelf: inLibrary[String(w.content_id)] ? 'library' : 'not-in-library',
          inLibrary: !!inLibrary[String(w.content_id)], inContinue: false,
          played: true,
          poster: lib2.poster || '', background: lib2.background || '',
          genres: Array.isArray(lib2.genres) ? lib2.genres : [],
          addonHost: hostOf(lib2.addon_base_url || '')
        };
      }
      row.plays++;
      row.finished = true;
      row.played = true;
      if (when && (!row.last || when > row.last)) { row.last = when; }
    });

    library.forEach(function (l) {
      var k = String(l.content_id) + ':0:0';
      if (byKey[k]) { return; }
      var anyEpisode = Object.keys(byKey).some(function (x) { return x.indexOf(String(l.content_id) + ':') === 0; });
      if (anyEpisode) { return; }
      byKey[k] = {
        key: k, id: String(l.content_id), videoId: String(l.content_id),
        type: nuvioType(l.content_type, null),
        name: l.name || String(l.content_id), season: null, episode: null,
        positionMs: 0, durationMs: 0, watchedMs: 0,
        last: toDate(l.updated_at || l.added_at), created: toDate(l.added_at || l.created_at),
        plays: 0, finished: false, shelf: 'library',
        inLibrary: true, inContinue: false, played: false,
        poster: l.poster || '', background: l.background || '',
        genres: Array.isArray(l.genres) ? l.genres : [],
        addonHost: hostOf(l.addon_base_url || '')
      };
    });

    return Object.keys(byKey).map(function (k) { return byKey[k]; });
  }

  function nuvioProfiles(backup, locks) {
    var rows = collect(backup, function (o) {
      return has(o, 'name') && (has(o, 'profile_index') || has(o, 'pin_enabled') || has(o, 'avatar_id'));
    });
    var lockRows = Array.isArray(locks) ? locks : [];
    var lockFor = {};
    lockRows.forEach(function (l) { lockFor[String(l.profile_id != null ? l.profile_id : l.id)] = l; });
    return rows.map(function (p) {
      var l = lockFor[String(p.profile_id != null ? p.profile_id : p.id)] || {};
      var pinned = p.pin_enabled || l.pin_enabled;
      return {
        name: p.name || 'Unnamed profile',
        avatar: p.avatar_url || '',
        colour: p.avatar_color_hex || '',
        detail: [pinned ? 'PIN set' : 'no PIN',
                 p.created_at ? 'added ' + fmtFull.format(new Date(p.created_at)) : ''
                ].filter(Boolean).join(' · ')
      };
    });
  }

  // The export is the account's own copy of itself, and it carries two things
  // datastoreGet does not: the notification map (which series it is tracking
  // unwatched episodes for) and a per-row server document id stamped with the
  // owner. Best effort — everything still works without it.
  var exportDoc = null;
  function loadExport(authKey) {
    return stremioCall('/api/dataExport', { type: 'DataExport', authKey: authKey })
      .then(function (r) {
        var id = r && (r.exportId || r.export_id);
        if (!id) { return null; }
        return fetch('https://api.strem.io/data-export/' + encodeURIComponent(id) + '/export.json')
          .then(function (x) { return x.ok ? x.json() : null; })
          .then(function (doc) { exportDoc = doc; return doc; });
      })
      .catch(function () { return null; });
  }

  // `nim` is keyed "<seriesId> <season> <episode>", one entry per episode the
  // account has been told about and has not watched.
  function parseFollows(doc) {
    var nim = doc && doc.nim;
    if (!nim || typeof nim !== 'object') { return []; }
    var bySeries = {};
    Object.keys(nim).forEach(function (k) {
      var bits = String(k).split(/\s+/);
      if (!bits[0]) { return; }
      if (!bySeries[bits[0]]) { bySeries[bits[0]] = { id: bits[0], episodes: [] }; }
      bySeries[bits[0]].episodes.push(
        bits.length >= 3 ? 'S' + String(bits[1]).padStart(2, '0') + 'E' + String(bits[2]).padStart(2, '0') : k);
    });
    return Object.keys(bySeries).map(function (k) { return bySeries[k]; })
      .sort(function (a, b) { return b.episodes.length - a.episodes.length; });
  }

  // ---- metadata ---------------------------------------------------------
  // Cinemeta is Stremio's own catalogue, which the visitor's app already calls
  // from this device, so nothing new learns anything here. One request per
  // title, pooled so we never open more than a few at once.
  function loadMeta(rows, onProgress) {
    var seen = {}, jobs = [];
    rows.forEach(function (r) {
      // Stremio's own rows already carry name, poster, background and year, so
      // the only thing Cinemeta adds is genres. Cinemeta only serves movie and
      // series, so live-TV and event rows are skipped rather than 404'd, and
      // there is no point asking about something that was never played.
      if (!/^tt\d+$/.test(r.id) || seen[r.id]) { return; }
      if (r.type !== 'movie' && r.type !== 'series') { return; }
      if (!r.played) { return; }
      // Artwork and genres being present is not a reason to skip: a row the
      // backend recorded as watched without any playback time needs a runtime
      // to be counted at all, and the runtime only comes from Cinemeta. Nuvio
      // library items carry a poster, so skipping these left exactly the rows
      // this matters for without a runtime.
      var needsRuntime = r.played && r.watchedMs <= 0 && r.positionMs <= 0;
      if (r.poster && r.genres.length && !needsRuntime) { return; }
      seen[r.id] = 1;
      jobs.push({ id: r.id, kind: r.type });
    });
    var done = 0, cursor = 0, POOL = 6;
    if (!jobs.length) { return Promise.resolve(); }
    function next() {
      if (cursor >= jobs.length) { return Promise.resolve(); }
      var job = jobs[cursor++];
      return fetch(CINEMETA + '/meta/' + job.kind + '/' + encodeURIComponent(job.id) + '.json')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { if (j && j.meta) { metaById[job.id] = j.meta; } })
        .catch(function () {})
        .then(function () { onProgress(++done, jobs.length); return next(); });
    }
    var pool = [];
    for (var k = 0; k < Math.min(POOL, jobs.length); k++) { pool.push(next()); }
    return Promise.all(pool);
  }
  function meta(row) { return metaById[row.id] || {}; }
  // "2008–2013" and "181 min" are the shapes these actually arrive in.
  function yearOf(row) {
    var m = String(row.year || meta(row).year || meta(row).releaseInfo || '').match(/\d{4}/);
    return m ? Number(m[0]) : null;
  }
  function runtimeMin(row) {
    var m = String(meta(row).runtime || '').match(/(\d+)/);
    return m ? Number(m[1]) : null;
  }
  function ratingOf(row) {
    var r = parseFloat(meta(row).imdbRating);
    return isFinite(r) ? r : null;
  }

  // One counter per distinct title, so a 60-episode series is not 60 votes.
  function countBy(rows, pick) {
    var counts = {}, seen = {};
    rows.filter(function (r) { return r.played; }).forEach(function (r) {
      if (seen[r.id]) { return; }
      seen[r.id] = 1;
      (pick(r) || []).forEach(function (v) {
        if (v) { counts[v] = (counts[v] || 0) + 1; }
      });
    });
    return counts;
  }
  function renderDistribution(bar, chips, counts, limit, order, linkFor) {
    var list = Object.keys(counts).map(function (k) { return { k: k, c: counts[k] }; });
    list.sort(order || function (a, b) { return b.c - a.c; });
    list = list.slice(0, limit);
    var sum = list.reduce(function (a, r) { return a + r.c; }, 0);
    if (bar) { bar.textContent = ''; }
    chips.textContent = '';
    list.forEach(function (r, idx) {
      var col = GCOL[idx % GCOL.length];
      if (bar) {
        var i = document.createElement('i');
        i.style.width = (r.c / sum * 100) + '%';
        i.style.background = col;
        i.title = r.k;
        bar.appendChild(i);
      }
      var href = linkFor ? linkFor(r.k) : '';
      var li = document.createElement('li');
      var chip = href ? document.createElement('a') : li;
      if (href) {
        chip.href = href; chip.target = '_blank'; chip.rel = 'noopener noreferrer';
        chip.title = 'Search Stremio for ' + r.k;
        li.appendChild(chip);
      }
      chip.className = 'chip';
      chip.style.background = col + '22';
      chip.style.color = col;
      chip.textContent = r.k + ' · ' + r.c;
      chips.appendChild(li);
    });
    return sum;
  }
  function poster(row) { return row.poster || meta(row).poster || ''; }
  function genresOf(row) { return row.genres.length ? row.genres : (meta(row).genres || []); }
  function displayName(row) {
    var base = row.name && row.name !== row.id ? row.name : (meta(row).name || row.id);
    return row.season != null && row.episode != null
      ? base + ' S' + String(row.season).padStart(2, '0') + 'E' + String(row.episode).padStart(2, '0')
      : base;
  }
  function position(row) {
    // Finished rows can still carry a stray offset of a few hundred ms, which
    // renders as a baffling "0:00 / 47:22" unless finished is checked first.
    if (row.durationMs > 0 && row.positionMs / row.durationMs >= 0.9) { return 'finished'; }
    if (row.finished) { return 'marked watched'; }
    if (row.positionMs > 0) {
      return clockStr(row.positionMs) + (row.durationMs > 0 ? ' / ' + clockStr(row.durationMs) : '');
    }
    if (row.plays > 0) { return 'watched'; }
    return 'never played';
  }
  // The bar follows the saved position, not the watched flag. On a real account
  // flaggedWatched is set on rows sitting anywhere from 0.3% to the end, so it
  // says "someone marked this watched", not "playback reached the end".
  function progressPct(row) {
    if (!(row.durationMs > 0) || !(row.positionMs > 0)) { return null; }
    var p = row.positionMs / row.durationMs;
    return p < 0.9 ? Math.max(0.01, p) : null;
  }

  // Cinemeta's own meta objects link a cast or director name to
  // `stremio:///search?search=<name>`. That deep link only resolves if the
  // native app is installed, so the web route is used instead, matching the
  // timeline links. Other backends get an IMDb name search, since sending a
  // Nuvio user into Stremio would be odd.
  // A name with no artwork gets its initials on a colour derived from the name,
  // which at least distinguishes one profile from another.
  // Stremio leaves `fullname` blank on most accounts, so the only handle
  // available is usually the local part of the email. That is identifying, and
  // it is the one place on the page where the masking elsewhere is undone.
  function handleFrom(user) {
    var named = user && (user.fullname || user.name ||
      (user.user_metadata && (user.user_metadata.display_name || user.user_metadata.full_name)));
    if (named) { return String(named).trim(); }
    return realEmail && realEmail.indexOf('@') > 0 ? realEmail.split('@')[0] : '';
  }
  function possessive(name) {
    return name + (/s$/i.test(name) ? '\u2019' : '\u2019s');
  }

  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2)
      .map(function (w) { return w.charAt(0).toUpperCase(); }).join('');
  }
  function colourFor(name) {
    var h = 0;
    String(name || '').split('').forEach(function (ch) { h = (h * 31 + ch.charCodeAt(0)) >>> 0; });
    return GCOL[h % GCOL.length];
  }
  function avatarNode(opts) {
    if (opts.image) {
      var img = document.createElement('img');
      img.className = opts.poster ? 'art' : 'av';
      img.src = opts.image; img.alt = ''; img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      return img;
    }
    var el = document.createElement('span');
    el.className = 'av';
    el.textContent = initials(opts.name);
    if (opts.colour) {
      el.style.background = opts.colour;
    } else {
      var c = colourFor(opts.name);
      el.style.background = 'linear-gradient(135deg,' + c + ',' + c + '99)';
    }
    return el;
  }

  function personUrl(name) {
    if (!name) { return ''; }
    return backendId === 'stremio'
      ? 'https://web.stremio.com/#/search?search=' + encodeURIComponent(name)
      : 'https://www.imdb.com/find/?s=nm&q=' + encodeURIComponent(name);
  }

  function detailUrl(row) {
    if (backendId === 'stremio') {
      return STREMIO_WEB + '/' + row.type + '/' + encodeURIComponent(row.id) + '/' +
             encodeURIComponent(row.videoId || row.id);
    }
    return /^tt\d+$/.test(row.id) ? 'https://www.imdb.com/title/' + row.id + '/' : '';
  }
  function inRange(row) {
    if (yearFilter === 'all') { return true; }
    if (!row.last || row.last.getFullYear() !== Number(yearFilter)) { return false; }
    return monthFilter === 'all' || row.last.getMonth() === Number(monthFilter);
  }

  // ---- animation --------------------------------------------------------
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function countUp(el, to) {
    if (reduced || to < 2) { el.textContent = n(to); return; }
    var t0 = performance.now(), dur = 900;
    (function step(t) {
      var p = Math.min(1, (t - t0) / dur);
      el.textContent = n(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) { requestAnimationFrame(step); }
    })(t0);
  }
  function observeReveals() {
    var els = document.querySelectorAll('.reveal');
    if (reduced || !('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(els, function (e) { e.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    Array.prototype.forEach.call(els, function (e) { io.observe(e); });
  }

  // ---- tally ------------------------------------------------------------
  function tally(rows) {
    var t = { total: rows.length, inLibrary: 0, neverAdded: 0, takenOut: 0, offShelf: 0,
              played: 0, openedOnly: 0, ms: 0, oldest: null, rewatched: 0,
              abandoned: 0, finished: 0, cappedMs: 0, cappedCount: 0,
              estMs: 0, estCount: 0,
              viewLibrary: 0, viewContinue: 0, viewNowhere: 0 };
    rows.forEach(function (r) {
      if (r.shelf === 'library') { t.inLibrary++; } else { t.offShelf++; }
      if (r.shelf === 'never-added') { t.neverAdded++; }
      if (r.shelf === 'taken-out') { t.takenOut++; }
      if (r.inLibrary) { t.viewLibrary++; }
      if (r.inContinue) { t.viewContinue++; }
      if (!r.inLibrary && !r.inContinue) { t.viewNowhere++; }
      if (r.played) { t.played++; } else { t.openedOnly++; }
      if (r.plays > 1) { t.rewatched++; }
      if (r.finished) { t.finished++; }
      if (r.durationMs > 0 && r.positionMs > 0 && !r.finished) {
        var p = r.positionMs / r.durationMs;
        if (p > 0.05 && p < 0.85) { t.abandoned++; }
      }
      var c = r.created || r.last;
      if (c && (!t.oldest || c < t.oldest)) { t.oldest = c; }
    });
    var seen = {}, ratings = [], runtimes = [];
    rows.forEach(function (r) {
      if (!r.played || seen[r.id]) { return; }
      seen[r.id] = 1;
      var rt = ratingOf(r); if (rt) { ratings.push(rt); }
      var rm = runtimeMin(r); if (rm) { runtimes.push(rm); }
    });
    var avg = function (a) {
      return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : 0;
    };
    t.avgRating = ratings.length ? Math.round(avg(ratings) * 10) / 10 : 0;
    t.avgRuntime = runtimes.length ? Math.round(avg(runtimes)) : 0;

    // You cannot have watched more of something than its runtime, however many
    // times you went back to it. Stremio's overallTimeWatched does not hold to
    // that for series: it accumulates across episodes and reads about 1.7x what
    // the episode count and runtime allow, so a series watched once is reported
    // as though watched twice. Measured on a real account, 56 series claimed
    // 612 hours where their runtimes allow 386.
    //
    // Each row is capped at what its runtime permits, taking the runtime the
    // metadata lists where there is one and the file's own duration otherwise.
    // Movies are already honest (they measure at 0.93 of that ceiling) so the
    // cap does not touch them, and the Nuvio backends are clamped per row
    // before this, so it never binds there either.
    // Cinemeta does not always carry a runtime. Two of fourteen popular series
    // sampled had none, The Dragon Prince and The Owl House among them, and for
    // those an entry marked watched had nothing to be counted at and silently
    // stayed at zero: the very thing the estimate exists to fix, still broken
    // for a subset of shows, and invisible because those shows then sort to the
    // bottom of Most watched and fall off it. Where the metadata is silent, use
    // how long this account's own films and episodes actually run. That is
    // measured data rather than a guess, and it holds up when Cinemeta is
    // simply unreachable.
    // Built from the whole account rather than the filtered view: otherwise a
    // 2026 entry gets an estimate under All time and drops back to zero the
    // moment 2026 is selected, because the measured rows it borrows from sit
    // in 2025.
    var durs = { movie: [], series: [] };
    (allRows.length ? allRows : rows).forEach(function (r) {
      if (r.durationMs > 0 && durs[r.type]) { durs[r.type].push(r.durationMs); }
    });
    var typical = {};
    Object.keys(durs).forEach(function (k) {
      var a = durs[k].sort(function (x, y) { return x - y; });
      typical[k] = a.length ? a[Math.floor(a.length / 2)] : 0;
    });
    // A single yardstick for things whose own length can never be known, taken
    // only from films and episodes, because those are the rows whose length can
    // be checked against a runtime. Never from the same untrustworthy type: a
    // channel claiming 4600 hours would otherwise be its own evidence.
    var checkable = durs.movie.concat(durs.series).sort(function (x, y) { return x - y; });
    var typicalAny = checkable.length ? checkable[Math.floor(checkable.length / 2)] : 0;
    // The ceiling for things whose own length can never be known is the longest
    // film or episode this account has actually sat through, not the typical
    // one: an event or a sports fixture legitimately runs past a median
    // half-hour episode, and the median would have thrown that viewing away.
    // Six hours stands in for an account holding nothing measurable at all,
    // because falling back to the stream's own figure would restore exactly the
    // number this rejects.
    var longestCheckable = checkable.length ? checkable[checkable.length - 1] : 0;
    var sittingCap = longestCheckable > 0 ? longestCheckable : 6 * 3600000;

    rows.forEach(function (r) {
      r.effectiveMs = r.watchedMs;
      // The longer of the two ceilings, never the shorter: an extended cut runs
      // past the runtime the metadata lists, and trimming to the listed figure
      // would quietly under-report a viewing that genuinely happened. Time is
      // only removed when it exceeds both what the metadata lists and the file
      // that was actually played.
      var mins = runtimeMin(r);
      // A file claiming to run longer than half a day is a live stream rather
      // than a recording, and its duration is no better founded than the watch
      // time sitting next to it: one account carried 4,600 hours in both fields
      // for a channel opened once, so the bad number was its own ceiling.
      // Below that the file length is real evidence, and a recorded position is
      // already clamped to it, so a two-hour event in a three-hour video keeps
      // its two hours.
      var fileMs = (r.durationMs > 0 && r.durationMs <= 12 * 3600000) ? r.durationMs : 0;
      var unit = Math.max(mins ? mins * 60000 : 0, fileMs);
      // A backend can record that you watched something without recording how
      // long for. Nuvio's watched_items carries no duration at all -- it is
      // what you get when you mark something watched rather than play it, or
      // when you watched it elsewhere first -- and Stremio can flag an item
      // watched having never reported playback. Counted as nothing, a series
      // you marked off entirely reads as no time at all, which is exactly what
      // it did. Count it at what it runs for, and say below how much that is.
      // Only where this title has a runtime of its own. Falling back to the
      // account average credited live TV channels with an hour and a half
      // apiece, which is inventing viewing rather than reporting it: a channel
      // has no runtime because it does not have one, and tv, events and other
      // rows are not the kind of thing this can be estimated for at all.
      if (r.effectiveMs <= 0 && r.played) {
        if (r.positionMs > 0) {
          // Progress was recorded, the file's length simply was not. How far in
          // they got is measured time and belongs in the total; crediting a
          // whole runtime here would turn a few minutes into a full viewing.
          r.effectiveMs = r.positionMs;
        } else if (r.type === 'movie' || r.type === 'series') {
          // Still only films and series. A live-TV channel has no runtime
          // because it does not have one, and estimating those credited hours
          // nobody watched.
          var each = unit > 0 ? unit : (typical[r.type] || 0);
          if (each > 0) {
            // plays counts every viewing ever, while a filtered view covers one
            // period, so multiplying by it there would charge a whole history to
            // whichever month happens to hold the latest date.
            var times = yearFilter === 'all' ? Math.max(r.plays || 0, 1) : 1;
            r.effectiveMs = each * times;
            t.estMs += r.effectiveMs;
            t.estCount++;
          }
        }
      }
      // Only a runtime belonging to THIS title may cap it. Another show's median
      // cannot establish that this episode has ended: borrowing one trimmed 45
      // minutes of recorded progress down to 26 because other episodes are
      // shorter. Rows estimated from the median above are already exactly at
      // their own ceiling, so they lose nothing by being left alone here.
      // A live channel or an event has no runtime and no duration: nothing the
      // backend says about it can be checked, and unbounded is how one account
      // came to report 4,600 hours on a channel opened once. Those get the only
      // yardstick there is, a typical viewing, and only ever as a ceiling.
      // For a film or an episode, both inputs to unit are checkable: a runtime
      // from the metadata, or the length of the file that was played. For a
      // live channel neither exists, and the "duration" the stream reports is
      // as unfounded as the watch time itself -- one account had both at 4,600
      // hours for a channel opened once, so the garbage was its own ceiling.
      // Those are bounded by a typical viewing instead.
      // Films and episodes are bounded by their own runtime. Anything else has
      // none, so where its file length was not credible either, the longest
      // sitting this account can evidence stands in.
      var capUnit = (r.type === 'movie' || r.type === 'series') ? unit : (unit || sittingCap);
      if (capUnit > 0) {
        var ceiling = capUnit * Math.max(r.plays || 0, 1);
        // For a series the unit is only the episode this row happens to
        // describe, while the time spans every episode watched, and episodes
        // vary: a feature-length opener against a half-hour regular. Allow for
        // that rather than trim viewing that really happened. The inflation
        // being corrected here is around twofold, so this still catches it.
        if (r.type === 'series') { ceiling *= 1.2; }
        // A viewing in progress on top of the completed ones is real time that
        // the completed-play count has not caught up with yet. A position
        // sitting at the end of the file is the last completed play, not an
        // extra one, so it earns no allowance.
        var pos = r.positionMs || 0;
        if (pos > 0 && pos < capUnit * 0.9) { ceiling += pos; }
        if (r.effectiveMs > ceiling) {
          t.cappedMs += r.effectiveMs - ceiling;
          t.cappedCount++;
          r.effectiveMs = ceiling;
        }
      }
      t.ms += r.effectiveMs;
    });
    return t;
  }

  // ---- render -----------------------------------------------------------
  var provider = 'Stremio', providerHost = '', handle = '', shownBackendId = null;
  // "your backend" is a fine mid-sentence label and a poor start to one.
  function Provider() { return provider.charAt(0).toUpperCase() + provider.slice(1); }

  // The backdrop cycles through the period's most-watched titles, so changing
  // year or month visibly changes what is behind the number.
  var heroArts = [], heroIdx = 0, heroLayer = 0, heroTimer = null;

  function setHeroArt(list) {
    if (heroTimer) { clearInterval(heroTimer); heroTimer = null; }
    var a = $('heroart'), b = $('heroart2');
    var seen = {};
    heroArts = list.filter(function (u) {
      if (!u || seen[u]) { return false; }
      seen[u] = 1;
      return true;
    }).slice(0, 10);
    a.classList.remove('on'); b.classList.remove('on');
    if (!heroArts.length) { return; }
    a.style.backgroundImage = 'url("' + heroArts[0] + '")';
    a.classList.add('on');
    heroIdx = 0; heroLayer = 0;
    if (reduced || heroArts.length < 2) { return; }
    // Warm the cache so a swap does not fade in on an empty layer.
    heroArts.slice(1).forEach(function (u) { var i = new Image(); i.src = u; });
    heroTimer = setInterval(function () {
      heroIdx = (heroIdx + 1) % heroArts.length;
      var next = heroLayer === 0 ? b : a;
      var cur = heroLayer === 0 ? a : b;
      next.style.backgroundImage = 'url("' + heroArts[heroIdx] + '")';
      next.classList.add('on');
      cur.classList.remove('on');
      heroLayer = 1 - heroLayer;
    }, 6000);
  }

  function renderHero(rows, t) {
    setHeroArt(rows.filter(function (r) { return r.played; })
      .sort(function (a, b) {
        return (b.effectiveMs != null ? b.effectiveMs : b.watchedMs) -
               (a.effectiveMs != null ? a.effectiveMs : a.watchedMs);
      })
      .map(function (r) { return r.background || meta(r).background; }));
    $('heroperiod').textContent = yearFilter === 'all'
      ? (t.oldest ? 'Since ' + fmtFull.format(t.oldest) : 'All time')
      : (monthFilter === 'all'
          ? String(yearFilter)
          : new Intl.DateTimeFormat(LOC.locale, { month: 'long', year: 'numeric' })
              .format(new Date(Number(yearFilter), Number(monthFilter), 1)));
    var named = backendId !== 'custom';
    $('herotitle').textContent = (handle ? possessive(handle) + ' ' : 'Your ') +
      (named ? provider + ' ' : '') + 'RePlay';
    countUp($('herofig'), t.total);
    var cap = $('herocap');
    cap.textContent = '';
    var b = document.createElement('b');
    b.textContent = 'Entries in your ' + (named ? provider + ' ' : '') + 'log';
    cap.appendChild(b);
    cap.appendChild(document.createTextNode(
      t.oldest ? ', going back to ' + monthYear(t.oldest) + '.' : '.'));
  }

  function renderCards(t) {
    // Where the total differs from what the backend claims, say so. The page is
    // only worth anything if it explains its own numbers.
    var hn = $('hoursnote');
    var parts = [];
    var estimated = Math.round(t.estMs / 3600000);
    if (t.estCount && estimated >= 1) {
      parts.push(n(t.estCount) + ' ' + (t.estCount === 1 ? 'entry was' : 'entries were') +
        ' marked watched without any playback time recorded, which is what happens when you ' +
        'mark something watched rather than play it. ' + (t.estCount === 1 ? 'It is' : 'They are') +
        ' counted at ' + (t.estCount === 1 ? 'its' : 'their') + ' listed runtime, or at the ' +
        'typical length of what else you watch where nothing is listed, so ' + (estimated === 1
          ? 'about an hour of this total is an estimate rather than a measurement.'
          : 'about ' + n(estimated) + ' of these hours are an estimate rather than a measurement.'));
    }
    var trimmed = Math.round(t.cappedMs / 3600000);
    if (t.cappedCount && trimmed >= 1) {
      parts.push(n(t.cappedCount) + ' ' + (t.cappedCount === 1 ? 'title reports' : 'titles report') +
        ' more time than ' + (t.cappedCount === 1 ? 'its' : 'their') + ' runtime allows. ' +
        backend.name + ' adds playback time up across sessions, and across episodes for a series, ' +
        'so a title can total more than it can possibly run, and a live channel has no runtime ' +
        'to be checked against at all. ' +
        (t.cappedCount === 1 ? 'It is' : 'They are') + ' counted here at what a viewing can ' +
        'plausibly run to, about ' + n(trimmed) + ' hours below the figure the backend reports.');
    }
    hn.textContent = parts.join(' ');
    hn.hidden = !parts.length;
    var defs = [
      ['tint1', Math.round(t.ms / 3600000),
       t.estCount ? 'hours of watching, part of it estimated' : 'hours of playback logged', '\u23F3'],
      ['tint2', t.played, 'titles you actually played', '\u25B6\uFE0F'],
      ['tint3', t.viewNowhere || t.offShelf,
        t.viewNowhere ? 'not listed anywhere, still stored'
                      : 'not in your library, still stored', '\u{1F47B}'],
      ['tint4', t.openedOnly, 'opened, never played', '\u{1F440}']
    ];
    if (t.takenOut) {
      defs.push(['tint5', t.takenOut, 'you added, then removed', '\u{1F5D1}\uFE0F']);
    }
    if (t.avgRating) {
      defs.push(['tint2', t.avgRating, 'average IMDb score of what you watch', '\u2B50']);
    }
    if (t.avgRuntime) {
      defs.push(['tint5', t.avgRuntime, 'minutes, the average length you pick', '\u{1F4CF}']);
    }
    var host = $('cards');
    host.textContent = '';
    defs.filter(function (d) { return d[1]; }).forEach(function (d, idx) {
      var c = document.createElement('div');
      c.className = 'card ' + d[0] + ' reveal';
      c.style.animationDelay = (idx * 70) + 'ms';
      var row = document.createElement('div'); row.className = 'numrow';
      var em = document.createElement('span'); em.className = 'em'; em.textContent = d[3] || '';
      var num = document.createElement('span'); num.className = 'n'; num.textContent = '0';
      var k = document.createElement('span'); k.className = 'k'; k.textContent = d[2];
      row.appendChild(em); row.appendChild(num);
      c.appendChild(row); c.appendChild(k); host.appendChild(c);
      if (typeof d[1] === 'number' && d[1] % 1) { num.textContent = d[1].toFixed(1); }
      else { countUp(num, d[1]); }
    });
  }

  // One dry wink each rather than a costume party. Everything here is derived
  // from the record, so a thin account simply earns fewer of them.
  var GENRE_BADGE = {
    'Fantasy':     ['\u{1F9DD}', 'Friend of the elves'],
    'Animation':   ['\u{1F3A8}', 'Young at heart'],
    'Documentary': ['\u{1F4DC}', 'Loremaster'],
    'Horror':      ['\u{1F56F}', 'Walks in shadow'],
    'Comedy':      ['\u{1F344}', 'Merry'],
    'Drama':       ['\u{1F3AD}', 'Takes it seriously'],
    'Adventure':   ['\u{1F5FA}', 'There and back again'],
    'Action':      ['\u2694',    'Swings first'],
    'Sci-Fi':      ['\u{1F6F8}', 'Beyond the stars'],
    'Crime':       ['\u{1F50D}', 'Follows the trail'],
    'Family':      ['\u{1F3E1}', 'Keeps it wholesome'],
    'Thriller':    ['\u{1F300}', 'Likes the tension'],
    'Mystery':     ['\u{1F5DD}', 'Solves it early'],
    'Romance':     ['\u{1F338}', 'Soft-hearted']
  };

  function renderBadges(t, c, rows) {
    var out = [], dated = c.dated || 0;

    if (dated >= 20) {
      var late = c.buckets.slice(0, 5).reduce(function (a, b) { return a + b; }, 0);
      if (late / dated > 0.2) { out.push(['\u{1F319}', 'Watches by moonlight', Math.round(late / dated * 100) + '% after midnight']); }
      var early = c.buckets.slice(5, 9).reduce(function (a, b) { return a + b; }, 0);
      if (early / dated > 0.25) { out.push(['\u{1F305}', 'Up with the lark', Math.round(early / dated * 100) + '% before 9am']); }
      var wk = c.weekday + c.weekend;
      if (wk >= 20 && c.weekend / wk > 0.4) { out.push(['\u{1F6CB}', 'Weekender', Math.round(c.weekend / wk * 100) + '% at weekends']); }
    }

    var gcounts = countBy(rows, genresOf);
    var gnames = Object.keys(gcounts).sort(function (a, b) { return gcounts[b] - gcounts[a]; });
    if (gnames.length && GENRE_BADGE[gnames[0]]) {
      out.push([GENRE_BADGE[gnames[0]][0], GENRE_BADGE[gnames[0]][1],
                gnames[0] + ' leads, ' + n(gcounts[gnames[0]]) + ' titles']);
    }
    if (gnames.length >= 12) { out.push(['\u{1F9ED}', 'Wide-ranging', n(gnames.length) + ' genres in your record']); }
    else if (gnames.length && gnames.length <= 4) { out.push(['\u{1F3AF}', 'Single-minded', gnames.length === 1 ? 'Only one genre shows up' : 'Only ' + n(gnames.length) + ' genres show up']); }

    var years = rows.filter(function (r) { return r.played; }).map(yearOf).filter(Boolean);
    if (years.length >= 15) {
      var avg = Math.round(years.reduce(function (a, b) { return a + b; }, 0) / years.length);
      if (avg < 2005) { out.push(['\u{1F4FD}', 'Of the elder days', 'Average release year ' + avg]); }
      else if (avg >= 2019) { out.push(['\u2728', 'Of the fourth age', 'Average release year ' + avg]); }
      var oldest = Math.min.apply(null, years);
      if (oldest < 1960) { out.push(['\u{1F5DD}', 'Reads the old scrolls', 'Oldest title from ' + oldest]); }
    }

    var hrs = Math.round(t.ms / 3600000);
    if (hrs >= 1000) { out.push(['\u23F3', 'Many long years', n(hrs) + ' hours logged']); }
    else if (hrs >= 300) { out.push(['\u{1F525}', 'Keeps the hearth lit', n(hrs) + ' hours logged']); }

    if (t.played >= 10 && t.finished / t.played > 0.7) { out.push(['\u{1F3C1}', 'Finishes the quest', 'You see things through']); }
    if (t.played >= 10 && t.abandoned / t.played > 0.3) { out.push(['\u{1F6AA}', 'Leaves the fellowship', n(t.abandoned) + ' left unfinished']); }
    if (t.rewatched >= 5) { out.push(['\u{1F501}', 'Second breakfast', n(t.rewatched) + ' watched more than once']); }
    if (t.openedOnly >= 20 && t.openedOnly > t.played / 3) { out.push(['\u{1FA9F}', 'Browses the market', n(t.openedOnly) + ' opened, never played']); }
    if (t.takenOut >= 10) { out.push(['\u{1F5C4}', 'Tidy, in theory', n(t.takenOut) + ' removed, still held']); }
    if (t.neverAdded > t.inLibrary * 10 && t.neverAdded >= 50) { out.push(['\u{1F392}', 'Travels light', n(t.neverAdded) + ' watched without adding']); }
    if (c.busiestDay >= 5) { out.push(['\u{1F97E}', 'The long march', c.busiestDay + ' titles in a single day']); }
    // --- shape of the record, rather than the clock ---
    var play = rows.filter(function (r) { return r.played && r.last; });

    // Accounts also carry tv, events and other rows, which are neither films nor
    // episodes: counting them as either would misreport the split. And a Stremio
    // series row is a whole show rather than one episode, so the label says
    // "series", which is true whichever backend the record came from.
    var series = 0, films = 0;
    play.forEach(function (r) {
      if (r.type === 'series') { series++; }
      else if (r.type === 'movie') { films++; }
    });
    if (series + films >= 20) {
      if (series / (series + films) > 0.8) { out.push(['\u{1F4FA}', 'One more episode', Math.round(series / (series + films) * 100) + '% series']); }
      else if (films / (series + films) > 0.7) { out.push(['\u{1F3AC}', 'Sits for the whole tale', Math.round(films / (series + films) * 100) + '% films']); }
    }

    // Longest run of consecutive days with something played.
    var days = {}, msByDay = {};
    play.forEach(function (r) {
      var k = r.last.getFullYear() + '-' + r.last.getMonth() + '-' + r.last.getDate();
      days[k] = 1;
      msByDay[k] = (msByDay[k] || 0) + ((r.effectiveMs != null ? r.effectiveMs : r.watchedMs) || 0);
    });
    var keys = Object.keys(days).map(function (k) { var a = k.split('-'); return new Date(+a[0], +a[1], +a[2]).getTime(); }).sort(function (a, b) { return a - b; });
    var run = keys.length ? 1 : 0, best = run, DAY = 86400000;
    for (var i = 1; i < keys.length; i++) {
      run = (keys[i] - keys[i - 1] <= DAY * 1.5) ? run + 1 : 1;
      if (run > best) { best = run; }
    }
    if (best >= 5) { out.push(['\u{1F5FC}', 'Kept the watch', best + ' days in a row']); }
    if (keys.length >= 10) {
      var gap = 0;
      for (var j = 1; j < keys.length; j++) { gap = Math.max(gap, keys[j] - keys[j - 1]); }
      // Both ends of the gap are days you watched something, so the days away
      // is the span between them minus one.
      var gapDays = Math.max(0, Math.round(gap / DAY) - 1);
      if (gapDays >= 90) { out.push(['\u26F5', 'Sailed west, then came back', gapDays + ' days away at the longest']); }
    }
    // Stremio reports watched time cumulatively per title while `last` is only
    // the most recent timestamp, so months of viewing would pile onto a single
    // day and invent a marathon. Only the per-episode backends can answer this.
    if (backendId !== 'stremio') {
      var longest = 0;
      Object.keys(msByDay).forEach(function (k) { longest = Math.max(longest, msByDay[k]); });
      if (longest >= 6 * 3600000) { out.push(['\u{1F56F}', 'A long night in Moria', Math.round(longest / 3600000) + ' hours in one day']); }
    }

    // The series you gave the most of yourself to.
    var byShow = {};
    play.forEach(function (r) {
      if (r.type !== 'series') { return; }
      var nm = (r.name || '').replace(/\s*S\d{1,2}E\d{1,3}.*$/i, '').trim() || r.id;
      byShow[nm] = (byShow[nm] || 0) + 1;
    });
    var top = Object.keys(byShow).sort(function (a, b) { return byShow[b] - byShow[a]; })[0];
    if (top && byShow[top] >= 12) { out.push(['\u{1F9ED}', 'Walked every league', byShow[top] + ' episodes of ' + top]); }

    // A Stremio series row is the whole show and its timesWatched adds up across
    // episodes, so a big number there means many episodes rather than a rewatch.
    // Films are counted honestly, and the per-episode backends are fine either way.
    var mostPlays = 0, mostName = '';
    rows.forEach(function (r) {
      if (backendId === 'stremio' && r.type !== 'movie') { return; }
      if ((r.plays || 0) > mostPlays) { mostPlays = r.plays; mostName = r.name || ''; }
    });
    if (mostPlays >= 4) { out.push(['\u{1F4D6}', 'Knows it by heart', mostName + ', ' + mostPlays + ' times']); }

    if (t.oldest) { out.push(['\u{1F4DC}', 'Keeper of the annals', 'Your record starts ' + t.oldest.getFullYear()]); }

    if (!out.length) { out.push(['\u{1F331}', 'Early days', 'Not enough history to read a pattern']); }

    var ul = $('badges');
    ul.textContent = '';
    out.slice(0, 12).forEach(function (b, idx) {
      var li = document.createElement('li');
      li.className = 'badge';
      li.style.animationDelay = (idx * 60) + 'ms';
      var em = document.createElement('span'); em.className = 'em'; em.textContent = b[0];
      var wrap = document.createElement('div');
      var name = document.createElement('b'); name.textContent = b[1];
      var sub2 = document.createElement('span'); sub2.textContent = b[2];
      wrap.appendChild(name); wrap.appendChild(sub2);
      li.appendChild(em); li.appendChild(wrap); ul.appendChild(li);
    });
  }

  function renderTop(rows) {
    var byTitle = {};
    rows.filter(function (r) { return r.played; }).forEach(function (r) {
      if (!byTitle[r.id]) { byTitle[r.id] = { row: r, ms: 0, plays: 0 }; }
      byTitle[r.id].ms += (r.effectiveMs != null ? r.effectiveMs : r.watchedMs);
      byTitle[r.id].plays += r.plays || 1;
    });
    var top = Object.keys(byTitle).map(function (k) { return byTitle[k]; })
      .sort(function (a, b) { return b.ms - a.ms || b.plays - a.plays; }).slice(0, 10);

    var ol = $('top');
    ol.textContent = '';
    top.forEach(function (r, idx) {
      var m = meta(r.row);
      var li = document.createElement('li');
      li.className = 'reveal';
      li.style.animationDelay = (idx * 60) + 'ms';
      var rank = document.createElement('span'); rank.className = 'rank'; rank.textContent = String(idx + 1);
      li.appendChild(rank);
      var art = poster(r.row);
      if (art) {
        var img = document.createElement('img');
        img.className = 'art'; img.src = art; img.alt = ''; img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';
        li.appendChild(img);
      }
      var wrap = document.createElement('div'); wrap.className = 'meta';
      var url = detailUrl(r.row);
      var nm = document.createElement(url ? 'a' : 'span');
      nm.className = 'nm';
      if (url) { nm.href = url; nm.target = '_blank'; nm.rel = 'noopener noreferrer'; }
      nm.textContent = r.row.name && r.row.name !== r.row.id ? r.row.name : (m.name || r.row.id);
      var sm = document.createElement('span'); sm.className = 'sm';
      sm.textContent = [m.releaseInfo || m.year, genresOf(r.row).slice(0, 2).join(', '),
                        r.row.addonHost ? 'via ' + r.row.addonHost : '']
        .filter(Boolean).join(' · ');
      wrap.appendChild(nm); wrap.appendChild(sm);
      var hrs = document.createElement('span'); hrs.className = 'hrs';
      var h = r.ms / 3600000;
      hrs.textContent = h >= 1 ? h.toFixed(1) + 'h' : (r.ms > 0 ? Math.round(r.ms / 60000) + 'm'
                                                               : r.plays + '×');
      li.appendChild(wrap); li.appendChild(hrs);
      ol.appendChild(li);
    });
  }

  var GCOL = ['#a3d45f', '#4fbf9e', '#e0b44a', '#7fa8d9', '#d98e4a', '#b98ee0', '#5fc9d4', '#c9d466'];

  function renderGenres(rows) {
    var counts = countBy(rows, genresOf);
    var sum = renderDistribution($('gbar'), $('genres'), counts, 8);
    $('genrenote').textContent = sum
      ? 'Counted once per title. ' + Provider() +
        ' does not store any of this. It is worked out from the titles in your record.'
      : 'No genre data available for these titles.';
  }

  function renderDecades(rows) {
    var counts = countBy(rows, function (r) {
      var y = yearOf(r);
      return y ? [String(Math.floor(y / 10) * 10) + 's'] : [];
    });
    var sum = renderDistribution($('decbar'), $('decades'), counts, 8, function (a, b) {
      return a.k.localeCompare(b.k);
    });
    if (!sum) { $('decnote').textContent = 'No release years available.'; return; }
    var years = rows.filter(function (r) { return r.played; }).map(yearOf).filter(Boolean);
    var oldest = Math.min.apply(null, years), newest = Math.max.apply(null, years);
    var mean = Math.round(years.reduce(function (a, b) { return a + b; }, 0) / years.length);
    $('decnote').textContent = 'Oldest ' + oldest + ', newest ' + newest +
      ', average year ' + mean + '. Release year is stored with the record, so nothing had to be looked up.';
  }

  function renderPeople(rows) {
    var cast = countBy(rows, function (r) { return (meta(r).cast || []).slice(0, 4); });
    var sum = renderDistribution(null, $('people'), cast, 12, null, personUrl);
    var dirs = countBy(rows, function (r) { return meta(r).director || []; });
    var top = Object.keys(dirs).map(function (k) { return { k: k, c: dirs[k] }; })
      .sort(function (a, b) { return b.c - a.c; }).filter(function (d) { return d.c > 1; }).slice(0, 3);
    var note = $('peoplenote');
    note.textContent = '';
    if (!sum) { note.textContent = 'No cast data available for these titles.'; return; }
    if (top.length) {
      note.appendChild(document.createTextNode('Directors you return to: '));
      top.forEach(function (d, i) {
        var a = document.createElement('a');
        a.href = personUrl(d.k); a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.textContent = d.k + ' (' + d.c + ')';
        note.appendChild(a);
        note.appendChild(document.createTextNode(i < top.length - 1 ? ', ' : '. '));
      });
    }
    note.appendChild(document.createTextNode(
      'Every name links to a search in ' + (backendId === 'stremio' ? 'Stremio' : 'IMDb') +
      '. Nobody stores this list. It comes out of the titles in your record.'));
  }

  function renderClock(rows) {
    var buckets = new Array(24).fill(0), byDay = {};
    var weekday = 0, weekend = 0, dated = 0;
    rows.forEach(function (r) {
      var d = r.last;
      if (!d) { return; }
      dated++;
      buckets[d.getHours()]++;
      var key = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
      byDay[key] = (byDay[key] || 0) + 1;
      if (d.getDay() === 0 || d.getDay() === 6) { weekend++; } else { weekday++; }
    });
    var busiestDay = Object.keys(byDay).reduce(function (m, k) { return Math.max(m, byDay[k]); }, 0);
    var max = Math.max.apply(null, buckets) || 1;
    var peak = buckets.indexOf(max);

    var el = $('clock');
    el.textContent = '';
    buckets.forEach(function (count, hour) {
      var b = document.createElement('i');
      b.style.height = Math.max(2, Math.round((count / max) * 100)) + '%';
      b.style.animationDelay = (hour * 22) + 'ms';
      if (hour === peak && count > 0) { b.className = 'peak'; }
      b.title = String(hour).padStart(2, '0') + ':00, ' + count + ' ' + plural(count, 'entry', 'entries');
      el.appendChild(b);
    });
    $('clocknote').textContent = dated
      ? 'Busiest hour: ' + String(peak).padStart(2, '0') + ':00, across ' + n(dated) +
        ' timestamped ' + plural(dated, 'entry', 'entries') + ', shown in ' + LOC.timeZone + '.'
      : 'No timestamps recorded.';
    return { buckets: buckets, peak: peak, weekday: weekday, weekend: weekend,
             dated: dated, busiestDay: busiestDay };
  }

  // The timeline is the exhibit: not a sample, the whole record in order.
  function renderTimeline() {
    var rows = allRows.filter(inRange).filter(function (r) { return r.last; });
    if (timelineMode === 'played') { rows = rows.filter(function (r) { return r.played; }); }
    rows.sort(function (a, b) { return b.last - a.last; });

    var host = $('timeline');
    host.textContent = '';
    var frag = document.createDocumentFragment();
    var year = null, month = null, list = null;

    rows.forEach(function (row) {
      var d = row.last;
      if (d.getFullYear() !== year) {
        year = d.getFullYear(); month = null;
        var h = document.createElement('div');
        h.className = 'tlyear'; h.textContent = String(year);
        frag.appendChild(h);
      }
      if (d.getMonth() !== month) {
        month = d.getMonth();
        var sub = document.createElement('div');
        sub.className = 'tlmonth'; sub.textContent = fmtMonth.format(d);
        frag.appendChild(sub);
        list = document.createElement('ol'); list.className = 'tl';
        frag.appendChild(list);
      }
      var li = document.createElement('li');
      if (!row.played) { li.className = 'unplayed'; }
      var url = detailUrl(row);
      var a = document.createElement(url ? 'a' : 'div');
      if (url) {
        a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.title = backendId === 'stremio' ? 'Open in Stremio' : 'Look up on IMDb';
      }
      var art = poster(row);
      if (art) {
        var img = document.createElement('img');
        img.className = 'art'; img.src = art; img.alt = ''; img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';
        a.appendChild(img);
      }
      var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = displayName(row);
      a.appendChild(nm);

      var box = document.createElement('span'); box.className = 'meta';
      var pct = progressPct(row);
      if (pct !== null) {
        var bar = document.createElement('span'); bar.className = 'bar';
        var fill = document.createElement('i'); fill.style.width = (pct * 100) + '%';
        bar.appendChild(fill);
        bar.title = clockStr(row.positionMs) + ' of ' + clockStr(row.durationMs);
        box.appendChild(bar);
        var st2 = document.createElement('span'); st2.className = 'st';
        st2.textContent = Math.round(pct * 100) + '%' + (row.finished ? ' · marked watched' : '');
        box.appendChild(st2);
      } else {
        var lbl = document.createElement('span'); lbl.className = 'st';
        lbl.textContent = position(row);
        box.appendChild(lbl);
      }
      var day = document.createElement('span'); day.className = 'd'; day.textContent = fmtDay.format(d);
      box.appendChild(day);
      a.appendChild(box);
      li.appendChild(a);

      // Only where the backend can genuinely delete one entry. Stremio cannot,
      // so it never gets a button that would imply otherwise.
      if (backendId !== 'stremio') {
        var scrub = document.createElement('button');
        scrub.type = 'button';
        scrub.className = 'scrub';
        scrub.textContent = 'Scrub';
        // A watched flag with no progress row behind it: there is nothing for
        // the backend to delete. The button still occupies the gutter, because
        // .scrub is only transparent, not removed -- drop it and this one row
        // stretches wider than the rest.
        if (!row.progressKey) {
          scrub.classList.add('noscrub');
          scrub.disabled = true;
          scrub.tabIndex = -1;
          scrub.setAttribute('aria-hidden', 'true');
          li.appendChild(scrub);
          list.appendChild(li);
          return;
        }
        scrub.title = 'Delete this entry from your backend';
        scrub.addEventListener('click', function (ev) {
          ev.preventDefault();
          if (!scrub.classList.contains('armed')) {
            scrub.classList.add('armed');
            scrub.textContent = 'Delete?';
            setTimeout(function () {
              if (scrub.isConnected && scrub.classList.contains('armed')) {
                scrub.classList.remove('armed');
                scrub.textContent = 'Scrub';
              }
            }, 4000);
            return;
          }
          scrub.disabled = true;
          scrub.textContent = '\u2026';
          rpc(session.cfg, 'sync_delete_watch_progress',
              { p_keys: [row.progressKey], p_profile_id: row.profileId || 1 })
            .then(function () {
              allRows = allRows.filter(function (x) { return x !== row; });
              paint();
            })
            .catch(function (err) {
              scrub.disabled = false;
              scrub.classList.remove('armed');
              scrub.textContent = 'Scrub';
              scrub.title = err.message || "O backend recusou a exclusão.";
            });
        });
        li.appendChild(scrub);
      }

      list.appendChild(li);
    });

    host.appendChild(frag);
    var scoped = allRows.filter(inRange);
    var undated = scoped.length - scoped.filter(function (r) { return r.last; }).length;
    $('timelinenote').textContent =
      n(rows.length) + ' ' + plural(rows.length, 'entry', 'entries') +
      (rows.length ? ', back to ' + fmtFull.format(rows[rows.length - 1].last) : '') +
      (backendId !== 'stremio' && rows.some(function (r) { return r.progressKey; })
        ? ' Hover any entry to scrub it on its own, which Stremio has no way to do.' : '') +
      (rows.length && detailUrl(rows[0]) ? '. Each one links to its page.' : '.') +
      (undated ? ' ' + n(undated) + ' further ' + plural(undated, 'entry carries', 'entries carry') +
        ' no timestamp and is not shown.' : '');
  }

  function pillRow(host, options, current, onPick) {
    host.textContent = '';
    options.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-selected', String(o[0]) === String(current) ? 'true' : 'false');
      b.textContent = o[1];
      b.addEventListener('click', function () { onPick(String(o[0])); });
      host.appendChild(b);
    });
  }

  function renderYears() {
    var years = {};
    allRows.forEach(function (r) { if (r.last) { years[r.last.getFullYear()] = 1; } });
    var list = Object.keys(years).sort(function (a, b) { return b - a; });
    if (list.length < 2) { $('years').textContent = ''; $('months').hidden = true; return; }
    pillRow($('years'),
      [['all', 'All time']].concat(list.map(function (y) { return [y, y]; })),
      yearFilter,
      function (v) { yearFilter = v; monthFilter = 'all'; paint(); });
    renderMonths();
  }

  // Only months that actually hold something, so a quiet year does not render
  // eleven dead pills.
  function renderMonths() {
    var host = $('months');
    if (yearFilter === 'all') { host.hidden = true; host.textContent = ''; return; }
    var seen = {};
    allRows.forEach(function (r) {
      if (r.last && r.last.getFullYear() === Number(yearFilter)) { seen[r.last.getMonth()] = 1; }
    });
    var months = Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
    if (!months.length) { host.hidden = true; host.textContent = ''; return; }
    host.hidden = false;
    var short = new Intl.DateTimeFormat(LOC.locale, { month: 'short' });
    pillRow(host,
      [['all', 'All year']].concat(months.map(function (m) {
        return [m, short.format(new Date(Number(yearFilter), m, 1))];
      })),
      monthFilter,
      function (v) { monthFilter = v; paint(); });
  }

  function renderAccount(pairs) {
    var dl = $('account');
    dl.textContent = '';
    pairs.forEach(function (r) {
      var w = document.createElement('div');
      var dt = document.createElement('dt'); dt.textContent = r[0];
      var dd = document.createElement('dd'); dd.textContent = r[1];
      w.appendChild(dt); w.appendChild(dd); dl.appendChild(w);
    });
  }

  function renderFollows() {
    var follows = extras.follows || [];
    $('followsec').hidden = !follows.length;
    if (!follows.length) { return; }
    var ul = $('follows');
    ul.textContent = '';
    var total = 0;
    follows.forEach(function (f) {
      total += f.episodes.length;
      var li = document.createElement('li');
      var fm = metaById[f.id] || {};
      var av = avatarNode({ image: fm.poster, poster: true, name: fm.name || f.id });
      var nm = document.createElement('span'); nm.className = 'pn';
      nm.textContent = fm.name || f.id;
      var de = document.createElement('span'); de.className = 'pl';
      de.textContent = f.episodes.slice(0, 4).join(', ') +
        (f.episodes.length > 4 ? ' +' + (f.episodes.length - 4) : '');
      li.appendChild(av); li.appendChild(nm); li.appendChild(de);
      ul.appendChild(li);
    });
    $('follownote').textContent = Provider() + ' is watching for new episodes of ' +
      n(follows.length) + ' ' + plural(follows.length, 'series', 'series') +
      ' and has flagged ' + n(total) + ' ' + plural(total, 'episode', 'episodes') +
      ' you have not watched yet. This is how the apps know to tell you something has ' +
      'landed. It lives in the export rather than the log.';
  }

  function renderExtras() {
    var profiles = extras.profiles || [];
    $('profilesec').hidden = !profiles.length;
    if (profiles.length) {
      var ul = $('profiles');
      ul.textContent = '';
      profiles.forEach(function (p) {
        var li = document.createElement('li');
        var av = avatarNode({ image: p.avatar, name: p.name, colour: p.colour });
        var nm = document.createElement('span'); nm.className = 'pn'; nm.textContent = p.name;
        var de = document.createElement('span'); de.className = 'pl'; de.textContent = p.detail;
        li.appendChild(av); li.appendChild(nm); li.appendChild(de);
        ul.appendChild(li);
      });
      $('profilenote').textContent = backendId === 'stremio'
        ? 'Household profiles come with Stremio Supporter, and the account record ' +
          'names each one and says whether it carries a PIN. It stores whether a PIN exists, ' +
          'and never the PIN.'
        : Provider() + ' keeps a profile per member of the household, which means it also ' +
          'knows how many of you there are, and stores the PIN hash rather than just a flag.';
    }

    var publicly = extras.publicly || [];
    if (publicly.length) {
      var pn = $('profilenote');
      pn.textContent = (pn.textContent ? pn.textContent + ' ' : '') + publicly.join(' ');
    }

    var withheld = extras.withheld || [];
    $('withheldsec').hidden = !withheld.length;
    if (withheld.length) {
      var wl = $('withheld');
      wl.textContent = '';
      withheld.forEach(function (w) {
        var li = document.createElement('li'); li.textContent = w; wl.appendChild(li);
      });
    }
  }

  function paint() {
    var rows = allRows.filter(inRange);
    var t = tally(rows);
    var c = renderClock(rows);
    renderHero(rows, t);
    renderCards(t);
    renderBadges(t, c, rows);
    renderTop(rows);
    renderGenres(rows);
    renderDecades(rows);
    renderPeople(rows);
    renderTimeline();
    renderYears();
    renderExtras();
    renderFollows();
    renderShelfNote(t);
    observeReveals();
  }

  // Worth spelling out, because the flag is easy to misread: in Stremio's own
  // model a row starts out removed:true, temp:true the moment you open or play
  // something. Being off the library shelf usually means it was never added,
  // not that anyone deleted anything.
  // The user-facing model is wrong if it is called a library. It is a log, and
  // the app derives two views from it. Most rows are in neither.
  function renderShelfNote(t) {
    var list = $('shelfstates'), note = $('shelfnote');
    list.textContent = '';
    if (backendId !== 'stremio') {
      note.textContent = t.offShelf
        ? n(t.offShelf) + ' ' + plural(t.offShelf, 'entry has', 'entries have') +
          ' playback recorded for a title that is not in your library.'
        : '';
      return;
    }
    var states = [
      [t.viewContinue, 'Offered back in Continue Watching',
       'It has a saved position, so the app suggests you resume it.'],
      [t.viewLibrary, 'In your Library', 'Titles you added, to come back to later.'],
      [t.viewNowhere, 'Not shown anywhere',
       'Watched once and not added, or finished, or dismissed from Continue Watching. ' +
       'Nothing lists it any more. Still stored.']
    ];
    states.forEach(function (row) {
      var li = document.createElement('li');
      var c = document.createElement('span'); c.className = 'c'; c.textContent = n(row[0]);
      var l = document.createElement('span'); l.className = 'l';
      var b = document.createElement('b'); b.textContent = row[1];
      var sp = document.createElement('span'); sp.textContent = row[2];
      l.appendChild(b); l.appendChild(sp);
      li.appendChild(c); li.appendChild(l);
      list.appendChild(li);
    });
    var share = t.total ? t.viewLibrary / t.total : 0;
    note.textContent =
      'How this splits depends on how much you use the Library. Some people curate it ' +
      'closely, others rarely touch it. ' +
      (share >= 0.2
        ? 'You add a good share of what you watch. '
        : 'Most of what you watch is played once and never added. ') +
      'The entries remain either way. ' +
      (t.takenOut === 0
        ? 'None have been removed.'
        : n(t.takenOut) + ' ' + plural(t.takenOut, 'entry was', 'entries were') + ' added and later removed.') +
      ' An entry can sit in both of the first two, so these do not add up to ' + n(t.total) + '. ' +
      'RePlay is reading the server\u2019s copy, which the apps push to on their own schedule, so a change ' +
      'from the last few minutes may not be here yet.';
  }

  function setTimelineMode(mode) {
    timelineMode = mode;
    $('tl-played').setAttribute('aria-selected', mode === 'played' ? 'true' : 'false');
    $('tl-all').setAttribute('aria-selected', mode === 'all' ? 'true' : 'false');
    renderTimeline();
  }
  $('tl-played').addEventListener('click', function () { setTimelineMode('played'); });
  $('tl-all').addEventListener('click', function () { setTimelineMode('all'); });
  $('tl-expand').addEventListener('click', function () {
    var open = $('timeline').classList.toggle('open');
    this.textContent = open ? 'Collapse the timeline' : "Mostrar todo o histórico";
  });

  // ---- restoring from a downloaded copy ---------------------------------
  // Stremio's export wraps each entry as {__id,_id,_mtime,d,user_id}, so the
  // document lives in `d`. `_mtime` is bumped on the way back in, otherwise a
  // device holding newer rows re-pushes them straight over the restore.
  var restoreArmed = false;

  function libraryFromFile(doc) {
    var rows = null;
    if (Array.isArray(doc)) { rows = doc; }
    else if (doc && Array.isArray(doc.library)) { rows = doc.library; }
    if (!rows) { return null; }
    var now = new Date().toISOString();
    return rows.map(function (r) {
      var d = (r && r.d) ? r.d : r;
      if (!d || !d._id) { return null; }
      var copy = JSON.parse(JSON.stringify(d));
      copy._mtime = now;
      return copy;
    }).filter(Boolean);
  }

  function resetRestore() {
    restoreArmed = false;
    $('restore-go').textContent = "Restaurar arquivo";
  }
  $('restore-file').addEventListener('change', function () {
    resetRestore();
    $('restore-msg').textContent = '';
  });

  $('restore-go').addEventListener('click', function () {
    var msg = $('restore-msg');
    var file = $('restore-file').files && $('restore-file').files[0];
    if (!file) { msg.textContent = "Escolha um arquivo exportado pelo RePlay."; return; }
    var btn = this;
    var reader = new FileReader();
    reader.onload = function () {
      var doc;
      try { doc = JSON.parse(reader.result); }
      catch (e) { msg.textContent = "O arquivo não contém um JSON válido."; return; }

      if (backendId === 'stremio') {
        var changes = libraryFromFile(doc);
        if (!changes || !changes.length) { msg.textContent = "Nenhum registro encontrado no arquivo."; return; }
        if (!restoreArmed) {
          restoreArmed = true;
          btn.textContent = 'Yes, restore ' + n(changes.length) + ' ' + plural(changes.length, 'entry', 'entries');
          msg.textContent = "Isto sobrescreve os dados atuais do servidor. Confirme novamente para continuar.";
          return;
        }
        btn.disabled = true;
        msg.textContent = 'Restoring\u2026';
        var batches = [];
        for (var i = 0; i < changes.length; i += 100) { batches.push(changes.slice(i, i + 100)); }
        var done = 0;
        (function next() {
          if (!batches.length) {
            btn.disabled = false; resetRestore();
            msg.textContent = 'Restored ' + n(done) + '. Reading your record again\u2026';
            review(null, true);
            return;
          }
          var batch = batches.shift();
          stremioCall('/api/datastorePut', {
            type: 'DatastorePut', authKey: session.authKey,
            collection: 'libraryItem', changes: batch
          }).then(function () { done += batch.length; next(); })
            .catch(function (err) {
              btn.disabled = false; resetRestore();
              msg.textContent = 'Stopped after ' + n(done) + '. ' + (err.message || "O backend recusou a gravação.");
            });
        })();
        return;
      }

      // Nuvio and anything compatible take the whole envelope back in one call.
      if (!restoreArmed) {
        restoreArmed = true;
        btn.textContent = "Sim, restaurar este backup";
        msg.textContent = "Isto substitui o conteúdo da conta no servidor. Confirme novamente para continuar.";
        return;
      }
      btn.disabled = true;
      msg.textContent = 'Restoring\u2026';
      rpc(session.cfg, 'sync_restore_account_backup', { p_backup: doc, p_mode: 'replace' })
        .then(function () {
          btn.disabled = false; resetRestore();
          msg.textContent = 'Restored. Reading your record again\u2026';
          review(null, true);
        })
        .catch(function (err) {
          btn.disabled = false; resetRestore();
          msg.textContent = err.message || "O backend recusou a restauração.";
        });
    };
    reader.readAsText(file);
  });

  // ---- clearing playback data -------------------------------------------
  // Stremio has no per-entry delete, so this writes each entry back with its
  // state zeroed. `removed` and `temp` are preserved, so nothing moves in or
  // out of the Library; only the behavioural payload goes. `_mtime` has to be
  // bumped or another device can resync the old values back over the top.
  var clearArmed = false;

  function clearableRows() {
    var v = $('clear-scope').value;
    return allRows.filter(function (r) {
      if (!r.played) { return false; }
      if (backendId === 'stremio' ? !r.rawId : !r.progressKey) { return false; }
      if (v === 'all') { return true; }
      if (!r.last) { return false; }
      if (v.indexOf('before:') === 0) { return r.last.getFullYear() < Number(v.slice(7)); }
      return r.last.getFullYear() === Number(v);
    });
  }

  function clearVerb() { return backendId === 'stremio' ? "Limpar dados de reprodução" : "Excluir registros de reprodução"; }
  function resetClearButton() {
    clearArmed = false;
    $('clear-go').textContent = clearVerb();
    $('clear-msg').textContent = '';
  }

  function fillClearScope() {
    var canStremio = backendId === 'stremio' && allRows.some(function (r) { return r.rawId; });
    var canNuvio = backendId !== 'stremio' && allRows.some(function (r) { return r.progressKey; });
    if (!allRows.length || (!canStremio && !canNuvio)) { $('clear-option').hidden = true; return; }
    $('clear-option').hidden = false;
    $('clear-copy-stremio').hidden = !canStremio;
    $('clear-copy-nuvio').hidden = canStremio;
    var years = {};
    allRows.forEach(function (r) { if (r.last && r.played) { years[r.last.getFullYear()] = 1; } });
    var list = Object.keys(years).sort(function (a, b) { return b - a; });
    var sel = $('clear-scope');
    sel.textContent = '';
    var opts = [['all', "Todo o histórico"]];
    if (list.length > 1) { opts.push(['before:' + list[0], 'Everything before ' + list[0]]); }
    list.forEach(function (y) { opts.push([y, 'Just ' + y]); });
    opts.forEach(function (o) {
      var el = document.createElement('option');
      el.value = o[0]; el.textContent = o[1];
      sel.appendChild(el);
    });
    resetClearButton();
  }

  function zeroed(row) {
    return {
      _id: row.rawId,
      removed: row.shelf !== 'library',
      temp: row.shelf === 'never-added',
      _mtime: new Date().toISOString(),
      state: {
        lastWatched: '', timeWatched: 0, timeOffset: 0, overallTimeWatched: 0,
        timesWatched: 0, flaggedWatched: 0, duration: 0, video_id: '', watched: '',
        noNotif: false, season: 0, episode: 0
      }
    };
  }

  $('clear-scope').addEventListener('change', resetClearButton);

  $('clear-go').addEventListener('click', function () {
    var rows = clearableRows();
    var msg = $('clear-msg');
    if (!rows.length) { msg.textContent = "Nenhum registro neste período."; return; }
    if (!clearArmed) {
      clearArmed = true;
      this.textContent = 'Confirmar: ' + (backendId === 'stremio' ? 'limpar ' : 'excluir ') +
        n(rows.length) + ' ' + plural(rows.length, 'entry', 'entries');
      msg.textContent = backendId === 'stremio'
        ? "Confira a cópia exportada. Clique novamente para confirmar."
        : "Esta ação pode ser irreversível no Nuvio oficial. Clique novamente para confirmar.";
      return;
    }
    var btn = this;
    btn.disabled = true;
    msg.textContent = 'Working\u2026';

    // Nuvio can actually delete, so it does. Grouped by profile because the RPC
    // takes one profile id per call.
    if (backendId !== 'stremio') {
      var byProfile = {};
      rows.forEach(function (r) {
        var pid = r.profileId || 1;
        (byProfile[pid] = byProfile[pid] || []).push(r.progressKey);
      });
      var jobs = Object.keys(byProfile).map(function (pid) {
        return { pid: Number(pid), keys: byProfile[pid] };
      });
      var removed = 0;
      (function nextProfile() {
        if (!jobs.length) {
          btn.disabled = false; resetClearButton();
          msg.textContent = 'Deleted ' + n(removed) + '. Reading your record again\u2026';
          review(null, true);
          return;
        }
        var job = jobs.shift();
        rpc(session.cfg, 'sync_delete_watch_progress',
            { p_keys: job.keys, p_profile_id: job.pid })
          .then(function () { removed += job.keys.length; nextProfile(); })
          .catch(function (err) {
            btn.disabled = false; resetClearButton();
            msg.textContent = 'Stopped after ' + n(removed) + '. ' +
              (err.message || "O backend recusou a exclusão.");
          });
      })();
      return;
    }

    var changes = rows.map(zeroed);
    var batches = [];
    for (var i = 0; i < changes.length; i += 100) { batches.push(changes.slice(i, i + 100)); }
    var done = 0;
    (function next() {
      if (!batches.length) {
        btn.disabled = false;
        resetClearButton();
        msg.textContent = 'Cleared ' + n(done) + '. Reading your record again\u2026';
        review(null, true);
        return;
      }
      var batch = batches.shift();
      stremioCall('/api/datastorePut', {
        type: 'DatastorePut', authKey: session.authKey,
        collection: 'libraryItem', changes: batch
      }).then(function () { done += batch.length; next(); })
        .catch(function (err) {
          btn.disabled = false;
          resetClearButton();
          msg.textContent = 'Stopped after ' + n(done) + '. ' + (err.message || "O backend recusou a gravação.");
        });
    })();
  });

  // ---- flow -------------------------------------------------------------
  function review(e, resuming) {
    if (e) { e.preventDefault(); }
    clear();
    $('go').disabled = true;
    $('resume').hidden = true;

    if (resuming && session) {
      say("Lendo seu histórico…");
      var again = session.kind === 'stremio'
        ? readStremio({ authKey: session.authKey })
        : readNuvioWithSession();
      return finish(again);
    }

    var creds = {
      email: ($('email').value || '').trim(),
      password: $('password').value,
      authKey: (backendId === 'stremio' && authMode === 'key')
        ? ($('authkey').value || '').trim() : ''
    };
    return finish(backendId === 'stremio'
      ? readStremio(creds)
      : readNuvio(creds, ($('baseurl').value || '').trim()));
  }

  // A restored Nuvio session already holds base, key and token, so it skips the
  // password grant entirely and goes straight to the reads.
  function readNuvioWithSession() {
    var cfg = session.cfg;
    return Promise.all([
      fetch(cfg.base + '/auth/v1/user', {
        headers: { 'apikey': cfg.key, 'Authorization': 'Bearer ' + cfg.token }
      }).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }),
      rpc(cfg, 'sync_export_account_backup', {}),
      rpc(cfg, 'sync_pull_profile_locks', {}).catch(function () { return null; }),
      rpc(cfg, 'get_my_membership_overview', {}).catch(function () {
        return rpc(cfg, 'get_my_member_access', {}).catch(function () { return null; });
      })
    ]).then(function (parts) {
      return buildNuvio({ user: parts[0] || {}, backup: parts[1],
                          locks: parts[2], member: parts[3] }, cfg);
    });
  }

  function finish(read) {
    read.then(function (result) {
      provider = result.provider;
      providerHost = result.providerHost || '';
      handle = result.handle || '';
      allRows = result.rows;
      extras = result.extras || {};
      renderAccount(result.account);

      startSpells();
      $('prog').hidden = false;
      var bar = $('prog').firstElementChild;
      var extra = (backendId === 'stremio' && session && session.authKey)
        ? loadExport(session.authKey).then(function (doc) {
            extras.follows = parseFollows(doc);
            return extras.follows.map(function (f) {
              return { id: f.id, type: 'series', played: true, poster: '', genres: [] };
            });
          })
        : Promise.resolve([]);
      return extra.then(function (followRows) {
        return loadMeta(allRows.concat(followRows), function (done, total) {
          bar.style.width = (done / total * 100) + '%';
        });
      });
    }).then(function () {
      stopSpells();
      $('prog').hidden = true;
      saveSession($('remember').checked);
      $('dl-export').disabled = !exportDoc;
      fillClearScope();
      $('export-note').textContent = exportDoc
        ? "O arquivo pode conter URLs autenticadas de addons. Proteja-o como uma senha."
        : "O backend não retornou uma cópia.";
      paint();
      $('results').hidden = false;
      $('actions').hidden = false;

      $('signin').hidden = true;
      $('signedin').hidden = false;
      shownBackendId = backendId;
      $('signedintext').textContent = 'Showing ' + (providerHost || provider) + '.';

      clear();
      window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    }).catch(function (err) {
      stopSpells();
      $('prog').hidden = true;
      // A restored key that the backend has since rejected should not strand
      // the visitor on a dead resume prompt.
      forgetSession(backendId);
      say(err.message || "Não foi possível concluir a operação.", true);
    }).then(function () {
      $('go').disabled = false;
      $('password').value = '';
    });
  }
  $('form').addEventListener('submit', review);

  $('unmask').addEventListener('click', function () {
    var dd = $('account').querySelector('dd');
    var shown = this.dataset.shown === '1';
    dd.textContent = shown ? maskEmail(realEmail) : (realEmail || 'not set');
    this.dataset.shown = shown ? '0' : '1';
    this.textContent = shown ? "Mostrar e-mail" : "Ocultar e-mail";
  });

  $('signout').addEventListener('click', function () {
    if (!session) { return; }
    var btn = this;
    btn.disabled = true;
    var done = function () {
      session = null;
      forgetSession(backendId);
      savedSession = null;
      btn.textContent = 'Signed out. This session no longer works, here or upstream.';
    };
    if (session.kind === 'stremio') {
      stremioCall('/api/logout', { type: 'Logout', authKey: session.authKey })
        .catch(function () {}).then(done);
    } else {
      fetch(session.cfg.base + '/auth/v1/logout', {
        method: 'POST',
        headers: { 'apikey': session.cfg.key, 'Authorization': 'Bearer ' + session.cfg.token }
      }).catch(function () {}).then(done);
    }
  });

  // ---- resume ------------------------------------------------------------
  // A stored session belongs to one backend, so the card has to be re-evaluated
  // every time the picker changes. Showing the form unconditionally on a pill
  // click made switching to Nuvio and back look like the Stremio session had
  // been thrown away, when it was still in storage the whole time.
  var savedSession = null;

  function refreshResume() {
    savedSession = loadSession(backendId);
    if (!savedSession) { showSignInForm(true); return; }
    $('remember').checked = !!savedSession._persistent;
    $('resumetext').textContent = 'You are still signed in to ' +
      (savedSession.kind === 'stremio'
        ? 'Stremio'
        : (savedSession.cfg ? hostOf(savedSession.cfg.base) : 'your backend')) +
      (savedSession._persistent ? ' on this device.' : ' in this tab.');
    showSignInForm(false);
  }

  $('resumego').addEventListener('click', function () {
    if (!savedSession) { return; }
    session = savedSession.kind === 'stremio'
      ? { kind: 'stremio', authKey: savedSession.authKey }
      : { kind: 'nuvio', cfg: savedSession.cfg };
    review(null, true);
  });
  $('resumenew').addEventListener('click', function () {
    forgetSession(backendId);
    session = null;
    savedSession = null;
    showSignInForm(true);
    $('email').focus();
  });

  var lastId = null;
  try { lastId = window.sessionStorage.getItem(LAST_KEY); } catch (e) {}
  var boot = (lastId && BACKENDS[lastId] && loadSession(lastId)) ? lastId
           : (loadSession('stremio') ? 'stremio'
           : (loadSession('nuvio') ? 'nuvio'
           : (loadSession('custom') ? 'custom' : null)));
  if (boot) {
    backendId = boot;
    backend = BACKENDS[backendId] || BACKENDS.stremio;
    // The pills must follow, or a restored Nuvio session leaves Stremio lit.
    Array.prototype.forEach.call($('backends').children, function (b) {
      b.setAttribute('aria-selected', b.dataset.backend === backendId ? 'true' : 'false');
    });
    $('panel-url').hidden = backendId !== 'custom';
    $('targethost').textContent = backend.host || 'the backend you name';
  }
  refreshResume();

  // selectMode also writes the toggle's label, and it only ran on a backend
  // switch or a click, so on a fresh load the button rendered with no text at
  // all and looked absent until you switched away and back.
  selectMode(true);
  applyCreds();
  applyIntro();

  // The version links to its own release tag: auditing `main` proves nothing
  // about the build you are actually running.
  (function () {
    var vEl = $('version');
    if (VERSION.indexOf('__') === 0) { vEl.textContent = 'dev build \u00b7 '; return; }
    var a = document.createElement('a');
    a.href = 'https://github.com/AdrianoHG/replay/releases/tag/' + VERSION;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = VERSION;
    vEl.appendChild(a);
    vEl.appendChild(document.createTextNode(' \u00b7 '));
  })();
  $('tzline').textContent = 'Fuso horário: ' + LOC.timeZone + '. Formato: ' + LOC.locale + '.';
})();
