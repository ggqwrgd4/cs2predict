/* cs2predict — сторінка у стилі референсу: блоки 3:0 / 0:3 / 3:1–3:2, кругова шкала шансу 5+,
 * 11 колонок розподілу, профілі (твоя картка, картка друга…), рекомендація, «що як» для найближчих матчів,
 * AI-аналіз і думка експертів (web/insights.js), вкладка плей-оф. */
(function () {
  'use strict';

  var STAGES = ['stage1', 'stage2', 'stage3'];
  var PO = 'playoffs', INS_ORDER = ['stage1', 'stage2', 'stage3', 'playoffs'];
  var PO_DEFAULT = { name: 'Плей-оф', lockAt: '2026-12-10T11:00:00+02:00', deadline: '2026-12-10T10:00:00+02:00' };
  var LEAGUE_SIMS = 50000, PUBLIC_URL = 'https://ggqwrgd4.github.io/cs2predict/';
  var SIMS = 100000, QUICK_SIMS = 20000, PROFILE_SIMS = 20000, INS_SIMS = 30000, PO_SIMS = 40000;
  var REFRESH_MS = 60 * 1000, POLL_MS = 30 * 1000, REFETCH_MS = 5000;
  var SLOTS = { p30: 2, adv: 6, p03: 2 }, SLOT_KEYS = ['p30', 'adv', 'p03'];
  var SLOT_NAMES = { p30: '3:0', adv: '3:1 / 3:2', p03: '0:3' };
  var SLOT_LONG = { p30: 'піти 3:0', adv: 'вийти з 3:1 або 3:2', p03: 'піти 0:3' };
  var RISK = { safe: 'обережніша', medium: 'збалансована', risky: 'ризикованіша' };
  var PROFILE_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#6250d6', '#e87ba4', '#c98500', '#008300', '#e34948'];
  // Значки команд (поки без справжніх логотипів): колір і коротка назва.
  var TEAM_STYLE = {
    nip: ['#1b1b1b', 'NIP'], pvision: ['#6d28d9', 'PV'], heroic: ['#111827', 'HER'], faze: ['#e3242b', 'FaZe'],
    tl: ['#0b2a4a', 'TL'], ef: ['#e25d10', 'EF'], '100t': ['#e01e37', '100T'], '9z': ['#1f2937', '9z'],
    m80: ['#0f766e', 'M80'], dendele: ['#4f46e5', 'DND'], imp: ['#111111', 'IMP'], wildcard: ['#15803d', 'WC'],
    gosh: ['#f5c518', 'BC', 1], fq: ['#0f7b5f', 'FQ'], chinggis: ['#b91c1c', 'CW'], lvg: ['#1d4ed8', 'LVG'],
    fut: ['#e11d2e', 'FUT'], nemiga: ['#0284c7', 'NMG'], g2: ['#e8481c', 'G2'], '1w': ['#1e3a8a', '1W'],
    navi: ['#ffd500', 'NAVI', 1], astralis: ['#e5352b', 'AST'], mongolz: ['#121212', 'MGZ'], mibr: ['#0b1324', 'MIBR'],
    mouz: ['#e2001a', 'MOUZ'], vit: ['#ffd300', 'VIT', 1], furia: ['#141414', 'FUR'], aurora: ['#7c3aed', 'AUR'],
    spirit: ['#101010', 'SPR'], 'bb team': ['#f43f5e', 'BB'], falcons: ['#0e9f6e', 'FAL'], legacy: ['#f2c200', 'LGC', 1]
  };
  var ICON = {
    refresh: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M13.25 8a5.25 5.25 0 1 1-1.54-3.71M13.25 2.75v3h-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    check: '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    x: '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    xs: '<svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    shuffle: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 4.5h2.2c1.4 0 2.2.6 3 1.8l1.6 2.4c.8 1.2 1.6 1.8 3 1.8H14M2 11.5h2.2c.9 0 1.6-.3 2.2-.9M9.6 5.4c.6-.6 1.3-.9 2.2-.9H14M12.3 2.8 14 4.5l-1.7 1.7M12.3 9.8l1.7 1.7-1.7 1.7" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    reset: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2.75 8a5.25 5.25 0 1 0 1.54-3.71M2.75 2.75v3h3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    dots: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="3.5" cy="8" r="1.4" fill="currentColor"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/><circle cx="12.5" cy="8" r="1.4" fill="currentColor"/></svg>',
    users: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M6 7.2a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8zM1.8 13.6c.3-2.3 2-3.6 4.2-3.6s3.9 1.3 4.2 3.6M10.6 2.6a2.3 2.3 0 0 1 0 4.4M12 10.2c1.3.5 2 1.6 2.2 3.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    link: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M6.6 9.4a2.8 2.8 0 0 0 4 0l2.2-2.2a2.8 2.8 0 0 0-4-4l-.8.8M9.4 6.6a2.8 2.8 0 0 0-4 0L3.2 8.8a2.8 2.8 0 0 0 4 4l.8-.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    share: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 10V2.5M5.2 5.2 8 2.4l2.8 2.8M3.5 8.2v4.4c0 .5.4.9.9.9h7.2c.5 0 .9-.4.9-.9V8.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    trophy: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M5 2.5h6v3.2a3 3 0 0 1-6 0zM5 3.5H3v1.2A2.3 2.3 0 0 0 5.2 7M11 3.5h2v1.2A2.3 2.3 0 0 1 10.8 7M8 8.7v2.3M5.5 13.5h5M6.3 11h3.4l.3 2.5H6z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/></svg>',
    spark: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 3.5l1.6 4.9 4.9 1.6-4.9 1.6L12 16.5l-1.6-4.9L5.5 10l4.9-1.6zM18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" fill="currentColor"/></svg>'
  };

  var state = {
    cfg: null, live: null, meta: {}, stage: null,
    profiles: [{ id: 'me', name: 'Я' }], profile: 'me', profilesOk: false,
    cards: {}, savedAt: {}, dirty: {}, saving: {}, saveFailed: {}, editClosed: {},
    res: {}, lastGood: {}, resStale: {}, runReq: {}, runPhase: {}, running: {}, runError: {},
    opt: {}, optStale: {}, optReq: {}, optBusy: {}, profP5: {},
    showVariants: false, showAllRoot: false, version: null, liveSig: '', stageSig: {}, changedStages: {}, dataGen: 0, optGen: {},
    whatIf: {}, wiPairs: {},        // «що як»: {стадія: {раунд: {"a|b": переможець}}}; пари раундів, які рушій жеребкував сам
    insRaw: null, ins: {}, insStale: {}, insErr: {}, insReq: 0, fit: {}, flags: { ai: true, exp: true }, model: null,
    po: null, poReq: 0, poBusy: false, poStale: false, poErr: null, poAll: false,
    me: null, league: {}, leagueOpen: null, leagueReq: 0,
    runProf: {}, manyKeys: {}, optLock: {}, saveRetry: {}, profilesError: null, lastClosed: null
  };
  var $ = function (id) { return document.getElementById(id); };
  var teamIndex = {}, seq = 0;

  // ------------------------------------------------------------ утиліти ---
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtPct(p) {
    if (p == null || isNaN(p)) return '—';
    if (p <= 0) return '0%';
    if (p >= 1) return '100%';
    if (p < 0.001) return '<0.1%';
    if (p < 0.0995) return (p * 100).toFixed(1) + '%';
    if (p > 0.995) return '>99%';
    return Math.round(p * 100) + '%';
  }
  function fmtPct1(p) { return p == null ? '—' : p <= 0 ? '0%' : p < 0.001 ? '<0.1%' : (p * 100).toFixed(1) + '%'; }
  function fmtPP(x) { return (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(1) + ' п.п.'; }
  function plural(n, one, few, many) {
    var a = n % 10, b = n % 100;
    return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
  }
  function parseDate(s) { return s ? new Date(String(s).replace(/([+-]\d{2})(\d{2})$/, '$1:$2')) : new Date(NaN); }
  function isToday(d) { return new Date().toDateString() === d.toDateString(); }
  function fmtTime(d) { return d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }); }
  function fmtWhen(d) { return (isToday(d) ? '' : d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' }) + ', ') + fmtTime(d); }
  function fmtDay(d) { return d.toLocaleString('uk-UA', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  function fmtLeft(ms) {
    var m = Math.max(0, Math.round(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
    return d ? d + ' д ' + h + ' год' : h ? h + ' год ' + mm + ' хв' : mm + ' хв';
  }
  function fmtAgo(ms) {
    var m = Math.round(ms / 60000);
    return m < 1 ? 'щойно' : m < 60 ? m + ' хв тому' : m < 1440 ? Math.round(m / 60) + ' год тому' : Math.round(m / 1440) + ' д тому';
  }
  function initial(name) { var ch = Array.from(String(name || '?').trim())[0] || '?'; return ch.toUpperCase(); }
  function hashStr(t) { var h = 5381; for (var i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* працює й без localStorage */ } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* ок */ } }
  function lsJSON(k) { try { var v = lsGet(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function getJSON(url) {
    if (STATIC && url.indexOf('/api/') === 0) return staticApi(url, 'GET');
    return fetch(url, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  function postJSON(url, body) {
    if (STATIC && url.indexOf('/api/') === 0) return staticApi(url, 'POST', JSON.parse(JSON.stringify(body)));
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || j.error) throw new Error(j.error || 'HTTP ' + r.status); return j; }); });
  }

  // ------------------------------------------------- сайт без сервера (GitHub Pages) ---
  // Сторінка, зібрана scripts/build_site.py, працює без server.py: результати — з data/results.json
  // (його оновлює GitHub раз на 10 хв), AI й експерти — з data/insights.json, профілі й картки — у браузері.
  var STATIC = !!window.CS2P_STATIC;
  // Версія збірки (scripts/build_site.py): після оновлення сайту браузер не змішує старі й нові файли.
  var WORKER_URL = 'web/worker.js' + (window.CS2P_V ? '?v=' + encodeURIComponent(window.CS2P_V) : '');
  function staticApi(url, method, body) {
    var u = new URL(url, location.href), path = url.split('?')[0], q = u.searchParams;
    var store = lsJSON('cs2p-store') || { profiles: [{ id: 'me', name: 'Я' }], cards: {} };
    function save() { lsSet('cs2p-store', JSON.stringify(store)); }
    function fail(msg) { return Promise.reject(new Error(msg)); }
    if (path === '/api/results') return getJSON('data/results.json?t=' + Date.now());
    if (path === '/api/insights') return getJSON('data/insights.json?t=' + Date.now()).catch(function () { return {}; });
    if (path === '/api/version') return Promise.resolve({ version: 'static' });
    if (path === '/api/profiles') {
      if (method === 'GET') return Promise.resolve({ profiles: store.profiles });
      var name = typeof body.name === 'string' ? body.name.replace(/\s+/g, ' ').trim() : '';
      var p = store.profiles.filter(function (x) { return x.id === body.id; })[0];
      var taken = function (n, but) { return store.profiles.some(function (x) { return x.id !== but && x.name.toLowerCase() === n.toLowerCase(); }); };
      if (body.action === 'create' || body.action === 'rename') {
        if (!name || name.length > 24) return fail('ім\'я має бути від 1 до 24 символів');
        if (taken(name, body.action === 'rename' && p ? p.id : null)) return fail('профіль з таким ім\'ям уже є');
      }
      var uidTaken = function (u, but) { return store.profiles.some(function (x) { return x.id !== but && x.uid === u; }); };
      if (body.action === 'create') {
        if (store.profiles.length >= 12) return fail('профілів не може бути більше 12');
        if (body.uid != null && (!League.UID.test(body.uid) || uidTaken(body.uid))) return fail('цей друг уже є в змаганні');
        var id = 'p' + Math.random().toString(16).slice(2, 8), np = { id: id, name: name };
        if (body.uid != null) { np.uid = body.uid; if (typeof body.t === 'number') np.t = Math.round(body.t); }
        store.profiles.push(np); save();
        return Promise.resolve({ ok: true, profile: np, profiles: store.profiles });
      }
      if (!p) return fail('профіль не знайдено');
      if (body.action === 'link' && p.id !== 'me') {
        if (!League.UID.test(body.uid || '') || uidTaken(body.uid, p.id)) return fail('цей друг уже є в змаганні');
        p.uid = body.uid; if (typeof body.t === 'number') p.t = Math.round(body.t); save();
        return Promise.resolve({ ok: true, profiles: store.profiles });
      }
      if (body.action === 'rename') { p.name = name; save(); return Promise.resolve({ ok: true, profile: p, profiles: store.profiles }); }
      if (body.action === 'delete' && p.id !== 'me') {
        store.profiles = store.profiles.filter(function (x) { return x.id !== p.id; }); delete store.cards[p.id]; save();
        return Promise.resolve({ ok: true, profiles: store.profiles });
      }
      return fail('невідома дія');
    }
    if (path === '/api/card') {
      var st = q.get('stage'), pid = q.get('profile') || 'me';
      if (method === 'GET') return Promise.resolve(store.cards);
      (store.cards[pid] || (store.cards[pid] = {}))[st] = Object.assign({}, body, { savedAt: new Date().toISOString() });
      save();
      return Promise.resolve({ ok: true, savedAt: store.cards[pid][st].savedAt, version: 'static' });
    }
    return fail('HTTP 404');
  }

  function stageCfg(st) { return state.cfg.stages[st] || (st === PO ? PO_DEFAULT : null); }
  function teamName(id) { return (teamIndex[id] || {}).name || id; }
  function teamNote(id) { return (teamIndex[id] || {}).note || ''; }
  var LOGOS = {};   // справжні логотипи з web/logos/index.json (якщо є)
  function logoHTML(id, sizePx) {
    var lg = LOGOS[id];
    if (lg && lg.light) {
      var dark = lg.dark || lg.light;
      return '<span class="logo img"><picture><source media="(prefers-color-scheme: dark)" srcset="web/logos/' + encodeURIComponent(dark) + '">' +
        '<img src="web/logos/' + encodeURIComponent(lg.light) + '" alt="" loading="lazy" draggable="false"></picture></span>';
    }
    var s = TEAM_STYLE[id], tag = s ? s[1] : teamName(id).replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase();
    var color = s ? s[0] : '#64748b', k = tag.length <= 2 ? 0.38 : tag.length === 3 ? 0.31 : 0.25;
    return '<span class="logo' + (s && s[2] ? ' dark-text' : '') + '" style="background:' + color + ';font-size:' + Math.max(7, Math.round(sizePx * k)) + 'px">' + esc(tag) + '</span>';
  }
  function emptyCard() { return { p30: [], adv: [], p03: [] }; }
  function normCard(c) {
    var out = emptyCard(), seen = {};
    SLOT_KEYS.forEach(function (sl) {
      ((c && c[sl]) || []).forEach(function (id) {
        if (id && typeof id === 'string' && !seen[id] && out[sl].length < SLOTS[sl]) { seen[id] = 1; out[sl].push(id); }
      });
    });
    return out;
  }
  /** Картка плей-оф: 4 переможці чвертьфіналів, 2 фіналісти, чемпіон. */
  function poNorm(c) {
    var out = { qf: [], sf: [], champion: null };
    [['qf', 4], ['sf', 2]].forEach(function (k) {
      ((c && c[k[0]]) || []).forEach(function (id) {
        if (id && typeof id === 'string' && out[k[0]].indexOf(id) < 0 && out[k[0]].length < k[1]) out[k[0]].push(id);
      });
    });
    if (c && typeof c.champion === 'string' && c.champion) out.champion = c.champion;
    return out;
  }
  function poCard(pid) { pid = pid || state.profile; var p = state.cards[pid] || (state.cards[pid] = {}); return p[PO] || (p[PO] = poNorm(null)); }
  function poPicks(c) { return c.qf.length + c.sf.length + (c.champion ? 1 : 0); }
  function normFor(st, c) { return st === PO ? poNorm(c) : normCard(c); }
  function rawCard(st, pid) { return st === PO ? poNorm(poCard(pid)) : normCard(cardOf(st, pid)); }
  function picksIn(st, pid) { return st === PO ? poPicks(poCard(pid)) : nPicks(cardOf(st, pid)); }
  function pk(st, pid) { return (pid || state.profile) + ':' + st; }
  function cardOf(st, pid) {
    pid = pid || state.profile;
    var p = state.cards[pid] || (state.cards[pid] = {});
    return p[st] || (p[st] = emptyCard());
  }
  function setCard(st, card, pid) { pid = pid || state.profile; (state.cards[pid] || (state.cards[pid] = {}))[st] = normFor(st, card); }
  function cardKey(c) { return SLOT_KEYS.map(function (sl) { return c[sl].slice().sort().join(','); }).join('|'); }
  function nPicks(c) { return c.p30.length + c.adv.length + c.p03.length; }
  function complete(c) { return c.p30.length === 2 && c.adv.length === 6 && c.p03.length === 2; }
  function slotOf(c, id) {
    for (var i = 0; i < SLOT_KEYS.length; i++) if (c[SLOT_KEYS[i]].indexOf(id) >= 0) return SLOT_KEYS[i];
    return null;
  }
  function profileName(pid) { var p = state.profiles.filter(function (x) { return x.id === pid; })[0]; return p ? p.name : pid; }
  function profileColor(pid) {
    var i = Math.max(0, state.profiles.map(function (p) { return p.id; }).indexOf(pid));
    return PROFILE_COLORS[i % PROFILE_COLORS.length];
  }
  function times(st) {
    var c = stageCfg(st);
    return { deadline: c.deadline ? parseDate(c.deadline) : null, lockAt: c.lockAt ? parseDate(c.lockAt) : null };
  }
  function isClosed(st) { var t = times(st); return !!t.lockAt && Date.now() >= t.lockAt.getTime(); }
  /** Свою картку можна міняти завжди (для тестів і щоб звірити з грою). Картку друга з посилання після старту стадії — ні. */
  function canEdit(st) { return !(isClosed(st) && isLinked(state.profile)); }
  function isLinked(pid) { var p = state.profiles.filter(function (x) { return x.id === pid; })[0]; return !!(p && p.uid && pid !== 'me'); }

  // Картка для змагання з друзями: після старту стадії рахується та, що була до старту.
  // Зміни після старту — лише для себе. Друзі з посилання й так присилають картку зі свого сайту.
  var frozen = lsJSON('cs2p-frozen') || {};
  function saveFrozen() { lsSet('cs2p-frozen', JSON.stringify(frozen)); }
  function freezeCard(st, pid) { (frozen[pid] || (frozen[pid] = {}))[st] = rawCard(st, pid); saveFrozen(); }
  /** Поки стадія не почалась — запам'ятовуємо картку; після старту фіксуємо те, що є (один раз). */
  function syncFrozen() {
    var changed = false;
    state.profiles.forEach(function (p) {
      if (isLinked(p.id)) return;
      STAGES.concat([PO]).forEach(function (st) {
        var f = frozen[p.id] && frozen[p.id][st];
        if (!isClosed(st) || !f) { (frozen[p.id] || (frozen[p.id] = {}))[st] = rawCard(st, p.id); changed = true; }
      });
    });
    if (changed) saveFrozen();
  }
  function leagueCard(st, pid) {
    if (isLinked(pid) || !isClosed(st)) return rawCard(st, pid);
    var f = frozen[pid] && frozen[pid][st];
    return normFor(st, f || null);                 // профіль з'явився вже після старту — у змаганні картки немає
  }
  function leagueDiffers(st, pid) {
    var a = leagueCard(st, pid), b = rawCard(st, pid);
    return JSON.stringify(st === PO ? a : SLOT_KEYS.map(function (sl) { return a[sl].slice().sort(); })) !==
      JSON.stringify(st === PO ? b : SLOT_KEYS.map(function (sl) { return b[sl].slice().sort(); }));
  }
  function progress(st) {
    var s = state.live && state.live[st], ms = (s && s.matches) || [];
    return { done: ms.filter(function (m) { return m.finished; }).length, started: ms.some(function (m) { return m.a && m.b; }) };
  }
  function pickStatus(slot, w, l) {
    if (slot === 'p30') return l > 0 ? 'dead' : (w === 3 ? 'hit' : 'open');
    if (slot === 'p03') return w > 0 ? 'dead' : (l === 3 ? 'hit' : 'open');
    if (w === 3) return l === 0 ? 'dead' : 'hit';
    return l === 3 ? 'dead' : 'open';
  }
  function teamsById(r) { var o = {}; ((r && r.teams) || []).forEach(function (t) { o[t.id] = t; }); return o; }
  function statusOf(id, sl, r) {
    if (!r) return 'open';
    var t = teamsById(r)[id];
    if (t) return pickStatus(sl, t.w, t.l);
    var x = (r.picks || []).filter(function (q) { return q.id === id && q.slot === sl; })[0];
    if (x) return x.status;
    return r.fieldKnown || (r.teams && r.teams.length) ? 'dead' : 'open';   // не потрапляє в стадію в жодній симуляції
  }
  function stageTeams(st) {
    var r = state.res[st];
    if (r && r.teams) return r.teams;
    var out = [], seen = {};
    for (var k = STAGES.indexOf(st); k >= 0; k--) {
      var c = stageCfg(STAGES[k]);
      (c.teams || c.invited).slice().sort(function (a, b) { return a.seed - b.seed; }).forEach(function (t) {
        if (!seen[t.id]) { seen[t.id] = 1; out.push({ id: t.id, name: t.name, seed: k === STAGES.indexOf(st) ? t.seed : null }); }
      });
    }
    return out;
  }
  function defaultStage() {
    if (progress('stage3').done === 33) return PO;
    for (var i = 0; i < STAGES.length; i++) { var p = progress(STAGES[i]); if (p.done > 0 && p.done < 33) return STAGES[i]; }
    for (i = 0; i < STAGES.length; i++) if (!isClosed(STAGES[i])) return STAGES[i];
    return STAGES[STAGES.length - 1];
  }

  // ---------------------------------------------------------------- дані ---
  var knownNames = {}, manualIds = {};   // для AI-поправок: відомі команди і ті, де склад уже враховано вручну
  function loadConfig() {
    return getJSON('data/teams.json').then(function (j) {
      state.cfg = { stages: j.stages };
      state.model = null;
      teamIndex = {}; knownNames = {}; manualIds = {};
      STAGES.forEach(function (st) {
        var c = j.stages[st];
        (c.teams || c.invited || []).forEach(function (t) { teamIndex[t.id] = t; knownNames[t.id] = t.name; if (t.adj) manualIds[t.id] = 1; });
      });
    });
  }

  function loadProfiles() {
    return getJSON('/api/profiles').then(function (j) {
      if (j && j.profiles && j.profiles.length) { state.profiles = j.profiles; state.profilesOk = true; }
      state.profilesError = j && typeof j.error === 'string' ? j.error : null;
    }).catch(function () { state.profilesOk = false; }).then(function () {
      if (!state.profiles.some(function (p) { return p.id === state.profile; })) state.profile = 'me';
    });
  }

  /** Картки всіх профілів; якщо остання зміна не дійшла до диска — беремо резервну копію з браузера. */
  function loadCards() {
    return getJSON('/api/card?profile=all&stage=all').catch(function () { return null; }).then(function (all) {
      var byProfile = {};
      if (all && (all.stage1 || all.stage2 || all.stage3)) byProfile.me = all;   // старий сервер: лише «Я»
      else if (all) byProfile = all;
      state.profiles.forEach(function (p) {
        STAGES.concat([PO]).forEach(function (st) {
          var key = pk(st, p.id);
          if (state.dirty[key]) return;
          var raw = byProfile[p.id] && byProfile[p.id][st];
          var srv = raw && (st === PO ? Array.isArray(raw.qf) : raw.p30) ? raw : null;
          if (p.id === 'me' && st !== PO && lsGet('card-' + key) != null) lsDel('card-' + st);      // стара назва ключа
          var b = lsJSON('card-' + key) || (p.id === 'me' && st !== PO ? lsJSON('card-' + st) : null), local = null;
          if (b && b.card) local = b; else if (b && b.p30) local = { card: b, at: 0, pending: false };
          var srvAt = srv ? parseDate(srv.savedAt).getTime() : 0;
          if (local && local.pending && (!srv || (!isNaN(srvAt) && local.at > srvAt))) {
            setCard(st, local.card, p.id);
            state.savedAt[key] = srv ? srv.savedAt : null;
            state.dirty[key] = true;
            scheduleSave(st, p.id);
          } else {
            setCard(st, srv || (all ? null : local && local.card), p.id);
            state.savedAt[key] = srv ? srv.savedAt : null;
          }
        });
      });
    });
  }

  function loadResults(force, quiet) {
    if (!quiet) setSync('loading');
    return getJSON('/api/results?stage=all' + (force ? '&force=1' : '')).then(function (j) {
      state.live = j.stages || {};
      state.meta = { fetchedAt: j.fetchedAt || null, stale: !!j.stale, error: j.error || null, failed: false };
      var sigs = {};
      STAGES.concat([PO]).forEach(function (st) {
        var s = state.live[st] || {};
        sigs[st] = JSON.stringify([(s.matches || []).map(function (m) { return [m.round, m.a, m.b, m.finished ? m.winner : 0]; }),
          (s.seeds || []).map(function (x) { return x.id; })]);
        if (state.liveSig && sigs[st] !== state.stageSig[st]) state.changedStages[st] = true;
      });
      var sig = STAGES.concat([PO]).map(function (st) { return sigs[st]; }).join('#');
      var changed = sig !== state.liveSig;
      state.liveSig = sig; state.stageSig = sigs;
      setSync();
      if (j.refreshing) scheduleRefetch();
      return changed;
    }).catch(function (e) {
      state.meta.failed = true; state.meta.stale = true; state.meta.error = String(e && e.message || e);
      setSync();
      return false;
    });
  }
  var refetchTimer = null;
  function scheduleRefetch() {
    if (refetchTimer) return;
    refetchTimer = setTimeout(function () {
      refetchTimer = null;
      loadResults(false, true).then(function (ch) { if (ch) onDataChanged(); });
    }, REFETCH_MS);
  }

  function setSync(mode) {
    var dot = $('syncDot'), txt = $('syncText'), m = state.meta;
    $('refreshBtn').classList.toggle('spin', mode === 'loading');
    if (mode === 'loading') { dot.className = 'dot loading'; txt.textContent = 'Оновлюю…'; return; }
    var d = parseDate(m.fetchedAt);
    if (m.stale || m.failed) { dot.className = 'dot stale'; txt.textContent = isNaN(d) ? 'Немає даних' : 'Офлайн · дані на ' + fmtWhen(d); }
    else { dot.className = 'dot ok'; txt.textContent = isNaN(d) ? 'Оновлено' : 'Оновлено о ' + fmtTime(d); }
  }

  function liveMatches(st) {
    var s = (state.live && state.live[st]) || {};
    return (s.matches || []).filter(function (m) { return m.a && m.b && m.round; });
  }
  function pairKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }

  /**
   * Результати для рушія. withWhatIf — разом з припущеннями «що як»: у ще не зіграних матчах ставимо
   * припущеного переможця; якщо раунд ще не оголошено (пари жеребкував рушій), додаємо всі його пари,
   * щоб жеребкування лишилося тим самим.
   */
  function liveForWorker(withWhatIf) {
    var out = {};
    STAGES.forEach(function (st) {
      var s = (state.live && state.live[st]) || {};
      var ms = liveMatches(st).map(function (m) { return { round: m.round, a: m.a, b: m.b, winner: m.finished ? m.winner : null }; });
      var wi = withWhatIf ? state.whatIf[st] : null;
      if (wi) Object.keys(wi).forEach(function (rk) {
        var r = +rk, as = wi[rk], listed = ms.filter(function (m) { return m.round === r; });
        if (listed.length) listed.forEach(function (m) { var w = as[pairKey(m.a, m.b)]; if (!m.winner && (w === m.a || w === m.b)) m.winner = w; });
        else ((state.wiPairs[st] || {})[rk] || []).forEach(function (pr) { ms.push({ round: r, a: pr.a, b: pr.b, winner: as[pairKey(pr.a, pr.b)] || null }); });
      });
      out[st] = { matches: ms, seeds: s.seeds || [] };
    });
    return out;
  }

  // ------------------------------------------------------------- «що як» ---
  function wiCount() {
    var n = 0;
    STAGES.forEach(function (st) { var w = state.whatIf[st] || {}; Object.keys(w).forEach(function (r) { n += Object.keys(w[r]).length; }); });
    return n;
  }
  function wiActive() { return wiCount() > 0; }

  /** Скинути припущення всіх раундів після round у стадії st і в усіх пізніших стадіях: вони залежали від зміненого результату. */
  function dropWhatIfAfter(st, round) {
    var si = STAGES.indexOf(st);
    STAGES.forEach(function (s2, j) {
      if (j < si) return;
      [state.whatIf, state.wiPairs].forEach(function (map) {
        var m = map[s2];
        if (m) Object.keys(m).forEach(function (rk) { if (j > si || +rk > round) delete m[rk]; });
      });
    });
  }

  /** Після нових реальних результатів: лишаємо тільки припущення для тих самих, ще не зіграних пар. Повертає, скільки знято. */
  function pruneWhatIf(changed) {
    var removed = 0, dropLater = false;
    STAGES.forEach(function (st) {
      var wi = state.whatIf[st], real = dropLater || !!changed[st];
      if (wi) {
        var ms = liveMatches(st);
        Object.keys(wi).forEach(function (rk) {
          var r = +rk, as = wi[rk], listed = ms.filter(function (m) { return m.round === r; });
          if (listed.length) {
            var ok = {};
            listed.forEach(function (m) { if (!m.finished) ok[pairKey(m.a, m.b)] = 1; });
            Object.keys(as).forEach(function (k) { if (!ok[k]) { delete as[k]; removed++; } });
            if (state.wiPairs[st]) delete state.wiPairs[st][rk];
          } else if (real) {                       // раунд жеребкували ми, а реальні дані змінились — пари могли стати іншими
            removed += Object.keys(as).length;
            delete wi[rk];
            if (state.wiPairs[st]) delete state.wiPairs[st][rk];
          }
          if (wi[rk] && !Object.keys(wi[rk]).length) delete wi[rk];
        });
      }
      if (changed[st]) dropLater = true;
    });
    return removed;
  }

  function onScenarioChanged() {
    STAGES.forEach(function (st) { state.resStale[st] = true; });
    state.profP5 = {};
    if (state.stage !== PO) { requestRun(state.stage); scheduleProfileStats(); }
    render();
  }

  /** Клік по команді в найближчому матчі: припускаємо її перемогу (повторний клік знімає припущення). */
  function setWhatIf(st, round, a, b, winner) {
    var view = state.stage, r = state.res[view];
    if (!r || r.reqId !== state.runReq[view] || state.resStale[view]) return;      // рядки ще від попереднього сценарію
    var wi = state.whatIf[st] || (state.whatIf[st] = {}), as = wi[round] || (wi[round] = {}), k = pairKey(a, b);
    if (r.swingDerived && r.swingStage === st && r.swingRound === round) {
      (state.wiPairs[st] || (state.wiPairs[st] = {}))[round] = r.swing.map(function (x) { return { a: x.a, b: x.b }; });
    }
    if (as[k] === winner) delete as[k]; else as[k] = winner;
    if (!Object.keys(as).length) { delete wi[round]; if (state.wiPairs[st]) delete state.wiPairs[st][round]; }
    dropWhatIfAfter(st, round);
    onScenarioChanged();
  }

  function resetWhatIf() {
    if (!wiActive()) return;
    state.whatIf = {}; state.wiPairs = {};
    onScenarioChanged();
  }

  // ---------------------------------------------------------- розрахунки ---
  var runW = null, runJobs = 0, optW = null, optJobs = [], manyW = null, manyBusy = false;
  function newRunWorker() { if (runW) runW.terminate(); runW = new Worker(WORKER_URL); runW.onmessage = onRun; runJobs = 0; }
  function newOptWorker() { if (optW) optW.terminate(); optW = new Worker(WORKER_URL); optW.onmessage = onOpt; optJobs = []; }
  function newManyWorker() { if (manyW) manyW.terminate(); manyW = new Worker(WORKER_URL); manyW.onmessage = onMany; manyBusy = false; }

  var runTimers = {};
  function scheduleRun(st) { clearTimeout(runTimers[st]); runTimers[st] = setTimeout(function () { requestRun(st); }, 120); }

  function requestRun(st) {
    if (!state.live || !state.cfg) return;
    if (st === PO) { requestPlayoffs(); return; }
    if (st !== state.stage) { state.resStale[st] = true; return; }     // невидиму стадію порахуємо, коли її відкриють
    if (runJobs > 0) {
      newRunWorker();
      STAGES.forEach(function (s) { if (s !== st && state.running[s]) { state.running[s] = false; state.resStale[s] = true; } });
    }
    var gen = ++seq, c = cardOf(st), cc = complete(c) ? normCard(c) : null;
    state.runReq[st] = gen; state.running[st] = true; state.runPhase[st] = null; state.runProf[st] = state.profile;
    var base = { type: 'run', reqId: gen, stage: st, cfg: modelCfg(), live: liveForWorker(true), card: cc, tag: cc ? cardKey(cc) : '' };
    runJobs += 2;
    runW.postMessage(Object.assign({ meta: 'quick', opts: { sims: QUICK_SIMS } }, base));
    runW.postMessage(Object.assign({ meta: 'full', opts: { sims: SIMS } }, base));
  }

  function onRun(e) {
    var r = e.data;
    runJobs = Math.max(0, runJobs - 1);
    if (r.reqId !== state.runReq[r.stage]) return;
    if (r.meta === 'quick' && state.runPhase[r.stage] === 'full') return;
    state.runPhase[r.stage] = r.meta;
    if (r.meta === 'full' || r.error) state.running[r.stage] = false;
    if (r.error) state.runError[r.stage] = r.error;
    else {
      state.runError[r.stage] = null; state.res[r.stage] = r; state.resStale[r.stage] = false;
      if (r.tag && r.picks && r.picks.length === 10 && state.runProf[r.stage] === state.profile) state.lastGood[r.stage] = r;
    }
    if (r.stage === state.stage) render();
  }

  function requestOpt(st, mode) {
    if (!state.live || !state.cfg || st === PO) return;
    var key = st + ':' + mode, c = cardOf(st);
    if (mode === 'fill' && !nPicks(c)) return;
    if (optJobs.some(function (j) { return j.st !== st || j.key === key; })) {
      optJobs.forEach(function (j) { state.optBusy[j.key] = false; if (j.mode === 'best' && state.opt[j.st]) state.optStale[j.st] = true; });
      newOptWorker();
    }
    var id = ++seq;
    state.optReq[key] = id; state.optBusy[key] = true; state.optGen[key] = state.dataGen;
    state.optLock[key] = mode === 'fill' ? JSON.stringify(normCard(c)) : null;
    optJobs.push({ st: st, key: key, mode: mode, profile: state.profile });
    optW.postMessage({ type: 'optimize', reqId: id, stage: st, tag: mode, meta: state.profile, cfg: modelCfg(), live: liveForWorker(false),
      opts: { locks: mode === 'fill' ? normCard(c) : emptyCard(), userCard: complete(c) ? normCard(c) : null } });
    if (st === state.stage) keepFocus(function () { renderRec(); renderTools(); });
  }

  function onOpt(e) {
    var r = e.data, key = r.stage + ':' + r.tag;
    for (var i = 0; i < optJobs.length; i++) if (optJobs[i].key === key) { optJobs.splice(i, 1); break; }
    if (r.reqId !== state.optReq[key]) return;
    state.optBusy[key] = false;
    if (r.tag === 'fill') {
      var where = (r.meta !== state.profile ? ' профілю «' + profileName(r.meta) + '»' : '') + (r.stage !== state.stage ? ' ' + stageCfg(r.stage).name : '');
      if (r.error || !r.best) toast('Не вдалося доповнити картку' + where + (r.error ? ': ' + r.error : ''));
      else if (JSON.stringify(normCard(cardOf(r.stage, r.meta))) !== state.optLock[key]) toast('Картку' + where + ' змінено, поки я її доповнював. Натисни «Доповнити мою» ще раз.');
      else applyCard(r.stage, r.best.card, 'Картку' + where + ' доповнено · шанс 5+ ' + fmtPct(r.best.p5), r.meta);
    } else {
      // Якщо дані чи модель змінились, поки йшов підбір, результат уже застарів — рахуємо ще раз.
      state.opt[r.stage] = r; state.optStale[r.stage] = state.optGen[key] !== state.dataGen;
      if (state.optStale[r.stage] && r.stage === state.stage) ensureRec(r.stage);
    }
    if (r.stage === state.stage) render();
  }

  function ensureRec(st) {
    if (!state.cfg || !state.live || st === PO || isClosed(st)) return;
    if ((!state.opt[st] || state.optStale[st]) && !state.optBusy[st + ':best']) requestOpt(st, 'best');
  }

  var manyTimer = null;
  function scheduleProfileStats() { clearTimeout(manyTimer); manyTimer = setTimeout(requestProfileStats, 400); }
  function requestProfileStats() {
    if (!state.live || !state.cfg || state.profiles.length < 2) return;
    if (state.stage === PO) { keepFocus(renderProfiles); return; }
    var st = state.stage, cards = {}, n = 0;
    state.profiles.forEach(function (p) {
      if (p.id === state.profile) return;                    // для поточного профілю є точний розрахунок
      var c = cardOf(st, p.id);
      if (complete(c)) { cards[p.id] = normCard(c); n++; }
    });
    if (!n) { keepFocus(renderProfiles); return; }
    if (manyBusy) newManyWorker();
    manyBusy = true;
    var id = ++seq;
    state.manyReq = id; state.manyKeys = {};
    Object.keys(cards).forEach(function (pid) { state.manyKeys[pid] = cardKey(cards[pid]); });
    manyW.postMessage({ type: 'many', reqId: id, stage: st, cfg: modelCfg(), live: liveForWorker(true), cards: cards, opts: { sims: PROFILE_SIMS } });
  }
  function onMany(e) {
    var r = e.data;
    if (r.reqId !== state.manyReq) return;
    manyBusy = false;
    if (r.error) return;
    var bucket = state.profP5[r.stage] || (state.profP5[r.stage] = {});
    Object.keys(r.results).forEach(function (pid) { bucket[pid] = { p5: r.results[pid].p5, key: state.manyKeys[pid] }; });
    if (r.stage === state.stage) keepFocus(renderProfiles);
  }

  // --------------------------------------------------- змагання: розрахунок ---
  /** Картки всіх учасників на стадію (хто має хоч один пік). */
  function leagueCards(st) {
    var out = {};
    state.profiles.forEach(function (p) { var c = leagueCard(st, p.id); if (nPicks(c)) out[p.id] = c; });
    return out;
  }
  function leagueKey(st, cards) {
    modelCfg();
    return hashStr(st + '#' + (state.stageSig[st] || '') + '#' + (state.stageSig[STAGES[STAGES.indexOf(st) - 1]] || '') + '#' +
      state.model.key + '#' + JSON.stringify(cards));
  }
  var leagueW = null, leagueTimer = null, leagueBusy = false;
  function newLeagueWorker() { if (leagueW) leagueW.terminate(); leagueW = new Worker(WORKER_URL); leagueW.onmessage = onLeague; }
  function requestLeague() { clearTimeout(leagueTimer); leagueTimer = setTimeout(startLeague, 300); }
  function startLeague() {
    var st = state.stage;
    if (!state.cfg || !state.live || st === PO || state.profiles.length < 2) return false;
    var cards = leagueCards(st);
    if (Object.keys(cards).length < 2) return false;
    var key = leagueKey(st, cards), L = state.league[st];
    if (L && L.key === key) return false;
    if (leagueBusy) newLeagueWorker();
    leagueBusy = true;
    var id = ++seq;
    state.leagueReq = id;
    leagueW.postMessage({ type: 'league', reqId: id, stage: st, cfg: modelCfg(), live: liveForWorker(false), cards: cards, tag: key, opts: { sims: LEAGUE_SIMS } });
    keepFocus(renderFriends);
    return true;
  }
  function onLeague(e) {
    var r = e.data;
    leagueBusy = false;
    if (r.reqId !== state.leagueReq) return;
    state.league[r.stage] = r.error ? { err: r.error, key: r.tag } : { res: r, key: r.tag };
    if (r.stage === state.stage) keepFocus(renderFriends);
  }


  function onDataChanged() {
    var changed = state.changedStages;
    state.changedStages = {}; state.dataGen++;
    if (wiActive()) {
      var gone = pruneWhatIf(changed);
      if (gone) toast('З\'явились нові результати — ' + gone + ' ' + plural(gone, 'припущення', 'припущення', 'припущень') + ' «що як» знято.');
    }
    STAGES.forEach(function (st) { state.resStale[st] = true; if (state.opt[st]) state.optStale[st] = true; if (state.ins[st]) state.insStale[st] = true; });
    state.profP5 = {}; state.poStale = true; requestLeague();
    if (state.stage === PO) requestPlayoffs();
    else { requestRun(state.stage); ensureRec(state.stage); scheduleProfileStats(); requestInsights(state.stage, true); }
    render();
  }

  // ---------------------------------------------------- картка і збереження ---
  var saveTimers = {};
  function scheduleSave(st, pid) {
    pid = pid || state.profile;
    var key = pk(st, pid);
    lsSet('card-' + key, JSON.stringify({ card: rawCard(st, pid), at: Date.now(), pending: true }));
    clearTimeout(saveTimers[key]);
    saveTimers[key] = setTimeout(function () { saveNow(st, pid); }, 350);
  }

  function saveNow(st, pid) {
    var key = pk(st, pid), card = rawCard(st, pid), body = JSON.stringify(card);
    state.saving[key] = true; state.saveFailed[key] = false; renderSaveState();
    var url = '/api/card?stage=' + st + (state.profilesOk ? '&profile=' + encodeURIComponent(pid) : '');
    if (!state.profilesOk && pid !== 'me') { state.saving[key] = false; state.saveFailed[key] = true; renderSaveState(); return; }
    postJSON(url, card)
      .then(function (j) {
        state.savedAt[key] = j.savedAt || new Date().toISOString();
        if (j.version) state.version = j.version;
        state.saveRetry[key] = 0;
        if (JSON.stringify(rawCard(st, pid)) === body) {
          state.dirty[key] = false;
          lsSet('card-' + key, JSON.stringify({ card: card, at: Date.now(), pending: false }));
        }
      })
      .catch(function () { state.saveFailed[key] = true; scheduleRetry(st, pid); })
      .then(function () { state.saving[key] = false; renderSaveState(); });
  }
  function scheduleRetry(st, pid) {
    var key = pk(st, pid), n = state.saveRetry[key] = (state.saveRetry[key] || 0) + 1;
    clearTimeout(saveTimers[key]);
    saveTimers[key] = setTimeout(function () { if (state.dirty[key] && !state.saving[key]) saveNow(st, pid); }, [5000, 15000, 30000][n - 1] || 60000);
  }
  /** Сервер знову відповідає — одразу пробуємо зберегти те, що не вдалося. */
  function retryFailedSaves() {
    Object.keys(state.saveFailed).forEach(function (key) {
      if (!state.saveFailed[key] || !state.dirty[key] || state.saving[key]) return;
      var i = key.lastIndexOf(':');
      saveNow(key.slice(i + 1), key.slice(0, i));
    });
  }

  function cardChanged(st, pid) {
    pid = pid || state.profile;
    setCard(st, st === PO ? poCard(pid) : cardOf(st, pid), pid);
    state.dirty[pk(st, pid)] = true;
    scheduleSave(st, pid);
    if (!isClosed(st) && !isLinked(pid)) freezeCard(st, pid);
    if (st !== PO) requestLeague();
    if (st === PO) { if (pid === state.profile) schedulePlayoffs(); render(); return; }
    if (pid === state.profile && complete(cardOf(st))) { scheduleRun(st); scheduleInsights(st); }
    if (pid !== state.profile) scheduleProfileStats();
    render();
  }

  function toastFull(sl, id) {
    toast('У «' + SLOT_NAMES[sl] + '» уже ' + SLOTS[sl] + ' ' + plural(SLOTS[sl], 'команда', 'команди', 'команд') + '. Зніми одну, щоб поставити ' + teamName(id) + '.');
  }
  function toastClosed() {
    toast('Картку ' + stageCfg(state.stage).name + ' закрито — стадія вже почалась, піки змінити не можна.');
  }

  /** Поставити команду в слот (idx — конкретне місце; якщо там хтось є — обмін або заміна). */
  function placeAt(id, sl, idx) {
    var st = state.stage, c = cardOf(st);
    if (!canEdit(st)) { toastClosed(); return; }
    var from = slotOf(c, id), fromIdx = from ? c[from].indexOf(id) : -1, arr = c[sl];
    if (idx != null && idx < arr.length) {
      var other = arr[idx];
      if (other === id) return;
      if (from) { c[from][fromIdx] = other; arr[idx] = id; }      // обмін місцями
      else arr[idx] = id;                                        // заміна: попередня команда повертається в ряд
    } else {
      if (from === sl) return;
      if (arr.length >= SLOTS[sl]) { toastFull(sl, id); return; }
      if (from) c[from].splice(fromIdx, 1);
      arr.push(id);
    }
    cardChanged(st);
  }

  function removePick(id, undo) {
    var st = state.stage, c = cardOf(st), sl = slotOf(c, id);
    if (!sl) return;
    if (!canEdit(st)) { toastClosed(); return; }
    var prev = normCard(c), pid = state.profile;
    c[sl].splice(c[sl].indexOf(id), 1);
    cardChanged(st);
    if (undo) toast(teamName(id) + ' прибрано з картки', { action: 'Повернути', onAction: function () { setCard(st, prev, pid); cardChanged(st, pid); } });
  }

  function applyCard(st, card, msg, pid) {
    pid = pid || state.profile;
    if (!canEdit(st)) { toastClosed(); return; }       // закриту картку змінюємо тільки після «Виправити картку»
    var prev = rawCard(st, pid);
    setCard(st, card, pid);
    cardChanged(st, pid);
    toast(msg, { action: 'Повернути', onAction: function () { setCard(st, prev, pid); cardChanged(st, pid); } });
  }

  function applyVariant(which) {
    var st = state.stage, o = state.opt[st];
    if (!o) return;
    var m = which.indexOf('alt') === 0 ? (o.alternatives || [])[+which.slice(3)] : o[which];
    if (m) applyCard(st, m.card, 'Картку застосовано · шанс 5+ ' + fmtPct(m.p5));
  }

  function randomCard() {
    var st = state.stage;
    if (!canEdit(st)) { toastClosed(); return; }
    var teams = stageTeams(st).filter(function (t) { return t.pIn == null || t.pIn > 0; })
      .sort(function (a, b) { return (b.pIn || 1) - (a.pIn || 1); }).slice(0, 16).map(function (t) { return t.id; });
    for (var i = teams.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = teams[i]; teams[i] = teams[j]; teams[j] = t; }
    applyCard(st, { p30: teams.slice(0, 2), adv: teams.slice(2, 8), p03: teams.slice(8, 10) }, 'Випадкова картка');
  }

  function resetCard() {
    var st = state.stage;
    if (!canEdit(st)) { toastClosed(); return; }
    if (!picksIn(st)) return;
    applyCard(st, st === PO ? null : emptyCard(), 'Картку очищено');
  }

  function userP5(st) {
    var c = cardOf(st);
    if (!complete(c)) return null;
    var k = cardKey(c), r = state.res[st], o = state.opt[st];
    if (o && o.user && cardKey(normCard(o.user.card)) === k) return o.user.p5;
    if (r && r.tag === k && !wiActive()) return r.p5;
    return null;
  }

  // ---------------------------------------------------------------- рендер ---
  var FOCUS_ATTRS = ['data-tab', 'data-act', 'data-which', 'data-prof', 'data-slot', 'data-i', 'data-cell', 'data-wi', 'data-wa', 'data-wb', 'data-wr', 'data-po', 'data-flag', 'data-team', 'data-id'];
  function focusSelectors(el) {
    if (!el || el === document.body || !el.getAttribute) return [];
    var full = el.tagName.toLowerCase() + (el.classList.contains('tcard') ? '.tcard' : el.classList.contains('pchip') ? '.pchip' : ''), loose = full;
    FOCUS_ATTRS.forEach(function (a) {
      var v = el.getAttribute(a);
      if (v == null) return;
      var part = '[' + a + '="' + String(v).replace(/["\\]/g, '\\$&') + '"]';
      full += part;
      if (a !== 'data-team' && a !== 'data-id') loose += part;
    });
    return full === loose ? [full] : [full, loose];
  }
  /** Перемальовує частину сторінки і повертає фокус на той самий елемент (для клавіатури та скрінрідера). */
  function keepFocus(fn) {
    var sels = focusSelectors(document.activeElement);
    fn();
    var a = document.activeElement;
    if (!sels.length || (a && a !== document.body && document.body.contains(a))) return;
    for (var i = 0; i < sels.length; i++) {
      var n = null;
      try { n = document.querySelector(sels[i]); } catch (e) { n = null; }
      if (n && !n.disabled && n.offsetParent !== null) { n.focus({ preventScroll: true }); return; }
    }
  }
  function render() { keepFocus(renderAll); }
  function renderAll() {
    if (!state.stage || !state.cfg) return;
    var po = state.stage === PO;
    $('swissView').hidden = po; $('poView').hidden = !po;
    renderTabs(); renderHead(); renderProfiles(); renderTools();
    if (po) { renderPlayoffs(); renderSaveState(); renderFriends(); return; }
    renderPool(); renderBoard(); renderGauge(); renderDist();
    renderSaveState(); renderRec(); renderNext(); /* renderSim(); — симулятор стадії поки в архіві */ renderInsights(); renderTeamsTable(); renderMatches(); renderFriends();
  }

  var lastTabs = '';
  function renderTabs() {
    var html = STAGES.map(function (st) {
      var p = progress(st), live = p.done > 0 && p.done < 33, open = !isClosed(st);
      var tip = live ? 'Йде зараз: зіграно ' + p.done + ' з 33 матчів' : open ? 'Картку ще можна подати' : p.done === 33 ? 'Стадію завершено' : 'Картку закрито';
      return '<button role="tab" aria-selected="' + (st === state.stage) + '" data-tab="' + st + '" data-tip="' + esc(tip) + '">' +
        (live ? '<span class="d live" aria-hidden="true"></span>' : open ? '<span class="d open" aria-hidden="true"></span>' : '') +
        esc(stageCfg(st).name) + '</button>';
    }).join('');
    var known = progress('stage3').done === 33 || !!(state.po && state.po.bracketKnown), poOpen = known && !isClosed(PO), pp = poProgress();
    var poLive = pp.done > 0 && pp.done < 7 || pp.live;
    html += '<button role="tab" aria-selected="' + (state.stage === PO) + '" data-tab="' + PO + '" data-tip="' +
      esc(poLive ? 'Йде плей-оф: зіграно ' + pp.done + ' з 7' : pp.done === 7 ? 'Плей-оф завершено' : known ? (poOpen ? 'Сітка відома — картку ще можна подати' : 'Картку плей-оф закрито')
        : 'Прогноз сітки і шанси команд; справжня сітка — після Stage 3') + '">' +
      (poLive ? '<span class="d live" aria-hidden="true"></span>' : poOpen ? '<span class="d open" aria-hidden="true"></span>' : '') + esc(stageCfg(PO).name) + '</button>';
    if (html === lastTabs) return;                 // без змін — не чіпаємо (і не збиваємо фокус)
    lastTabs = html;
    $('tabs').innerHTML = html;
  }

  function renderBanner() {
    var el = $('wiBanner'), n = wiCount();
    if (!n || state.stage === PO) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = '<span class="wb-i" aria-hidden="true">?</span><span><b>Режим «що як».</b> Шанси на сторінці пораховано з ' + n + ' ' +
      plural(n, 'твоїм припущенням', 'твоїми припущеннями', 'твоїми припущеннями') + ', а не лише з реальних результатів. ' +
      'Рекомендація, AI та експерти рахуються за реальними даними.</span><button class="btn sm" data-act="wi-reset">Скинути</button>';
  }

  function renderHead() {
    var st = state.stage;
    if (st === PO) { renderHeadPO(); return; }
    var c = stageCfg(st), t = times(st), now = Date.now(), p = progress(st), r = state.res[st];
    $('stageTitle').textContent = c.name;
    var pill = $('stagePill'), cls = 'pill', txt;
    if (!isClosed(st)) {
      if (t.deadline && now < t.deadline.getTime()) {
        txt = 'Подати до ' + fmtDay(t.deadline) + ' · ще ' + fmtLeft(t.deadline.getTime() - now);
        cls += t.deadline.getTime() - now < 6 * 3600e3 ? ' warn' : ' open';
      } else { txt = 'Дедлайн минув · lock ≈' + fmtTime(t.lockAt); cls += ' warn'; }
    } else if (p.done === 33) txt = 'Завершено';
    else if (p.done > 0) { txt = 'Наживо · зіграно ' + p.done + ' з 33'; cls += ' live'; }
    else txt = 'Картку закрито';
    pill.className = cls; pill.hidden = false;
    pill.innerHTML = '<span class="pd" aria-hidden="true"></span>' + esc(txt);

    var prevName = st === 'stage1' ? '' : stageCfg(STAGES[STAGES.indexOf(st) - 1]).name, sub;
    if (st === 'stage1') sub = '16 команд · Swiss · Bo1, а матчі на вихід і виліт — Bo3';
    else sub = '8 запрошених + 8 найкращих зі ' + prevName + (r && !r.fieldKnown ? ' — склад ще формується' : '') +
      (st === 'stage3' ? ' · усі матчі Bo3' : ' · Bo1, вирішальні матчі — Bo3');
    if (!isClosed(st)) sub += '. Перед подачею перевір, що Viewer Pass активний.';
    $('stageSub').textContent = sub;

    var alerts = [], lv = (state.live && state.live[st]) || {};
    if (state.profilesError) alerts.push(['critical', 'Профілі: ' + state.profilesError]);
    if (!state.live && state.meta.failed) alerts.push(['critical', STATIC ? 'Не вдалося завантажити результати матчів. Онови сторінку трохи згодом.' : 'Немає даних про матчі: сервер не відповідає. Перевір, що вікно start.command відкрите, і онови сторінку.']);
    else if (state.meta.stale) {
      var fd = parseDate(state.meta.fetchedAt);
      alerts.push(['', 'Немає зв\'язку з Liquipedia' + (isNaN(fd) ? '' : ' — показуємо дані на ' + fmtWhen(fd) + ' (' + fmtAgo(Date.now() - fd.getTime()) + ')') + '. Сайт сам спробує ще раз.']);
    }
    if (lv.error) alerts.push(['', 'Liquipedia: ' + lv.error]);
    (lv.manualErrors || []).forEach(function (m) { alerts.push(['', 'Ручне виправлення не застосовано: ' + m]); });
    if (r && r.derived && r.derived.live && r.derived.match === false) {
      alerts.push(['critical', 'Наші сіди ' + c.name + ' не збігаються з опублікованими на Liquipedia. Наш розрахунок: ' + r.derived.ids.map(teamName).join(', ') + '.']);
    }
    ((r && r.warnings) || []).forEach(function (w) { alerts.push(['', w]); });
    if (state.runError[st]) alerts.push(['critical', 'Помилка розрахунку: ' + state.runError[st]]);
    $('alerts').innerHTML = alertsHTML(alerts);
    renderBanner();
  }
  function alertsHTML(alerts) {
    return alerts.map(function (a) {
      return '<div class="alert ' + a[0] + '" role="status"><span class="ai" aria-hidden="true">!</span><span>' + esc(a[1]) + '</span></div>';
    }).join('');
  }

  function profileChance(pid) {
    var st = state.stage;
    if (st === PO) return poPicks(poCard(pid)) + '/7';
    var c = cardOf(st, pid);
    if (!complete(c)) return nPicks(c) + '/10';
    if (pid === state.profile) {
      var r = state.res[st];
      if (r && r.tag === cardKey(c)) return fmtPct(r.p5);
    }
    var b = state.profP5[st] && state.profP5[st][pid];
    return b && b.key === cardKey(c) ? fmtPct(b.p5) : '…';
  }

  function renderProfiles() {
    var html = state.profiles.map(function (p) {
      var on = p.id === state.profile;
      var btn = '<button class="prof' + (on ? ' on' : '') + '" data-prof="' + esc(p.id) + '" aria-pressed="' + on + '" data-tip="' +
        esc('Профіль «' + p.name + '» · ' + (state.stage === PO ? 'піків у картці плей-оф' : 'шанс 5+ у ' + stageCfg(state.stage).name)) + '">' +
        '<span class="av" style="background:' + profileColor(p.id) + '">' + esc(initial(p.name)) + '</span>' +
        esc(p.name) + '<span class="pp">' + esc(profileChance(p.id)) + '</span></button>';
      return on ? '<span class="profw">' + btn + '<button class="more" data-act="profile-menu" aria-label="' + esc('Дії з профілем «' + p.name + '»') +
        '" data-tip="Перейменувати, скопіювати картку, видалити">' + ICON.dots + '</button></span>' : btn;
    }).join('');
    html += '<button class="prof add" data-act="add-profile" data-tip="Додати профіль — наприклад, картку друга">+ Профіль</button>';
    $('profiles').innerHTML = html;
  }

  function renderTools() {
    var st = state.stage, closed = isClosed(st), edit = canEdit(st), html = '', n = picksIn(st);
    html += '<button class="tbtn" data-act="friends" data-tip="Змагання з друзями: хто вгадає більше">' + ICON.users + 'Змагання</button>';
    if (n) html += '<button class="tbtn" data-act="share" data-tip="Картинка або текст картки — щоб надіслати друзям">' + ICON.share + 'Поділитися</button>';
    if (n) html += '<button class="tbtn primary" data-act="save" data-tip="Зберегти картку (вона й так зберігається сама)">Зберегти</button>';
    if (edit && !closed && st !== PO) html += '<button class="tbtn" data-act="random" data-tip="Випадкова картка з команд цієї стадії">' + ICON.shuffle + 'Випадкова</button>';
    if (edit && (st !== PO || n)) html += '<button class="tbtn" data-act="reset" data-tip="' + (st === PO ? 'Прибрати всі піки плей-оф' : 'Очистити картку') + '">' + ICON.reset + 'Скинути</button>';
    $('tools').innerHTML = html;
  }

  function renderPool() {
    var st = state.stage, c = cardOf(st), edit = canEdit(st), el = $('pool');
    var teams = stageTeams(st).filter(function (t) { return t.pIn == null || t.pIn > 0.001; });
    el.classList.toggle('ro', !edit);
    el.innerHTML = teams.map(function (t) {
      var used = !!slotOf(c, t.id);
      var tip = t.name + (t.p30 != null ? ' · 3:0 ' + fmtPct(t.p30) + ' · 3:1/3:2 ' + fmtPct(t.adv) + ' · 0:3 ' + fmtPct(t.p03) : '') +
        (t.pIn != null && t.pIn < 0.999 ? ' · у стадії ' + fmtPct(t.pIn) : '') + (used ? ' · уже в картці' : '');
      return '<button class="pchip' + (used ? ' used' : '') + '" data-team="' + esc(t.id) + '"' + (edit ? ' draggable="true"' : '') +
        ' data-tip="' + esc(tip) + '" aria-label="' + esc(tip) + '">' + logoHTML(t.id, 44) + '</button>';
    }).join('');
  }

  function slotCardHTML(sl, i, id, edit, r) {
    if (!id) {
      return '<button class="tcard empty' + (edit ? '' : ' ro') + '" data-slot="' + sl + '" data-i="' + i + '" aria-label="Порожнє місце в ' + SLOT_NAMES[sl] + '">' +
        '<span class="plus" aria-hidden="true">+</span><span class="tn">' + (edit ? 'Обери' : 'Порожньо') + '</span></button>';
    }
    var t = teamsById(r)[id], s = statusOf(id, sl, r), prob = t ? t[sl] : null;
    var badge = s === 'hit' ? '<span class="st hit">' + ICON.check + 'зайшов</span>' : s === 'dead' ? '<span class="st dead">' + ICON.x + 'згорів</span>' : '';
    var tip = teamName(id) + (prob != null ? ': шанс ' + SLOT_LONG[sl] + ' — ' + fmtPct1(prob) : '') + (s === 'hit' ? ' · пік зайшов' : s === 'dead' ? ' · пік згорів' : '') +
      (edit ? ' · натисни, щоб замінити' : '');
    return '<div class="tcard ' + s + (edit ? '' : ' ro') + '" role="button" tabindex="0" data-slot="' + sl + '" data-i="' + i + '" data-team="' + esc(id) + '"' +
      (edit ? ' draggable="true"' : '') + ' data-tip="' + esc(tip) + '" aria-label="' + esc(tip) + '">' +
      (edit ? '<button class="x" data-act="remove" data-id="' + esc(id) + '" aria-label="Прибрати ' + esc(teamName(id)) + '">' + ICON.xs + '</button>' : '') + badge +
      '<span class="lg">' + logoHTML(id, 74) + '</span><span class="tn">' + esc(teamName(id)) + '</span>' +
      (s === 'open' && prob != null ? '<span class="tp">' + fmtPct(prob) + '</span>' : '') + '</div>';
  }

  function renderBoard() {
    var st = state.stage, c = cardOf(st), edit = canEdit(st), r = state.res[st];
    function slotsHTML(sl, from, to) {
      var out = '';
      for (var i = from; i < to; i++) out += slotCardHTML(sl, i, c[sl][i], edit, r);
      return out;
    }
    $('slots-p30').innerHTML = slotsHTML('p30', 0, 2);
    $('slots-p03').innerHTML = slotsHTML('p03', 0, 2);
    $('slots-adv-l').innerHTML = slotsHTML('adv', 0, 3);
    $('slots-adv-r').innerHTML = slotsHTML('adv', 3, 6);
  }

  function gaugeSVG(p) {
    var R = 62, C = 2 * Math.PI * R, arc = C * 0.75, val = Math.max(0, Math.min(1, p || 0)) * arc;
    return '<svg class="ring" viewBox="0 0 156 156" aria-hidden="true">' +
      '<circle class="g-track" cx="78" cy="78" r="' + R + '" fill="none" stroke-width="14" stroke-linecap="round" stroke-dasharray="' + arc.toFixed(1) + ' ' + C.toFixed(1) + '" transform="rotate(135 78 78)"/>' +
      (val > 0 ? '<circle class="g-val" cx="78" cy="78" r="' + R + '" fill="none" stroke-width="14" stroke-linecap="round" stroke-dasharray="' + Math.max(0.1, val).toFixed(1) + ' ' + C.toFixed(1) + '" transform="rotate(135 78 78)"/>' : '') +
      '<circle class="g-core" cx="78" cy="78" r="40"/>' +
      '<g class="g-icon" transform="translate(64 64) scale(1.17)"><path d="M12 3.5l1.6 4.9 4.9 1.6-4.9 1.6L12 16.5l-1.6-4.9L5.5 10l4.9-1.6zM18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" fill="currentColor"/></g></svg>';
  }

  function renderGauge() {
    var st = state.stage, c = cardOf(st), r = state.res[st], el = $('gauge');
    if (!complete(c)) {
      var n = nPicks(c);
      el.className = 'gauge';
      el.innerHTML = gaugeSVG(0) + '<div class="g-num">' + n + '/10</div><div class="g-lab">' + (n ? 'обери ще ' + (10 - n) : 'обери 10 команд') + '</div>';
      return;
    }
    var fresh = r && r.tag === cardKey(c) && r.picks && r.picks.length === 10, R = fresh ? r : state.lastGood[st];
    el.className = 'gauge' + (fresh ? '' : ' is-stale');
    if (!R) { el.innerHTML = gaugeSVG(0) + '<div class="g-num">…</div><div class="g-lab">рахую</div>'; return; }
    var html = gaugeSVG(R.p5) + '<div class="g-num" data-tip="' + esc(fmtPct1(R.p5) + ' ± ' + (1.96 * R.p5se * 100).toFixed(1) + ' п.п. — шум ' +
      R.sims.toLocaleString('uk-UA') + ' симуляцій; сама модель помиляється більше. У середньому зайде ' + R.eK.toFixed(1) + ' з 10.') + '">' +
      (R.p5 > 0 && R.p5 < 0.001 ? '<0.1%' : (R.p5 * 100).toFixed(1) + '%') + '</div><div class="g-lab">шанс 5+' + (wiActive() ? ' · що як' : '') + '</div>';
    if (progress(st).started) {
      var cnt = { hit: 0, dead: 0, open: 0 };
      SLOT_KEYS.forEach(function (sl) { c[sl].forEach(function (id) { cnt[statusOf(id, sl, r)]++; }); });
      html += '<div class="g-live"><span class="good" data-tip="Уже зайшло">' + ICON.check + '<i class="sr">зайшло </i>' + cnt.hit + '</span><span class="bad" data-tip="Уже згоріло">' + ICON.x + '<i class="sr">згоріло </i>' + cnt.dead +
        '</span><span data-tip="Ще в грі">у грі ' + cnt.open + '</span></div>';
    }
    el.innerHTML = html;
  }

  function renderDist() {
    var st = state.stage, c = cardOf(st), r = state.res[st], el = $('dcols');
    var fresh = r && complete(c) && r.tag === cardKey(c) && r.hist && r.hist.length === 11, R = fresh ? r : complete(c) ? state.lastGood[st] : null;
    if (!R) {
      el.className = 'dcols';
      el.innerHTML = '<div class="dempty">' + (complete(c) ? 'Рахую…' : 'Розподіл з\'явиться, коли в картці буде 10 команд') + '</div>';
      return;
    }
    el.className = 'dcols' + (fresh ? '' : ' is-stale');
    var cnt = { hit: 0, dead: 0, open: 0 };
    SLOT_KEYS.forEach(function (sl) { c[sl].forEach(function (id) { cnt[statusOf(id, sl, R)]++; }); });
    var lo = cnt.hit, hi = cnt.hit + cnt.open;
    function dv(v, k) { return v > 0 ? fmtPct1(v) : k >= lo && k <= hi ? '<0.1%' : '0%'; }   // 0 у симуляціях ≠ неможливо
    var max = Math.max.apply(null, R.hist.concat([1e-9])), html = '';
    for (var k = 10; k >= 0; k--) {
      var v = R.hist[k], h = v > 0 ? Math.max(2, Math.round(v / max * 46)) : k >= lo && k <= hi ? 2 : 0;
      html += '<div class="dc ' + (k >= 5 ? 'good' : 'bad') + '" data-tip="' + esc('Вгадати рівно ' + k + ' з 10: ' + dv(v, k) + (v === 0 && k >= lo && k <= hi ? ' (можливо, але рідко)' : '')) + '">' +
        '<div class="dbox"><div class="dv">' + dv(v, k) + '</div><div class="dbar" style="height:' + h + 'px"></div></div>' +
        '<div class="dk">' + k + '/10</div></div>';
    }
    el.innerHTML = html + '<table class="sr"><caption>Скільки піків вгадаєш</caption>' +
      R.hist.map(function (v, k) { return '<tr><td>' + k + ' з 10</td><td>' + dv(v, k) + '</td></tr>'; }).join('') + '</table>';
  }

  function saveText(st, pid) {
    var key = pk(st, pid);
    if (state.saving[key]) return '<span class="spinner" style="width:12px;height:12px;border-width:2px"></span>Зберігаю…';
    if (state.saveFailed[key]) return !state.profilesOk && pid !== 'me'
      ? 'Профілі ще не підтримуються сервером — перезапусти start.command' : 'Не вдалося зберегти на диск — копія лишилась у браузері, спробуємо ще раз';
    var d = parseDate(state.savedAt[key]);
    return isNaN(d) ? '' : '<span class="ok">' + ICON.check + '</span>Збережено о ' + fmtWhen(d) + (state.profiles.length > 1 ? ' · профіль «' + esc(profileName(pid)) + '»' : '');
  }
  function renderSaveState() {
    if (!state.stage) return;
    var t = saveText(state.stage, state.profile), po = $('poSave');
    $('saveState').innerHTML = t;
    if (po) po.innerHTML = t;
  }

  function chipsHTML(card, diffAgainst, statusFn) {
    return '<div class="groups">' + SLOT_KEYS.map(function (sl) {
      if (!card[sl].length) return '';
      return '<div class="grp"><span class="gl ' + sl + '">' + SLOT_NAMES[sl] + '</span><div class="chips">' + card[sl].map(function (id) {
        var diff = diffAgainst && diffAgainst[sl].indexOf(id) < 0, s = statusFn ? statusFn(id, sl) : null;
        return '<span class="chip' + (diff ? ' diff' : '') + (s === 'hit' || s === 'dead' ? ' ' + s : '') + '" data-tip="' +
          esc(teamName(id) + (diff ? ' · цього піку немає у твоїй картці' : '') + (s === 'hit' ? ' · зайшов' : s === 'dead' ? ' · згорів' : '')) + '">' +
          '<span class="cl">' + logoHTML(id, 20) + '</span>' + esc(teamName(id)) + (s === 'hit' ? ICON.check : s === 'dead' ? ICON.x : '') + '</span>';
      }).join('') + '</div></div>';
    }).join('') + '</div>';
  }

  function variantsHTML(o) {
    var rows = [];
    if (o.maxE) rows.push(['maxE', 'Макс. очікуваних', 'найбільше правильних у середньому', o.maxE]);
    if (o.favorites) rows.push(['favorites', 'Фаворити', '2 найсильніші в 3:0, 2 найслабші в 0:3', o.favorites]);
    (o.alternatives || []).forEach(function (a, i) {
      rows.push(['alt' + i, 'Варіант ' + (i + 1), (a.risk ? RISK[a.risk] + ' · ' : '') + 'розкид ±' + a.sdK.toFixed(1).replace('.', ','), a]);
    });
    // Не повторюємо картку, яка вже показана (наприклад, «макс. очікуваних» часто збігається з рекомендованою).
    var seen = {};
    seen[cardKey(normCard(o.best.card))] = 1;
    rows = rows.filter(function (x) { var k = cardKey(normCard(x[3].card)); if (seen[k]) return false; seen[k] = 1; return true; });
    if (!rows.length) return '<p class="fine">Інших помітно відмінних варіантів немає — рекомендована картка найкраща і за середньою кількістю правильних.</p>';
    return '<div class="variants">' + rows.map(function (x) {
      return '<div class="var"><span class="vn">' + esc(x[1]) + '<small>' + esc(x[2]) + '</small></span><span class="vp">' + fmtPct(x[3].p5) +
        '</span><button class="btn sm" data-act="apply" data-which="' + x[0] + '">Взяти</button></div>';
    }).join('') + '</div>';
  }

  function renderRec() {
    var st = state.stage, el = $('rec');
    if (isClosed(st)) { el.hidden = true; return; }
    el.hidden = false;
    var o = state.opt[st], busy = state.optBusy[st + ':best'], c = cardOf(st), fillBusy = state.optBusy[st + ':fill'];
    var html = '<div class="label">Рекомендація' + (state.profiles.length > 1 ? ' для «' + esc(profileName(state.profile)) + '»' : '') + '</div>';
    if (!o) { el.innerHTML = html + '<div class="busy"><span class="spinner"></span>' + (state.live ? 'Підбираю картку з найбільшим шансом 5+…' : 'Чекаю на результати матчів…') + '</div>'; return; }
    if (o.error) { el.innerHTML = html + '<p class="fine">Не вдалося підібрати: ' + esc(o.error) + '</p>'; return; }
    var b = o.best, same = complete(c) && cardKey(c) === cardKey(normCard(b.card)), mine = userP5(st);
    html += '<div class="' + (busy || state.optStale[st] ? 'is-stale' : '') + '">' +
      '<div class="stat"><span class="stat-v">' + fmtPct(b.p5) + '</span><span class="stat-l">шанс, що зайде 5+</span></div>';
    if (same) html += '<div class="delta">Твоя картка вже така</div>';
    else if (mine != null) {
      var d = b.p5 - mine;
      html += '<div class="delta' + (d < 0.005 ? ' neutral' : '') + '">' + (d >= 0.005 ? fmtPP(d) + ' до твоєї картки' : 'Майже як твоя картка') + '</div>';
    }
    html += chipsHTML(normCard(b.card), nPicks(c) ? c : null) + '</div>';
    var acts = (same ? '' : '<button class="btn primary" data-act="apply" data-which="best">Застосувати</button>') +
      (nPicks(c) > 0 && !complete(c) ? '<button class="btn" data-act="fill"' + (fillBusy ? ' disabled' : '') + '>' + (fillBusy ? 'Доповнюю…' : 'Доповнити мою') + '</button>' : '');
    if (acts) html += '<div class="actions">' + acts + '</div>';
    html += '<div style="margin-top:12px"><button class="linkbtn" data-act="variants" aria-expanded="' + state.showVariants + '">' +
      (state.showVariants ? 'Сховати інші варіанти' : 'Інші варіанти') + '</button></div>';
    if (state.showVariants) html += variantsHTML(o);
    html += '<p class="fine">' + (busy ? 'Дані оновились — перераховую…' : 'Перевірено на ' + o.evalSims.toLocaleString('uk-UA') + ' свіжих симуляціях') + '</p>';
    el.innerHTML = html;
  }

  function wiBtn(st, round, a, b, team, on, sub) {
    return '<button class="wbtn' + (on ? ' on' : '') + '" data-wi="' + esc(team) + '" data-wst="' + st + '" data-wr="' + round + '" data-wa="' + esc(a) + '" data-wb="' + esc(b) +
      '" aria-pressed="' + (on ? 'true' : 'false') + '" data-tip="' + esc(on ? 'Припущено: ' + teamName(team) + ' виграє. Натисни ще раз, щоб зняти.' : 'Що як ' + teamName(team) + ' виграє?') + '">' +
      '<span class="wl">' + logoHTML(team, 26) + '</span><span class="wt"><span class="wn">' + esc(teamName(team)) + '</span>' + (sub ? '<span class="ws">' + sub + '</span>' : '') + '</span>' +
      (on ? '<span class="wc">' + ICON.check + '</span>' : '') + '</button>';
  }

  /** Пара в тому порядку, як її показує Liquipedia (або наше жеребкування), а не за абеткою. */
  function pairOrder(st, round, k) {
    var m = liveMatches(st).filter(function (x) { return x.round === round && pairKey(x.a, x.b) === k; })[0];
    if (!m) m = (((state.wiPairs[st] || {})[round]) || []).filter(function (x) { return pairKey(x.a, x.b) === k; })[0];
    return m ? [m.a, m.b] : k.split('|');
  }

  /** Найближчі матчі: шанс кожної команди, вплив на картку і «що як» — клік припускає перемогу. */
  function renderNext() {
    var st = state.stage, el = $('next'), r = state.res[st], c = cardOf(st), n = wiCount();
    var swing = (r && r.swing) || [];
    if (!swing.length && !n) { el.hidden = true; return; }
    el.hidden = false;
    var fresh = !!r && r.reqId === state.runReq[st] && !state.resStale[st];
    var mine = !!r && complete(c) && r.tag === cardKey(c);
    var ss = r ? r.swingStage : null, rd = r ? r.swingRound : 0;
    var html = '<div class="label">Найближчі матчі · що як</div>';
    if (swing.length) {
      html += '<p class="hint">' + esc((ss !== st ? stageCfg(ss).name + ', ' : '') + 'раунд ' + rd) + '. Натисни на команду — припустимо, що вона виграє, і шанси перерахуються.' +
        (r.swingDerived ? ' Пари ще не оголошені: це наше жеребкування за правилами Valve.' : '') + '</p>';
    }
    // Припущення з попередніх раундів і стадій — компактними мітками.
    var chips = '';
    STAGES.forEach(function (s2) {
      var w = state.whatIf[s2] || {};
      Object.keys(w).sort().forEach(function (rk) {
        if (s2 === ss && +rk === rd) return;
        chips += '<div class="wgrp"><span class="wlab">' + esc(stageCfg(s2).name + ' · раунд ' + rk) + '</span>' + Object.keys(w[rk]).map(function (k) {
          var t = k.split('|'), win = w[rk][k], lose = win === t[0] ? t[1] : t[0];
          return '<button class="wchip" data-wi="' + esc(win) + '" data-wst="' + s2 + '" data-wr="' + rk + '" data-wa="' + esc(t[0]) + '" data-wb="' + esc(t[1]) +
            '" data-tip="' + esc('Припущено: ' + teamName(win) + ' перемагає ' + teamName(lose) + '. Натисни, щоб зняти (пізніші припущення теж знімуться).') + '">' +
            '<span class="cl">' + logoHTML(win, 20) + '</span>' + esc(teamName(win)) + '<small>— ' + esc(teamName(lose)) + '</small>' + ICON.xs + '</button>';
        }).join('') + '</div>';
      });
    });
    if (chips) html += '<div class="wchips">' + chips + '</div>';
    var rows = swing.map(function (s) {
      var a5 = mine ? s.p5IfA : null, b5 = mine ? s.p5IfB : null;
      return { a: s.a, b: s.b, pA: s.pA, a5: a5, b5: b5, imp: a5 != null && b5 != null ? Math.abs(a5 - b5) : 0, win: null };
    });
    if (mine) rows.sort(function (x, y) { return y.imp - x.imp; });
    var as = (ss && (state.whatIf[ss] || {})[rd]) || {};
    Object.keys(as).forEach(function (k) { var t = pairOrder(ss, rd, k); rows.push({ a: t[0], b: t[1], win: as[k] }); });
    html += '<div class="wrows' + (fresh ? '' : ' is-stale') + '">' + rows.map(function (x) {
      if (x.win) return '<div class="wrow set">' + wiBtn(ss, rd, x.a, x.b, x.a, x.win === x.a, x.win === x.a ? 'припущено' : '') + '<span class="wvs">–</span>' + wiBtn(ss, rd, x.a, x.b, x.b, x.win === x.b, x.win === x.b ? 'припущено' : '') + '</div>';
      var better = x.imp >= 0.005 ? (x.a5 > x.b5 ? 'a' : 'b') : null;
      function sub(p, v, up) {
        return (p == null ? '' : fmtPct(p)) + (v == null ? '' : ' · <span class="we' + (up ? ' up' : '') + '">' + (up ? '▲ ' : '') + '5+ ' + fmtPct(v) + '</span>');
      }
      return '<div class="wrow">' + wiBtn(ss, rd, x.a, x.b, x.a, false, sub(x.pA, x.a5, better === 'a')) + '<span class="wvs">–</span>' +
        wiBtn(ss, rd, x.a, x.b, x.b, false, sub(x.pA == null ? null : 1 - x.pA, x.b5, better === 'b')) + '</div>';
    }).join('') + '</div>';
    if (!swing.length) html += '<p class="fine">У твоєму сценарії всі матчі до кінця цієї стадії вже «зіграно» — дивись шанси вище.</p>';
    else html += '<p class="fine">Відсоток — шанс команди виграти матч' + (mine ? '; «5+» — шанс твоєї картки, якщо вона виграє (▲ — за кого вболівати)' : '') + '.</p>';
    if (n) html += '<div class="actions"><button class="btn" data-act="wi-reset">Скинути припущення (' + n + ')</button></div>';
    el.innerHTML = html;
  }

  function cellHTML(t, sl, sel, edit, c) {
    var p = t[sl], status = sel ? pickStatus(sl, t.w, t.l) : 'open';
    var full = !sel && c[sl].length >= SLOTS[sl];
    var tip = t.name + ': шанс ' + SLOT_LONG[sl] + ' — ' + fmtPct1(p) +
      (sel ? (status === 'hit' ? ' · пік зайшов' : status === 'dead' ? ' · пік згорів' : ' · у твоїй картці') : (full && edit ? ' · слот заповнено' : ''));
    var cls = 'pc' + (sel ? (status === 'hit' ? ' hit' : status === 'dead' ? ' dead' : ' sel') : '') + (edit ? '' : ' ro') + (!sel && p < 0.0005 ? ' zero' : '');
    var v = sel && status === 'hit' ? '<span class="ic">' + ICON.check + '</span>зайшов' : sel && status === 'dead' ? '<span class="ic">' + ICON.x + '</span>згорів' : fmtPct(p);
    var bar = (sel && status !== 'open') ? '' : '<span class="bar">' + (p >= 0.0005 ? '<i style="width:' + Math.min(100, p * 100).toFixed(1) + '%"></i>' : '') + '</span>';
    return '<button class="' + cls + '" data-cell="' + esc(t.id) + '" data-slot="' + sl + '" aria-pressed="' + (sel ? 'true' : 'false') + '"' +
      (edit ? '' : ' aria-disabled="true"') + ' data-tip="' + esc(tip) + '" aria-label="' + esc(tip) + '"><span class="v">' + v + '</span>' + bar + '</button>';
  }

  function renderTeamsTable() {
    var st = state.stage, r = state.res[st], c = cardOf(st), edit = canEdit(st), wrap = $('boardWrap');
    if (!r) { wrap.innerHTML = '<p class="fine">' + (state.live ? 'Рахую шанси…' : 'Завантажую результати…') + '</p>'; return; }
    var showIn = !r.fieldKnown, started = progress(st).started;
    var head = '<thead><tr><th class="seed">#</th><th>Команда</th>' + (showIn ? '<th class="inst" data-tip="Шанс узагалі потрапити в цю стадію">У стадії</th>' : '') +
      '<th class="rec">Рекорд</th>' + SLOT_KEYS.map(function (sl) {
        return '<th class="pcol">' + SLOT_NAMES[sl] + '<span class="cnt' + (c[sl].length === SLOTS[sl] ? ' full' : '') + '">' + c[sl].length + '/' + SLOTS[sl] + '</span></th>';
      }).join('') + '<th class="qual" data-tip="Шанс вийти зі стадії (3 перемоги)">Вихід</th></tr></thead>';
    var body = r.teams.map(function (t) {
      var mine = slotOf(c, t.id);
      return '<tr><td class="seed">' + (t.seed || '') + '</td><td class="team"><span class="tw"><span class="tl">' + logoHTML(t.id, 26) + '</span><span>' + esc(t.name) +
        (t.note ? '<small>' + esc(t.note) + '</small>' : '') + '</span></span></td>' + (showIn ? '<td class="inst">' + fmtPct(t.pIn) + '</td>' : '') +
        '<td class="rec">' + (started && t.pIn > 0.999 ? t.w + '–' + t.l : '—') + '</td>' +
        SLOT_KEYS.map(function (sl) { return '<td>' + cellHTML(t, sl, mine === sl, edit, c) + '</td>'; }).join('') +
        '<td class="qual">' + fmtPct(t.qual) + '</td></tr>';
    }).join('');
    wrap.innerHTML = '<table class="tbl"><caption class="sr">Шанси команд ' + esc(stageCfg(st).name) + '</caption>' + head + '<tbody>' + body + '</tbody></table>';
  }

  function renderMatches() {
    var st = state.stage, s = (state.live && state.live[st]) || {}, ms = s.matches || [], p = progress(st);
    $('matchesHint').textContent = p.started ? 'зіграно ' + p.done + ' з 33' : 'стадія ще не почалась';
    if (!p.started) { $('matches').innerHTML = '<p class="fine">Пари з\'являться, коли стадія почнеться.</p>'; return; }
    var html = '';
    for (var rd = 1; rd <= 5; rd++) {
      var rm = ms.filter(function (m) { return m.round === rd; });
      html += '<div class="round"><h3>Раунд ' + rd + '</h3>' + rm.map(function (m) {
        if (!m.a || !m.b) return '<div class="m tbd">пара ще не визначена</div>';
        var score = (m.maps || []).filter(function (x) { return x.finished; }).map(function (x) { return x.s1 + ':' + x.s2; }).join(', ');
        var cA = m.finished ? (m.winner === m.a ? 'w' : 'l') : '', cB = m.finished ? (m.winner === m.b ? 'w' : 'l') : '';
        var when = parseDate(m.dateISO), whenTxt = !isNaN(when) ? fmtDay(when) : (m.date || '');
        var info = m.finished ? (m.walkover ? 'технічна перемога' : esc(score)) + (m.manual ? ' · вручну' : '') : score ? 'йде · ' + esc(score) : whenTxt ? esc(whenTxt) : 'не зіграно';
        return '<div class="m"><span class="' + cA + '">' + esc(teamName(m.a)) + '</span> – <span class="' + cB + '">' + esc(teamName(m.b)) + '</span><span class="sc">' + info + '</span></div>';
      }).join('') + '</div>';
    }
    $('matches').innerHTML = html;
  }

  // ------------------------------------------------- поповер вибору команди ---
  var pickerEl = $('picker'), pickerAnchor = null;
  function openPicker(anchor, html) {
    pickerEl.innerHTML = html;
    pickerEl.style.maxHeight = '';
    pickerEl.hidden = false;
    pickerAnchor = anchor;
    // Відкриваємо з того боку від слота, де більше місця, і обмежуємо висоту, щоб не налазити на шапку.
    var b = anchor.getBoundingClientRect(), pw = pickerEl.offsetWidth, ph = pickerEl.offsetHeight, top = 64;
    var below = window.innerHeight - b.bottom - 16, above = b.top - top - 8, y;
    if (below >= Math.min(ph, 320) || below >= above) { y = b.bottom + 8; pickerEl.style.maxHeight = Math.max(160, below) + 'px'; }
    else { var h = Math.min(ph, above); y = Math.max(top, b.top - h - 8); pickerEl.style.maxHeight = Math.max(160, above) + 'px'; }
    var x = Math.min(Math.max(8, b.left + b.width / 2 - pw / 2), window.innerWidth - pw - 8);
    pickerEl.style.left = x + 'px'; pickerEl.style.top = y + 'px';
    var h = pickerEl.querySelector('h3');
    if (h) { h.id = 'pickerTitle'; pickerEl.setAttribute('aria-labelledby', 'pickerTitle'); }
    var first = pickerEl.querySelector('button:not(:disabled)');
    if (first) first.focus({ preventScroll: true });
  }
  function closePicker() {
    if (pickerEl.hidden) return;
    pickerEl.hidden = true;
    if (pickerAnchor && document.body.contains(pickerAnchor)) pickerAnchor.focus({ preventScroll: true });
    pickerAnchor = null;
  }

  /** Вибір команди для слота: список відсортовано за шансом саме в цьому слоті. */
  function pickTeamFor(anchor, sl, idx) {
    var st = state.stage, c = cardOf(st), cur = c[sl][idx];
    // Команди, які вже стоять у картці (в іншому місці), у списку не показуємо — лише ту, що тут зараз.
    var teams = stageTeams(st).filter(function (t) { return t[sl] != null && (t.pIn == null || t.pIn > 0.001) && (t.id === cur || !slotOf(c, t.id)); })
      .sort(function (a, b) { return b[sl] - a[sl]; });
    var html = '<h3>' + SLOT_NAMES[sl] + ' — обери команду</h3>' + teams.map(function (t) {
      var where = slotOf(c, t.id), note = t.id === cur ? 'зараз тут' : where ? 'зараз у ' + SLOT_NAMES[where] : (t.pIn != null && t.pIn < 0.999 ? 'у стадії ' + fmtPct(t.pIn) : '');
      return '<button class="pk' + (t.id === cur ? ' cur' : '') + '" data-pick-team="' + esc(t.id) + '" data-slot="' + sl + '" data-i="' + idx + '">' +
        '<span class="pl">' + logoHTML(t.id, 30) + '</span><span class="pn">' + esc(t.name) + (note ? '<small>' + esc(note) + '</small>' : '') + '</span>' +
        '<span class="pv">' + fmtPct(t[sl]) + '</span></button>';
    }).join('') + (cur ? '<button class="pk" data-act="remove" data-id="' + esc(cur) + '"><span class="pl"></span><span class="pn">Прибрати ' + esc(teamName(cur)) + '</span><span></span></button>' : '');
    openPicker(anchor, html);
  }

  /** Вибір слота для команди з ряду: три варіанти з шансами. */
  function pickSlotFor(anchor, id) {
    var st = state.stage, c = cardOf(st), t = teamsById(state.res[st])[id] || { id: id }, where = slotOf(c, id);
    var html = '<h3>' + esc(teamName(id)) + ' — куди поставити?</h3><div class="pk-slots">' + SLOT_KEYS.map(function (sl) {
      var full = c[sl].length >= SLOTS[sl] && where !== sl;
      return '<button class="pk' + (where === sl ? ' cur' : '') + '" data-place="' + esc(id) + '" data-slot="' + sl + '"' + (full ? ' disabled' : '') + '>' +
        '<span class="pl">' + logoHTML(id, 30) + '</span><span class="pn">' + SLOT_NAMES[sl] + '<small>' + (where === sl ? 'зараз тут' : full ? 'слот заповнено' : 'шанс ' + SLOT_LONG[sl]) + '</small></span>' +
        '<span class="pv">' + fmtPct(t[sl]) + '</span></button>' +
        (full ? c[sl].map(function (o, j) {
          return '<button class="pk sub" data-place="' + esc(id) + '" data-slot="' + sl + '" data-i="' + j + '"><span class="pl">' + logoHTML(o, 24) + '</span>' +
            '<span class="pn">' + (where ? 'Поміняти місцями з ' : 'Замінити ') + esc(teamName(o)) + '</span><span></span></button>';
        }).join('') : '');
    }).join('') + (where ? '<button class="pk" data-act="remove" data-id="' + esc(id) + '"><span class="pl"></span><span class="pn">Прибрати з картки</span><span></span></button>' : '') + '</div>';
    openPicker(anchor, html);
  }

  // ------------------------------------------------------------ профілі ---
  var modalEl = $('modal'), modalOpener = null;
  function openModal(html, onSubmit, cls) {
    if (modalEl.hidden) modalOpener = pickerAnchor || document.activeElement;
    modalEl.innerHTML = '<div class="modal' + (cls ? ' ' + cls : '') + '" role="dialog" aria-modal="true" aria-labelledby="modalTitle">' + html + '</div>';
    var h = modalEl.querySelector('h3');
    if (h) h.id = 'modalTitle';
    modalEl.hidden = false;
    var input = modalEl.querySelector('input'), form = modalEl.querySelector('form');
    if (input) { input.focus(); input.select(); } else { var b = modalEl.querySelector('.btn.primary, .btn.danger'); if (b) b.focus(); }
    if (form) form.onsubmit = function (e) { e.preventDefault(); onSubmit(input ? input.value.trim() : true); };
  }
  function closeModal() {
    modalEl.hidden = true; modalEl.innerHTML = '';
    var back = modalOpener && document.body.contains(modalOpener) ? modalOpener : document.querySelector('.profw .more') || document.querySelector('.prof.on');
    modalOpener = null;
    if (back) back.focus({ preventScroll: true });
  }

  function switchProfile(pid) {
    if (pid === state.profile) return;
    state.profile = pid; lsSet('profile', pid);
    state.lastGood = {};
    render();
    if (state.stage === PO) { requestPlayoffs(); return; }
    scheduleInsights(state.stage);
    var c = cardOf(state.stage), r = state.res[state.stage];
    if (complete(c) && (!r || r.tag !== cardKey(c))) requestRun(state.stage);
    scheduleProfileStats();
  }

  function addProfile() {
    if (!state.profilesOk) { toast('Профілі запрацюють після перезапуску сервера: закрий вікно start.command і відкрий його знову.'); return; }
    openModal('<form><h3>Новий профіль</h3><p>Наприклад, картка друга. У кожного профілю свої картки на кожну стадію.</p>' +
      '<input name="name" maxlength="24" placeholder="Ім\'я, наприклад Друг" autocomplete="off" required>' +
      '<div class="actions"><button type="button" class="btn" data-act="modal-cancel">Скасувати</button><button class="btn primary">Створити</button></div></form>',
    function (name) {
      if (!name) return;
      postJSON('/api/profiles', { action: 'create', name: name }).then(function (j) {
        if (j.version) state.version = j.version;
        state.profiles = j.profiles || state.profiles;
        closeModal();
        if (j.profile) switchProfile(j.profile.id);
        toast('Профіль «' + ((j.profile && j.profile.name) || name) + '» створено. Заповни його картку.');   // сервер повертає очищене ім'я
        render();
      }).catch(function (e) { toast('Не вдалося створити профіль: ' + e.message); });
    });
  }

  function profileMenu(anchor) {
    var p = state.profiles.filter(function (x) { return x.id === state.profile; })[0];
    if (!p) return;
    openPicker(anchor, '<h3>Профіль «' + esc(p.name) + '»</h3>' +
      '<button class="pk" data-act="rename-profile"><span class="pl"></span><span class="pn">Перейменувати</span><span></span></button>' +
      '<button class="pk" data-act="copy-profile"><span class="pl"></span><span class="pn">Скопіювати сюди картку з іншого профілю<small>для ' + esc(stageCfg(state.stage).name) + '</small></span><span></span></button>' +
      (p.id !== 'me' ? '<button class="pk" data-act="delete-profile"><span class="pl"></span><span class="pn">Видалити профіль</span><span></span></button>' : ''));
  }

  function renameProfile(id) {
    var pid = id || state.profile, p = state.profiles.filter(function (x) { return x.id === pid; })[0];
    if (!p) return;
    closePicker();
    openModal('<form><h3>Перейменувати профіль</h3><input name="name" maxlength="24" value="' + esc(p.name) + '" autocomplete="off" required>' +
      '<div class="actions"><button type="button" class="btn" data-act="modal-cancel">Скасувати</button><button class="btn primary">Зберегти</button></div></form>',
    function (name) {
      if (!name) return;
      postJSON('/api/profiles', { action: 'rename', id: p.id, name: name }).then(function (j) {
        if (j.version) state.version = j.version;
        state.profiles = j.profiles || state.profiles; closeModal(); render();
      }).catch(function (e) { toast('Не вдалося перейменувати: ' + e.message); });
    });
  }

  function deleteProfile(id) {
    var pid = id || state.profile, p = state.profiles.filter(function (x) { return x.id === pid; })[0];
    if (!p || p.id === 'me') return;
    closePicker();
    openModal('<form><h3>Видалити профіль «' + esc(p.name) + '»?</h3><p>Картки цього профілю на всіх стадіях буде видалено. Скасувати це не можна.</p>' +
      '<div class="actions"><button type="button" class="btn" data-act="modal-cancel">Скасувати</button><button class="btn danger">Видалити</button></div></form>',
    function () {
      postJSON('/api/profiles', { action: 'delete', id: p.id }).then(function (j) {
        if (j.version) state.version = j.version;
        state.profiles = j.profiles || state.profiles.filter(function (x) { return x.id !== p.id; });
        delete state.cards[p.id];
        closeModal(); if (state.profile === p.id) switchProfile('me'); state.leagueOpen = null; requestLeague(); render();
        toast('Профіль «' + p.name + '» видалено.');
      }).catch(function (e) { toast('Не вдалося видалити: ' + e.message); });
    });
  }

  function copyProfileMenu(anchor) {
    var st = state.stage, others = state.profiles.filter(function (x) { return x.id !== state.profile && picksIn(st, x.id); });
    if (!others.length) { closePicker(); toast('В інших профілів немає картки на ' + stageCfg(st).name + '.'); return; }
    openPicker(anchor, '<h3>Скопіювати картку ' + esc(stageCfg(st).name) + ' з профілю</h3>' + others.map(function (x) {
      return '<button class="pk" data-copy-from="' + esc(x.id) + '"><span class="pl"><span class="logo" style="background:' + profileColor(x.id) + ';font-size:12px">' +
        esc(initial(x.name)) + '</span></span><span class="pn">' + esc(x.name) + '<small>' + picksIn(st, x.id) + (st === PO ? '/7' : '/10') + ' піків</small></span><span></span></button>';
    }).join(''));
  }

  // ------------------------------------------------- AI-аналіз та експерти ---
  var insW = null, insBusy = null, insQueue = [], insTimer = null;
  function newInsWorker() { if (insW) insW.terminate(); insW = new Worker(WORKER_URL); insW.onmessage = onInsights; insBusy = null; }

  function loadInsights() {
    return getJSON('/api/insights').then(function (j) { state.insRaw = j || {}; })
      .catch(function () { if (!state.insRaw) state.insRaw = {}; });
  }
  function insFile(st, kind) { var x = state.insRaw && state.insRaw[st]; return x && x[kind] ? x[kind] : null; }
  function aiFileOf(st) { var f = insFile(st, 'ai'); return f && !f.error ? f : null; }
  function boardsOf(st) { var f = insFile(st, 'analysts'); return f && !f.error && Array.isArray(f.boards) && f.boards.length ? f.boards : null; }
  function hasInsights(st) { return STAGES.indexOf(st) >= 0 && !!(aiFileOf(st) || boardsOf(st)); }

  /** AI-поправки всіх стадій разом: для команди діє найсвіжіший аналіз, який її розглянув. */
  function aiMerged() {
    if (!state.insRaw || typeof Insights === 'undefined') return {};
    var files = {};
    INS_ORDER.forEach(function (st) { files[st] = aiFileOf(st); });
    return Insights.mergeAI(files, INS_ORDER, knownNames, manualIds).deltas;
  }
  /** Від чого залежить підгонка експертів стадії: їхні борди й AI-поправки (якщо ввімкнені). */
  function fitSrc(st) {
    var ai = state.flags.ai ? aiMerged() : {};
    return hashStr(JSON.stringify(boardsOf(st)) + '|' + JSON.stringify(Object.keys(ai).sort().map(function (k) { return [k, +ai[k].toFixed(4)]; })));
  }
  function fitsActive() {
    var o = {};
    STAGES.forEach(function (st) { var f = state.fit[st]; if (boardsOf(st) && f && f.deltas && f.src === fitSrc(st)) o[st] = f; });
    return o;
  }

  /** Конфіг команд з поправками AI та експертів (за перемикачами). Саме його отримують усі розрахунки. */
  function modelCfg() {
    if (typeof Insights === 'undefined') return state.cfg;
    var d = Insights.addDeltas(state.flags.ai ? aiMerged() : {}, state.flags.exp ? Insights.mergeExperts(fitsActive(), INS_ORDER) : {});
    var key = JSON.stringify(Object.keys(d).sort().map(function (k) { return [k, +d[k].toFixed(4)]; }));
    if (!state.model || state.model.key !== key || state.model.base !== state.cfg) {
      state.model = { key: key, base: state.cfg, deltas: d, cfg: Object.keys(d).length ? Insights.applyDeltas(state.cfg, d) : state.cfg };
    }
    return state.model.cfg;
  }
  /** Якщо поправки змінились (новий файл, перемикач, свіжа підгонка експертів) — усе перераховуємо. */
  function modelMaybeChanged() {
    if (!state.model) { modelCfg(); return false; }
    var before = state.model.key;
    modelCfg();
    if (before === state.model.key) return false;
    state.dataGen++;
    STAGES.forEach(function (st) { state.resStale[st] = true; if (state.opt[st]) state.optStale[st] = true; });
    state.profP5 = {}; state.poStale = true; requestLeague();
    if (state.stage === PO) requestPlayoffs();
    else if (state.stage) { requestRun(state.stage); ensureRec(state.stage); scheduleProfileStats(); }
    return true;
  }

  function scheduleInsights(st) { clearTimeout(insTimer); insTimer = setTimeout(function () { requestInsights(st, true); }, 900); }
  function requestInsights(st, front) {
    if (!state.cfg || !state.live || !state.insRaw || typeof Insights === 'undefined' || STAGES.indexOf(st) < 0) return;
    if (!hasInsights(st)) {
      if (state.ins[st]) { delete state.ins[st]; if (st === state.stage) keepFocus(renderInsights); }
      return;
    }
    insQueue = insQueue.filter(function (s) { return s !== st; });
    if (front) insQueue.unshift(st); else insQueue.push(st);
    state.insStale[st] = true;
    pumpInsights();
    if (st === state.stage) keepFocus(renderInsights);
  }
  function pumpInsights() {
    if (insBusy || !insQueue.length) return;
    var st = insQueue.shift(), c = cardOf(st), cc = complete(c) ? normCard(c) : null, id = ++seq;
    var others = fitsActive(), prev = state.ins[st];
    delete others[st];
    insBusy = st; state.insReq = id; state.insSrc = fitSrc(st);
    insW.postMessage({ type: 'insights', reqId: id, stage: st, cfg: state.cfg, live: liveForWorker(false),
      ai: aiFileOf(st), aiAll: aiMerged(), boards: boardsOf(st), fitsOther: others, order: INS_ORDER,
      flags: state.flags, userCard: cc, tag: cc ? cardKey(cc) : '', meta: state.profile,
      prevFit: state.fit[st] || null, prevCards: prev && prev.cardsKey ? { key: prev.cardsKey, cards: prev.cards } : null,
      wantExpertCard: !isClosed(st), sims: INS_SIMS });
  }
  function onInsights(e) {
    var r = e.data, st = r.stage;
    insBusy = null;
    if (r.reqId === state.insReq) {
      if (r.error) state.insErr[st] = r.error;
      else {
        state.insErr[st] = null; state.ins[st] = r;
        state.insStale[st] = insQueue.indexOf(st) >= 0;
        var f = r.exp && r.exp.fit;
        if (f) { f.src = state.insSrc; state.fit[st] = f; lsSet('fit-' + st, JSON.stringify(f)); }
        else if (state.fit[st] && !(r.exp && r.exp.waitingField)) { delete state.fit[st]; lsDel('fit-' + st); }
        if (modelMaybeChanged()) STAGES.forEach(function (s) { if (s !== st && state.ins[s]) state.insStale[s] = true; });
      }
    }
    pumpInsights();
    if (st === state.stage) render();
  }

  function setFlag(name, on) {
    if (name !== 'ai' && name !== 'exp') return;
    state.flags[name] = on;
    lsSet('flags', JSON.stringify(state.flags));
    modelMaybeChanged();
    STAGES.forEach(function (st) { if (state.ins[st]) state.insStale[st] = true; });
    if (state.stage !== PO) requestInsights(state.stage, true);
    render();
  }

  function applyInsight(which) {
    var st = state.stage, x = state.ins[st], m = x && x.cards ? x.cards[which] : null;
    if (m) applyCard(st, m.card, 'Картку застосовано · шанс 5+ ' + fmtPct(m.p5));
  }

  function switchHTML(flag, on, label, tip) {
    return '<label class="sw" data-tip="' + esc(tip) + '"><input type="checkbox" data-flag="' + flag + '"' + (on ? ' checked' : '') + '>' +
      '<span class="sw-t" aria-hidden="true"></span><span class="sw-l">' + label + '</span></label>';
  }
  // Поправка сили (логіт на карту) → приблизно скільки відсоткових пунктів шансу виграти карту в рівного суперника.
  function ppMap(x) { return (x >= 0 ? '+' : '−') + Math.abs(x * 25).toFixed(1) + ' п.п.'; }
  function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return 'джерело'; } }

  function insCardHTML(title, hint, m, which, st, userC) {
    var same = complete(userC) && cardKey(userC) === cardKey(normCard(m.card));
    return '<div class="icard"><div class="ic-h"><span class="ic-t">' + esc(title) + (hint ? '<small>' + esc(hint) + '</small>' : '') + '</span>' +
      '<span class="ic-p" data-tip="Шанс, що зайде 5+, за поточною моделлю">' + fmtPct(m.p5) + '</span>' +
      (same ? '<span class="ic-same">як твоя</span>' : canEdit(st) ? '<button class="btn sm" data-act="apply-ins" data-which="' + which + '">Взяти</button>' : '') + '</div>' +
      chipsHTML(normCard(m.card), nPicks(userC) ? userC : null) + '</div>';
  }
  /** Вплив шарів на картку користувача — лише якщо розрахунок зроблено саме для неї. */
  function impactOf(st) {
    var x = state.ins[st], c = cardOf(st);
    return x && x.impact && complete(c) && x.tag === cardKey(c) && x.meta === state.profile ? x.impact : null;
  }

  function renderAI() {
    var st = state.stage, el = $('aiCard'), f = insFile(st, 'ai'), x = state.ins[st], name = stageCfg(st).name, c = cardOf(st);
    var inherited = Object.keys(aiMerged()).length;
    var head = '<div class="ins-h"><div class="label">AI-аналіз</div>' + (inherited || aiFileOf(st) ? switchHTML('ai', state.flags.ai, 'враховувати в шансах',
      'Коли ввімкнено, поправки AI змінюють силу команд у всіх розрахунках на сторінці') : '') + '</div>';
    if (f && f.error) { el.innerHTML = head + '<p class="fine">Файл data/ai/' + st + '.json не читається: ' + esc(f.error) + '</p>'; return; }
    if (!f) {
      el.innerHTML = head + '<p class="ins-empty">Для ' + esc(name) + ' аналізу ще немає.</p>' +
        (STATIC ? '' : '<p class="hint">Напиши в Claude Code <b>/predict-stage ' + st + '</b> — Claude збере новини про команди (стендіни, форма, візи), оцінить їх вплив і складе власну картку. Найкраще — ввечері перед дедлайном.</p>') +
        (inherited ? '<p class="fine">У шансах уже діють поправки з попереднього аналізу (' + inherited + ' ' + plural(inherited, 'команда', 'команди', 'команд') + ').</p>' : '');
      return;
    }
    var s = Insights.sanitizeAI(f, knownNames, manualIds), when = parseDate(f.generatedAt), html = head;
    if (f.summary) html += '<p class="ins-sum">' + esc(f.summary) + '</p>';
    if (!isNaN(when)) {
      var age = Date.now() - when.getTime();
      html += '<p class="hint">Оновлено ' + fmtWhen(when) + (age > 36 * 3600e3 && !isClosed(st) ? ' (' + fmtAgo(age) + ') — перед подачею варто оновити' : '') + '</p>';
    }
    if (!s.items.length) html += '<p class="fine">Чинників, які варто врахувати, AI не знайшов.</p>';
    else html += '<div class="adjs' + (state.flags.ai ? '' : ' off') + '">' + s.items.map(function (it) {
      var up = it.effect >= 0;
      var tip = 'Поправка сили ' + (up ? '+' : '−') + Math.abs(it.effect).toFixed(2) + ' (оцінка ' + (it.delta >= 0 ? '+' : '−') + Math.abs(it.delta).toFixed(2) +
        ' × впевненість ' + Math.round(it.confidence * 100) + '%). Це приблизно ' + ppMap(it.effect) + ' до шансу виграти карту в рівного суперника.';
      return '<div class="adj"><span class="aj-l">' + logoHTML(it.team, 28) + '</span><div class="aj-b"><div class="aj-t"><b>' + esc(teamName(it.team)) + '</b><span class="tag">' + esc(it.factorName) + '</span>' +
        '<span class="aj-e ' + (up ? 'up' : 'down') + '" data-tip="' + esc(tip) + '">' + (up ? '▲ ' : '▼ ') + ppMap(it.effect) + '</span></div>' +
        (it.summary ? '<div class="aj-s">' + esc(it.summary) + '</div>' : '') +
        '<div class="aj-src">' + it.evidence.map(function (ev) {
          return '<a href="' + esc(ev.url) + '" target="_blank" rel="noopener noreferrer" data-tip="' + esc('«' + ev.quote + '»' + (ev.date ? ' · ' + ev.date : '')) + '">' + esc(hostOf(ev.url)) + '</a>';
        }).join('') + '</div></div></div>';
    }).join('') + '</div>';
    if (s.skipped.length) html += '<p class="fine">Не враховано: ' + esc(s.skipped.join('; ')) + '.</p>';
    var imp = impactOf(st);
    if (imp) html += '<p class="ins-imp">Твоя картка: без AI ' + fmtPct1(imp.base) + ' → з AI ' + fmtPct1(imp.withAI) + ' <b>' + fmtPP(imp.withAI - imp.base) + '</b></p>';
    if (f.ownCard) {
      if (x && x.cards && x.cards.ai) {
        html += '<div class="' + (state.insStale[st] ? 'is-stale' : '') + '">' + insCardHTML('Картка AI', 'складена до того, як AI побачив піки експертів', x.cards.ai, 'ai', st, c) + '</div>' +
          (f.ownCardNote ? '<p class="fine">' + esc(f.ownCardNote) + '</p>' : '');
      } else if (x) html += '<p class="fine">Картка AI у файлі некоректна: потрібно 2 / 6 / 2 різні команди цієї стадії.</p>';
      else html += '<div class="busy"><span class="spinner"></span>Рахую шанс картки AI…</div>';
    }
    if (state.insErr[st]) html += '<p class="fine">Помилка розрахунку: ' + esc(state.insErr[st]) + '</p>';
    el.innerHTML = html;
  }

  function renderExperts() {
    var st = state.stage, el = $('expCard'), f = insFile(st, 'analysts'), x = state.ins[st], name = stageCfg(st).name, c = cardOf(st), boards = boardsOf(st);
    var head = '<div class="ins-h"><div class="label">Експерти</div>' + (boards ? switchHTML('exp', state.flags.exp, 'враховувати (15%)',
      'Коли ввімкнено, думка експертів зсуває силу команд на 15% від різниці з моделлю') : '') + '</div>';
    if (f && f.error) { el.innerHTML = head + '<p class="fine">Файл data/analysts/' + st + '.json не читається: ' + esc(f.error) + '</p>'; return; }
    if (!boards) {
      el.innerHTML = head + '<p class="ins-empty">Прогнозів експертів для ' + esc(name) + ' ще немає.</p>' +
        '<p class="hint">Аналітики публікують свої картки за 1–2 дні до старту стадії.' + (STATIC ? '' : ' Команда <b>/predict-stage ' + st + '</b> у Claude Code збере їх разом з AI-аналізом.') + '</p>';
      return;
    }
    var nb = boards.length + ' ' + plural(boards.length, 'картку', 'картки', 'карток');
    if (!x || !x.exp) {
      el.innerHTML = head + '<div class="busy"><span class="spinner"></span>' + (state.insErr[st] ? 'Помилка розрахунку: ' + esc(state.insErr[st]) : 'Зводжу ' + nb + '…') + '</div>';
      return;
    }
    var e = x.exp;
    if (e.waitingField) {
      el.innerHTML = head + '<p class="ins-empty">Зібрано ' + nb + ', але склад ' + esc(name) + ' ще не визначено.</p><p class="hint">Зведу їх, щойно завершиться попередня стадія.</p>';
      return;
    }
    var s = e.summary, html = head;
    html += '<p class="ins-sum">' + s.nFull + ' ' + plural(s.nFull, 'повна картка', 'повні картки', 'повних карток') + ' від ' + s.nGroups + ' ' +
      plural(s.nGroups, 'незалежного джерела', 'незалежних джерел', 'незалежних джерел') + (s.nPartial ? ' · ще ' + s.nPartial + ' ' + plural(s.nPartial, 'неповна', 'неповні', 'неповних') : '') + '</p>';
    var when = parseDate(f.collectedAt);
    if (!isNaN(when)) html += '<p class="hint">Зібрано ' + fmtWhen(when) + (f.note ? ' · ' + esc(f.note) : '') + '</p>';
    else if (f.note) html += '<p class="hint">' + esc(f.note) + '</p>';
    if (!e.enough) html += '<p class="fine">Щоб врахувати думку експертів у шансах, потрібно щонайменше 3 незалежні джерела.</p>';
    var diffs = Object.keys(e.deltaFull || {}).map(function (id) { return [id, e.deltaFull[id]]; })
      .filter(function (d) { return Math.abs(d[1]) >= 0.12; }).sort(function (a, b) { return Math.abs(b[1]) - Math.abs(a[1]); });
    var up = diffs.filter(function (d) { return d[1] > 0; }).slice(0, 4), down = diffs.filter(function (d) { return d[1] < 0; }).slice(0, 4);
    var fit = e.fit || {}, tgt = fit.target || s.qbar, mdl = fit.model || {};
    function teamChips(list) {
      return list.map(function (d) {
        var tip = teamName(d[0]) + ': шанс вийти зі стадії ' + (mdl[d[0]] != null ? 'за моделлю ' + fmtPct(mdl[d[0]]) + ', ' : '') + 'за експертами ≈ ' + fmtPct(tgt[d[0]]) + ' (до старту стадії)';
        return '<span class="chip" data-tip="' + esc(tip) + '"><span class="cl">' + logoHTML(d[0], 20) + '</span>' + esc(teamName(d[0])) + '</span>';
      }).join('');
    }
    if (up.length || down.length) {
      html += '<div class="groups">' + (up.length ? '<div class="grp wide"><span class="gl">▲ Експерти оцінюють вище, ніж модель</span><div class="chips">' + teamChips(up) + '</div></div>' : '') +
        (down.length ? '<div class="grp wide"><span class="gl">▼ Експерти оцінюють нижче, ніж модель</span><div class="chips">' + teamChips(down) + '</div></div>' : '') + '</div>';
    } else if (e.enough) html += '<p class="fine">Порядок команд в експертів майже такий, як у моделі.</p>';
    var cards = '';
    if (x.cards.majority) cards += insCardHTML('Картка більшості', 'найчастіші піки в кожному слоті', x.cards.majority, 'majority', st, c);
    if (x.cards.expert) cards += insCardHTML('Картка за експертами', 'найкраща, якщо експерти мають рацію', x.cards.expert, 'expert', st, c);
    if (cards) html += '<div class="' + (state.insStale[st] ? 'is-stale' : '') + '">' + cards + '</div>';
    var imp = impactOf(st);
    if (imp && e.enough) html += '<p class="ins-imp">Твоя картка: без експертів ' + fmtPct1(imp.withAI) + ' → з експертами ' + fmtPct1(imp.withAll) + ' <b>' + fmtPP(imp.withAll - imp.withAI) + '</b></p>';
    if (s.agreement != null) {
      html += '<p class="fine">У середньому дві картки з різних джерел збігаються на ' + Math.round(s.agreement * 100) +
        '% піків. Коли всі думають однаково, помиляються теж разом — тому експерти важать у шансах лише 15%.</p>';
    }
    var order = Object.keys(s.votes).sort(function (a, b) { return (tgt[b] - tgt[a]) || (s.qbar[b] - s.qbar[a]); });
    html += '<details class="sub"><summary>Голоси за командами</summary><div class="table-wrap"><table class="tbl mini"><thead><tr><th>Команда</th><th>3:0</th><th>3:1 / 3:2</th><th>0:3</th>' +
      '<th data-tip="Шанс вийти зі стадії, якщо вірити пікам експертів">Вихід</th></tr></thead><tbody>' + order.map(function (id) {
        function cell(sl) { var v = s.weight ? s.votes[id][sl] / s.weight : 0; return '<td>' + (v > 0 ? Math.round(v * 100) + '%' : '<span class="z">—</span>') + '</td>'; }
        return '<tr><td class="team"><span class="tw"><span class="tl">' + logoHTML(id, 22) + '</span><span>' + esc(teamName(id)) + '</span></span></td>' +
          cell('p30') + cell('adv') + cell('p03') + '<td>' + fmtPct(tgt[id]) + '</td></tr>';
      }).join('') + '</tbody></table></div></details>';
    var groups = {}, gOrder = [];
    s.boards.forEach(function (b) { if (!groups[b.group]) { groups[b.group] = []; gOrder.push(b.group); } groups[b.group].push(b); });
    html += '<details class="sub"><summary>Чиї картки враховано (' + s.boards.length + ')</summary><ul class="srcs">' + gOrder.map(function (g) {
      var names = groups[g].map(function (b) {
        return b.url && /^https:\/\//.test(b.url) ? '<a href="' + esc(b.url) + '" target="_blank" rel="noopener noreferrer">' + esc(b.name) + '</a>' : esc(b.name);
      }).join(', ');
      return '<li>' + (groups[g].length === 1 && groups[g][0].name === g ? names : '<b>' + esc(g) + ':</b> ' + names) + '</li>';
    }).join('') + '</ul></details>';
    if (s.problems.length) html += '<p class="fine">Пропущено: ' + esc(s.problems.join('; ')) + '.</p>';
    el.innerHTML = html;
  }

  function renderInsights() {
    if (!state.cfg || state.stage === PO) return;
    var ok = typeof Insights !== 'undefined' && !!state.insRaw;
    $('insDuo').hidden = !ok;
    if (ok) { renderAI(); renderExperts(); }
  }

  // ---------------------------------------------------------------- плей-оф ---
  var poW = null, poTimer = null;
  function newPoWorker() { if (poW) poW.terminate(); poW = new Worker(WORKER_URL); poW.onmessage = onPlayoffs; state.poBusy = false; }
  function poKey(c) { return c.qf.slice().sort().join(',') + '|' + c.sf.slice().sort().join(',') + '|' + (c.champion || ''); }
  /** Матчі плей-оф з Liquipedia для рушія: пари й переможці (лише завершені). */
  function poResults() {
    var ms = ((state.live && state.live[PO]) || {}).matches || [];
    return ms.filter(function (m) { return m.round && m.a && m.b; })
      .map(function (m) { return { round: m.round, slot: m.slot, a: m.a, b: m.b, winner: m.finished ? m.winner : null }; });
  }
  function schedulePlayoffs() { clearTimeout(poTimer); poTimer = setTimeout(requestPlayoffs, 150); }
  function requestPlayoffs() {
    if (!state.live || !state.cfg) return;
    if (state.poBusy) newPoWorker();
    var id = ++seq, c = poNorm(poCard());
    state.poReq = id; state.poBusy = true;
    poW.postMessage({ type: 'playoffs', reqId: id, stage: PO, cfg: modelCfg(), live: liveForWorker(false), card: c, tag: poKey(c), meta: state.profile,
      opts: { sims: PO_SIMS, results: poResults() } });
    if (state.stage === PO) keepFocus(renderPlayoffs);
  }
  function onPlayoffs(e) {
    var r = e.data;
    if (r.reqId !== state.poReq) return;
    state.poBusy = false;
    if (r.error) state.poErr = r.error;
    else { state.poErr = null; state.po = r; state.poStale = false; }
    if (state.stage === PO) render(); else renderTabs();
  }

  function renderHeadPO() {
    var c = stageCfg(PO), t = times(PO), now = Date.now(), po = state.po, known = !!(po && po.bracketKnown);
    $('stageTitle').textContent = c.name;
    var pill = $('stagePill'), cls = 'pill', txt, pp = poProgress();
    if (pp.done === 7) txt = 'Завершено';
    else if (pp.done > 0 || pp.live) { txt = 'Наживо · зіграно ' + pp.done + ' з 7'; cls += ' live'; }
    else if (!known) txt = 'Сітка — після Stage 3';
    else if (!isClosed(PO)) {
      if (t.deadline && now < t.deadline.getTime()) {
        txt = 'Подати до ' + fmtDay(t.deadline) + ' · ще ' + fmtLeft(t.deadline.getTime() - now);
        cls += t.deadline.getTime() - now < 6 * 3600e3 ? ' warn' : ' open';
      } else { txt = 'Дедлайн минув · lock ≈' + fmtTime(t.lockAt); cls += ' warn'; }
    } else txt = 'Картку закрито';
    pill.className = cls; pill.hidden = false;
    pill.innerHTML = '<span class="pd" aria-hidden="true"></span>' + esc(txt);
    $('stageSub').textContent = '8 найкращих зі Stage 3 · гра на виліт · чвертьфінали й півфінали Bo3, фінал Bo5. ' +
      'Три виклики Pick\'Em: вгадати щонайменше 2 чвертьфінали, щонайменше 1 півфінал і чемпіона.';
    var alerts = [];
    if (state.profilesError) alerts.push(['critical', 'Профілі: ' + state.profilesError]);
    if (!state.live && state.meta.failed) alerts.push(['critical', STATIC ? 'Не вдалося завантажити результати матчів. Онови сторінку трохи згодом.' : 'Немає даних про матчі: сервер не відповідає. Перевір, що вікно start.command відкрите, і онови сторінку.']);
    ((po && po.warnings) || []).forEach(function (w) { alerts.push(['', w]); });
    var lpo = (state.live && state.live[PO]) || {};
    if (lpo.error) alerts.push(['', lpo.error]);
    (lpo.manualErrors || []).forEach(function (mm) { alerts.push(['', 'Ручне виправлення не застосовано: ' + mm]); });
    if (state.poErr) alerts.push(['critical', 'Помилка розрахунку: ' + state.poErr]);
    $('alerts').innerHTML = alertsHTML(alerts);
    $('wiBanner').hidden = true;
  }

  function poMatchOf(B, id) {
    for (var i = 0; i < B.matches.length; i++) if (B.matches[i].a === id || B.matches[i].b === id) return i;
    return -1;
  }
  /** Сітка, на якій ставимо піки: справжня, а до кінця Stage 3 — прогнозована (найімовірніші пари). */
  function poBracket() {
    var po = state.po;
    if (!po) return null;
    if (po.bracketKnown) return { matches: po.matches, seeds: po.seeds, best: po.best, user: po.user, teams: po.teams, real: true };
    return null;                                     // до кінця Stage 3 сітки ще немає — піки ставити нікуди
  }
  function poTeam(po, id) { var o = null; po.teams.forEach(function (t) { if (t.id === id) o = t; }); return o || { id: id }; }

  /** Клік у сітці: kind — 'qf' (переможець чвертьфіналу), 'sf' (фіналіст) або 'champion'. Піки далі по сітці узгоджуємо. */
  function poPick(kind, id) {
    var po = poBracket(), c = poCard();
    if (!po) return;
    if (!canEdit(PO)) { toastClosed(); return; }
    var mi = poMatchOf(po, id);
    if (mi < 0) return;
    var seen = {};                                   // піки команд, яких у цій сітці вже немає, прибираємо
    c.qf = c.qf.filter(function (x) { var q = poMatchOf(po, x); if (q < 0 || seen[q]) return false; seen[q] = 1; return true; });
    function half(x) { var q = poMatchOf(po, x); return q < 0 ? -1 : q < 2 ? 0 : 1; }
    if (kind === 'qf') {
      var had = c.qf.indexOf(id) >= 0;
      c.qf = c.qf.filter(function (x) { return poMatchOf(po, x) !== mi; });
      if (!had) c.qf.push(id);
    } else if (kind === 'sf') {
      if (c.qf.indexOf(id) < 0) return;
      var hadS = c.sf.indexOf(id) >= 0;
      c.sf = c.sf.filter(function (x) { return half(x) !== half(id); });
      if (!hadS) c.sf.push(id);
    } else {
      if (c.sf.indexOf(id) < 0) return;
      c.champion = c.champion === id ? null : id;
    }
    // фіналіст має бути серед переможців чвертьфіналів, чемпіон — серед фіналістів
    c.sf = c.sf.filter(function (x) { return c.qf.indexOf(x) >= 0; });
    if (c.champion && c.sf.indexOf(c.champion) < 0) c.champion = null;
    c.qf.sort(function (x, y) { return poMatchOf(po, x) - poMatchOf(po, y); });
    c.sf.sort(function (x, y) { return poMatchOf(po, x) - poMatchOf(po, y); });
    cardChanged(PO);
  }

  /** Матч плей-оф з Liquipedia, у якому команда грала в цьому раунді (1 — ЧФ, 2 — ПФ, 3 — фінал). */
  function poLiveMatch(round, id) {
    var ms = ((state.live && state.live[PO]) || {}).matches || [];
    return ms.filter(function (m) { return m.round === round && (m.a === id || m.b === id); })[0] || null;
  }
  /** Скільки карт команда виграла в цьому матчі (null — матч ще не почався). */
  function poMapsWon(round, id) {
    var m = poLiveMatch(round, id);
    if (!m) return null;
    var side = m.a === id ? '1' : '2', won = (m.maps || []).filter(function (x) { return x.winner === side; }).length;
    var any = (m.maps || []).some(function (x) { return x.finished; });
    if (m.walkover && m.finished) return m.winner === id ? 'W' : '—';
    return any || m.finished ? won : null;
  }
  function poProgress() {
    var ms = ((state.live && state.live[PO]) || {}).matches || [];
    return { done: ms.filter(function (m) { return m.finished; }).length, total: 7,
      live: ms.some(function (m) { return !m.finished && (m.maps || []).some(function (x) { return x.finished; }); }) };
  }

  /**
   * Клітинка сітки. o: {pct, what — для підказки, picked, edit, seed, style, champ,
   *   status: 'hit' | 'dead' — пік зайшов чи згорів, result: 'won' | 'lost' — справжній результат матчу, score — виграні карти}.
   */
  function poRow(kind, id, o) {
    var cls = 'bt' + (o.champ ? ' champ' : '') + (o.status ? ' ' + o.status : o.picked ? ' on' : '') + (o.result ? ' ' + o.result : '') + (o.was ? ' two' : '') + (o.edit ? '' : ' ro');
    var tip = teamName(id) + (o.liveNow ? ' · матч іде зараз' : '') + (o.score != null ? ' · виграно карт: ' + o.score : o.pct != null ? ' · ' + o.what + ' з шансом ' + fmtPct(o.pct) : '') +
      (o.status === 'hit' ? ' · пік зайшов' : o.status === 'dead' ? ' · пік згорів' : o.status === 'miss' ? ' · твій пік тут — ' + teamName(o.was) + ', не пройшов' : o.picked ? ' · твій пік' : '') +
      (o.result === 'won' ? ' · пройшла далі' : o.result === 'lost' ? ' · вибула' : '');
    var mark = o.status === 'hit' ? ICON.check : o.status === 'dead' || o.status === 'miss' ? ICON.x : o.picked && !o.champ ? ICON.check : '';
    return '<button class="' + cls + '"' + (o.style ? ' style="' + o.style + '"' : '') + ' data-po="' + kind + '" data-id="' + esc(id) +
      '" aria-pressed="' + (o.picked ? 'true' : 'false') + '" data-tip="' + esc(tip) + '" aria-label="' + esc(tip) + '">' +
      (o.seed ? '<span class="bs">' + o.seed + '</span>' : '') + (o.champ ? '<span class="btr">' + ICON.trophy + '</span>' : '') +
      '<span class="bl">' + logoHTML(id, 26) + '</span><span class="bn">' + esc(teamName(id)) + (o.was ? '<small>твій пік: ' + esc(teamName(o.was)) + '</small>' : '') + '</span>' +
      (o.liveNow ? '<span class="blive" aria-hidden="true"></span>' : '') +
      '<span class="bp' + (o.score != null ? ' sc' : '') + '">' + (o.score != null ? esc(String(o.score)) : o.pct != null ? fmtPct(o.pct) : '') + '</span>' +
      '<span class="bc">' + mark + '</span></button>';
  }

  /**
   * Сітка як у грі: чвертьфінали → півфінали → фінал → чемпіон, з лініями-з'єднаннями.
   * B: {matches: [{a, b, pA}], seeds: [id], seedNums?: {id: сід}, team(id) → {pFinal, pChamp},
   *     results?: {qf: [id|null]×4, sf: [id|null]×2, champion}, status? — статуси піків, live? — показувати рахунок};
   * c — картка {qf, sf, champion}; edit — чи можна клікати.
   * У колонках 2–4 стоять команди, яких ти туди поставив; ✓/✗ — чи вони справді туди дійшли.
   */
  function bracketHTML(B, c, edit) {
    var m = B.matches, R = B.results || { qf: [null, null, null, null], sf: [null, null], champion: null }, ST = B.status || null;
    function mIdx(id) { for (var j = 0; j < m.length; j++) if (m[j].a === id || m[j].b === id) return j; return -1; }
    function qfOf(i) { var x = null; c.qf.forEach(function (id) { if (m[i].a === id || m[i].b === id) x = id; }); return x; }
    function sfOf(h) { var x = null; c.sf.forEach(function (id) { var q = mIdx(id); if (q >= 0 && (q < 2 ? 0 : 1) === h) x = id; }); return x; }
    function seedOf(id) { return B.seedNums ? B.seedNums[id] || 0 : B.seeds.indexOf(id) + 1; }
    function sc(round, id) { return B.live ? poMapsWon(round, id) : null; }
    function going(round, id) {                         // матч іде просто зараз (є зіграні карти, але ще не завершено)
      var lm = B.live ? poLiveMatch(round, id) : null;
      return !!lm && !lm.finished && (lm.maps || []).some(function (x) { return x.finished; });
    }
    function stat(v) { return v === 'hit' || v === 'dead' ? v : null; }
    var SH = 44, PG = 6, MG = 22, BLK = 2 * SH + PG, W = 21, GAP = (100 - 4 * W) / 3, H = 4 * BLK + 3 * MG;
    var X = [0, W + GAP, 2 * (W + GAP), 3 * (W + GAP)];
    function qfTop(i, t) { return i * (BLK + MG) + t * (SH + PG); }
    function cQF(i) { return i * (BLK + MG) + SH + PG / 2; }
    function cSF(k) { return (cQF(2 * k) + cQF(2 * k + 1)) / 2; }
    var cF = (cSF(0) + cSF(1)) / 2;
    function at(col, top) { return 'left:' + X[col].toFixed(3) + '%;top:' + top + 'px;width:' + W + '%;height:' + SH + 'px'; }
    function ph(text, style) { return '<div class="bt ph" style="' + style + '">' + esc(text) + '</div>'; }
    var lines = '', onLines = '';
    function x10(p) { return (p * 10).toFixed(1); }
    function pair(col, yA, yB, yOut, win) {               // з'єднання пари з наступною колонкою; win: 0 — верхня, 1 — нижня
      var xr = x10(X[col] + W), xm = x10(X[col] + W + GAP / 2), xn = x10(X[col + 1]);
      lines += 'M' + xr + ' ' + yA + 'H' + xm + 'M' + xr + ' ' + yB + 'H' + xm + 'M' + xm + ' ' + yA + 'V' + yB + 'M' + xm + ' ' + yOut + 'H' + xn;
      if (win === 0 || win === 1) onLines += 'M' + xr + ' ' + (win ? yB : yA) + 'H' + xm + 'V' + yOut + 'H' + xn;
    }
    var slots = '';
    // 1. Чвертьфінали: обидві команди, справжній результат і рахунок; синя рамка — твій пік.
    m.forEach(function (mm, i) {
      var w = qfOf(i), rw = R.qf[i];
      [mm.a, mm.b].forEach(function (id, t) {
        if (!id) { slots += ph('Сід ' + [[1, 8], [4, 5], [2, 7], [3, 6]][i][t], at(0, qfTop(i, t))); return; }
        // після матчу тут лише справжній результат; чи вгадано — видно в колонці півфіналів
        slots += poRow('qf', id, { pct: t ? 1 - mm.pA : mm.pA, what: 'пройде у півфінал', picked: w === id && !rw, edit: edit, seed: seedOf(id),
          style: at(0, qfTop(i, t)), result: rw ? (rw === id ? 'won' : 'lost') : null, score: sc(1, id), liveNow: going(1, id) });
      });
      pair(0, qfTop(i, 0) + SH / 2, qfTop(i, 1) + SH / 2, cQF(i), w === mm.a ? 0 : w === mm.b ? 1 : -1);
    });
    // Колонки 2–4: поки матч не зіграно — твій пік (✗, якщо команда вже вибула); після — хто справді пройшов,
    // ✓ якщо це твій пік, ✗ з підписом «твій пік: …», якщо ні.
    function slot(kind, real, pick, o, deadNow) {
      var id = real || pick;
      if (!id) return null;
      o.edit = edit;
      if (real) {
        o.status = pick === real ? 'hit' : pick ? 'miss' : null;
        if (pick && pick !== real) o.was = pick;
      } else if (pick && deadNow) o.status = 'dead';
      return poRow(kind, id, o);
    }
    for (var i = 0; i < 4; i++) {
      var q = qfOf(i), half = i < 2 ? 0 : 1, real = R.qf[i], rs = R.sf[half], id = real || q;
      slots += slot('sf', real, q, { pct: rs ? null : id ? B.team(id).pFinal : null, what: 'дійде до фіналу', style: at(1, cQF(i) - SH / 2),
          picked: !!q && q === id && sfOf(half) === q && !rs, result: real && rs ? (rs === real ? 'won' : 'lost') : null,
          score: real ? sc(2, real) : null, liveNow: !!real && going(2, real) }, ST && q && ST.qf[q] === 'dead')
        || ph('Переможець ЧФ ' + (i + 1), at(1, cQF(i) - SH / 2));
    }
    [0, 1].forEach(function (k) {
      var a = qfOf(2 * k), b = qfOf(2 * k + 1), w = sfOf(k), real = R.sf[k], id = real || w;
      pair(1, cQF(2 * k), cQF(2 * k + 1), cSF(k), w && w === a ? 0 : w && w === b ? 1 : -1);
      slots += slot('champion', real, w, { pct: R.champion ? null : id ? B.team(id).pChamp : null, what: 'стане чемпіоном', style: at(2, cSF(k) - SH / 2),
          picked: !!w && w === id && c.champion === w && !R.champion, result: real && R.champion ? (R.champion === real ? 'won' : 'lost') : null,
          score: real ? sc(3, real) : null, liveNow: !!real && going(3, real) }, ST && w && ST.sf[w] === 'dead')
        || ph('Переможець ПФ ' + (k + 1), at(2, cSF(k) - SH / 2));
    });
    var f0 = sfOf(0), f1 = sfOf(1);
    pair(2, cSF(0), cSF(1), cF, c.champion && c.champion === f0 ? 0 : c.champion && c.champion === f1 ? 1 : -1);
    slots += slot('champion', R.champion, c.champion, { pct: R.champion ? null : B.team(R.champion || c.champion).pChamp, what: 'стане чемпіоном',
        style: at(3, cF - SH / 2), champ: true, picked: !!c.champion && !R.champion }, ST && c.champion && ST.champion === 'dead')
      || ph('Чемпіон', at(3, cF - SH / 2));
    return '<div class="bk-wrap"><div class="bk-in"><div class="bk-head">' + [['Чвертьфінали', 'Bo3'], ['Півфінали', 'Bo3'], ['Фінал', 'Bo5'], ['Чемпіон', '']].map(function (h, j) {
      return '<span style="left:' + X[j].toFixed(3) + '%;width:' + W + '%">' + h[0] + (h[1] ? '<small>' + h[1] + '</small>' : '') + '</span>';
    }).join('') + '</div><div class="bk" style="height:' + H + 'px"><svg class="bk-lines" viewBox="0 0 1000 ' + H + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<path d="' + lines + '"/>' + (onLines ? '<path class="on" d="' + onLines + '"/>' : '') + '</svg>' + slots + '</div></div></div>';
  }

  function renderPlayoffs() {
    var el = $('poView'), po = state.po;
    if (!po) {
      el.innerHTML = '<div class="card"><div class="busy"><span class="spinner"></span>' +
        (state.poErr ? 'Помилка розрахунку: ' + esc(state.poErr) : state.live ? 'Програю мейджор до фіналу…' : 'Завантажую результати…') + '</div></div>';
      return;
    }
    var stale = state.poBusy || state.poStale, B = poBracket(), html = '';
    if (!po.bracketKnown) {
      var none = { a: null, b: null, pA: null };
      html += '<section class="card po-main"><div class="label">Сітка плей-оф</div>' +
        '<p class="hint">Хто пройде в плей-оф, ще невідомо. Сітка заповниться, коли завершиться Stage 3 (≈ 9 грудня), — тоді тут можна буде обрати свої 7 піків.</p>' +
        bracketHTML({ matches: [none, none, none, none], seeds: [], team: function () { return {}; } }, poNorm(null), false) + '</section>';
    }
    if (B) {
      var c = poNorm(poCard()), edit = canEdit(PO), u = B.user, real = B.real, tp = {};
      B.teams.forEach(function (t) { tp[t.id] = t; });
      var fresh = !stale && po.meta === state.profile && po.tag === poKey(c);
      var bracket = bracketHTML({ matches: B.matches, seeds: B.seeds, seedNums: real ? po.seedNums : null, team: function (id) { return tp[id] || { id: id }; },
        results: real ? po.results : null, status: real && fresh && u ? u.status : null, live: real }, c, edit);
      // скільки піків картки справді стоїть у цій сітці
      var n = poPicks(c), onGrid = (u && fresh ? u.card.qf.length + u.card.sf.length + (u.card.champion ? 1 : 0) : n);
      var chs = u && u.status ? u.status.challenges : {};
      var tiles = n && u ? '<div class="tiles' + (fresh ? '' : ' is-stale') + '">' +
        [['≥ 2 чвертьфінали', u.pQF, 'обрано ' + u.card.qf.length + ' з 4', chs.qf], ['≥ 1 півфінал', u.pSF, 'обрано ' + u.card.sf.length + ' з 2', chs.sf],
          ['Чемпіон', u.pChamp, u.card.champion ? teamName(u.card.champion) : 'не обрано', chs.champ]].map(function (t) {
          var v = t[3] === 'hit' ? '<span class="tile-ok">' + ICON.check + 'Виконано</span>' : t[3] === 'dead' ? '<span class="tile-no">' + ICON.x + 'Не вийшло</span>' : fmtPct(t[1]);
          return '<div class="tile' + (t[3] === 'hit' ? ' hit' : t[3] === 'dead' ? ' dead' : '') + '"><div class="tile-v">' + v + '</div><div class="tile-l">' + esc(t[0]) +
            '</div><div class="tile-s">' + esc(t[2]) + '</div></div>';
        }).join('') + '</div><p class="fine">У середньому зайде ' + u.expected.toFixed(2).replace('.', ',') + ' з 3 викликів · усі три — ' + fmtPct(u.pAll) +
        (onGrid < n ? '. Ще ' + (n - onGrid) + ' ' + plural(n - onGrid, 'пік стоїть', 'піки стоять', 'піків стоять') + ' на командах, яких у цій сітці немає.' : '') + '</p>'
        : '<p class="hint">Натискай на команди в сітці — тут з\'являться шанси на кожен із трьох викликів.</p>';
      var b = B.best, best = '<p class="fine">Рахую…</p>';
      if (b) {
        var same = n === 7 && poKey(c) === poKey(poNorm(b.card));
        best = '<div class="' + (stale ? 'is-stale' : '') + '"><div class="stat"><span class="stat-v">' + b.expected.toFixed(2).replace('.', ',') + '</span><span class="stat-l">викликів із 3 у середньому</span></div>' +
          '<div class="groups">' + [['У півфінал', b.card.qf], ['У фінал', b.card.sf], ['Чемпіон', b.card.champion ? [b.card.champion] : []]].map(function (g) {
            return '<div class="grp"><span class="gl">' + g[0] + '</span><div class="chips">' + g[1].map(function (id) {
              return '<span class="chip"><span class="cl">' + logoHTML(id, 20) + '</span>' + esc(teamName(id)) + '</span>';
            }).join('') + '</div></div>';
          }).join('') + '</div><p class="fine">≥ 2 чвертьфінали — ' + fmtPct(b.pQF) + ' · ≥ 1 півфінал — ' + fmtPct(b.pSF) + ' · чемпіон — ' + fmtPct(b.pChamp) + ' · усі три — ' + fmtPct(b.pAll) + '</p></div>' +
          (same ? '<div class="delta neutral">Твоя картка вже така</div>' : edit ? '<div class="actions"><button class="btn primary" data-act="apply-po">Застосувати</button></div>' : '');
      }
      var who = state.profiles.length > 1 ? ' · картка «' + esc(profileName(state.profile)) + '»' : '';
      var hint = !edit ? 'Картку закрито — стадія вже почалась, піки змінити не можна.'
        : real ? 'Натискай на команду, і вона пройде далі по сітці: чвертьфінали → півфінали → фінал → чемпіон. Відсоток — шанс за моделлю.'
        : 'Пари поки прогнозовані: справжні стануть відомі після Stage 3 (≈ 9 грудня). Свої піки можеш накидати вже зараз — натискай на команду, і вона пройде далі. Якщо сітка зміниться, піки команд, яких у ній не буде, зникнуть.';
      html += '<section class="card po-main' + (stale ? ' is-stale' : '') + '"><div class="label">' + (real ? 'Сітка плей-оф' : 'Прогноз сітки') + who + '</div>' +
        '<p class="hint">' + hint + '</p>' + bracket + '<p class="savestate" id="poSave"></p></section>' +
        '<div class="duo po-duo"><section class="card"><div class="label">Твої виклики' + (real ? '' : ' · якщо сітка буде такою') + '</div>' + tiles + '</section>' +
        '<section class="card"><div class="label">Рекомендація' + (real ? '' : ' · піки моделі') + '</div><p class="hint">Картка з найбільшою середньою кількістю виконаних викликів' +
        (real ? '' : ' для цієї сітки') + '</p>' + best + '</section></div>';
      if (real) html += '<p class="fine">' + (po.source === 'liquipedia' ? 'Сітка і результати — з Liquipedia, оновлюються самі. ✓ / ✗ у колонках праворуч — чи дійшли туди команди, яких ти туди поставив.'
        : 'Сітку пораховано за підсумками Stage 3; щойно її заповнять на Liquipedia, сайт візьме сітку й результати звідти.') + '</p>';
    }
    if (!po.bracketKnown) {
      var rows = po.teams.filter(function (t) { return state.poAll || t.pReach >= 0.02; });
      var maxC = Math.max.apply(null, po.teams.map(function (t) { return t.pChamp; }).concat([1e-9]));
      html += '<section class="card"><div class="label">Хто дійде до плей-оф і хто виграє</div>' +
        '<p class="hint">Шанси за ' + po.sims.toLocaleString('uk-UA') + ' симуляціями всього мейджора: від нинішніх результатів до фіналу.</p>' +
        '<div class="table-wrap' + (stale ? ' is-stale' : '') + '"><table class="tbl po-t"><caption class="sr">Шанси команд у плей-оф</caption>' +
        '<thead><tr><th>Команда</th><th>У плей-оф</th><th>Півфінал</th><th>Фінал</th><th>Чемпіон</th></tr></thead><tbody>' + rows.map(function (t) {
          return '<tr><td class="team"><span class="tw"><span class="tl">' + logoHTML(t.id, 26) + '</span><span>' + esc(t.name || t.id) + '</span></span></td><td>' + fmtPct(t.pReach) +
            '</td><td>' + fmtPct(t.pSF) + '</td><td>' + fmtPct(t.pFinal) + '</td><td class="champ"><span class="cv">' + fmtPct(t.pChamp) + '</span><span class="bar"><i style="width:' +
            Math.min(100, t.pChamp / maxC * 100).toFixed(1) + '%"></i></span></td></tr>';
        }).join('') + '</tbody></table></div>' +
        (po.teams.length > rows.length || state.poAll ? '<p class="fine"><button class="linkbtn" data-act="po-all">' + (state.poAll ? 'Лише головні претенденти' : 'Усі команди (' + po.teams.length + ')') + '</button></p>' : '') +
        '</section>';
    }
    el.innerHTML = html;
    renderSaveState();
  }

  // ------------------------------------------------------------ поділитися ---
  // Картка як картинка (PNG) і як текст — щоб надіслати друзям у месенджер. Усе робиться тут, на твоєму Mac.
  var share = { blob: null, name: '', text: '', st: null };
  var logoImgs = {};
  function logoImage(id) {
    var lg = LOGOS[id], file = lg && (lg.dark || lg.light);
    if (!file) return Promise.resolve(null);
    if (!logoImgs[file]) logoImgs[file] = new Promise(function (res) {
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = function () { res(null); };
      im.src = 'web/logos/' + encodeURIComponent(file);
    });
    return logoImgs[file];
  }
  /** Що показувати в картці для друзів: піки зі статусами (лише за реальними даними) і шанс. */
  function shareData(st) {
    var pid = state.profile, who = pid === 'me' ? 'Мій Pick\'Em' : 'Pick\'Em «' + profileName(pid) + '»';
    var d = { st: st, title: who + ' · ' + stageCfg(st).name, groups: [], chance: null, chanceLabel: '', foot: '' };
    if (st === PO) {
      var c = poNorm(poCard()), B = poBracket(), u = B && B.user && state.po.tag === poKey(c) && state.po.meta === pid ? B.user : null;
      var S = u && u.status && B.real ? u.status : null;
      d.groups = [
        { label: 'У півфінал', color: 'blue', ids: c.qf, st: function (id) { return S ? S.qf[id] : null; } },
        { label: 'У фінал', color: 'green', ids: c.sf, st: function (id) { return S ? S.sf[id] : null; } },
        { label: 'Чемпіон', color: 'gold', ids: c.champion ? [c.champion] : [], st: function () { return S ? S.champion : null; } }];
      if (u && poPicks(c) === 7) { d.chance = u.expected.toFixed(2).replace('.', ',') + ' / 3'; d.chanceLabel = 'викликів у середньому'; }
      d.foot = B && !B.real ? 'сітка ще прогнозована' : '';
    } else {
      var k = normCard(cardOf(st)), r = state.res[st], live = !wiActive() && progress(st).started;
      function sf(sl) { return function (id) { var v = live ? statusOf(id, sl, r) : null; return v === 'open' ? null : v; }; }
      d.groups = [
        { label: '3:0', color: 'green', ids: k.p30, st: sf('p30') },
        { label: '3:1 / 3:2', color: 'blue', ids: k.adv, st: sf('adv') },
        { label: '0:3', color: 'red', ids: k.p03, st: sf('p03') }];
      var p5 = userP5(st);
      if (p5 != null) { d.chance = fmtPct1(p5); d.chanceLabel = 'шанс, що зайде 5+'; d.foot = 'шанс за ' + SIMS.toLocaleString('uk-UA') + ' симуляцій'; }
    }
    return d;
  }
  function shareTextOf(d) {
    var out = [d.title + ' — PGL Major Singapore 2026'];
    d.groups.forEach(function (g) {
      if (!g.ids.length) return;
      out.push(g.label + ' — ' + g.ids.map(function (id) { var v = g.st(id); return teamName(id) + (v === 'hit' ? ' ✓' : v === 'dead' ? ' ✗' : ''); }).join(', '));
    });
    if (d.chance) out.push((d.chanceLabel.charAt(0).toUpperCase() + d.chanceLabel.slice(1)) + ': ' + d.chance + ' (cs2predict)');
    return out.join('\n');
  }

  var C = { bg: '#0e1014', panel: '#171a20', chip: '#22262e', ink: '#f1f4f8', muted: '#9aa4b2', logo: '#2b313b',
    green: ['#34c77b', 'rgba(31,174,98,.16)'], blue: ['#62adf0', 'rgba(58,151,230,.16)'], red: ['#ff7b7e', 'rgba(240,86,90,.16)'], gold: ['#fab219', 'rgba(250,178,25,.16)'] };
  var FONT = '-apple-system, system-ui, "Segoe UI", sans-serif';
  function rr(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
  function fitText(x, t, w) {
    if (x.measureText(t).width <= w) return t;
    while (t.length > 1 && x.measureText(t + '…').width > w) t = t.slice(0, -1);
    return t + '…';
  }
  function drawChip(x, id, X, Y, w, h, status, imgs) {
    rr(x, X, Y, w, h, 14); x.fillStyle = C.chip; x.fill();
    if (status) { x.lineWidth = 2; x.strokeStyle = status === 'hit' ? C.green[0] : C.red[0]; x.stroke(); }
    var R = Math.round(h * 0.34), cx = X + 14 + R, cy = Y + h / 2, im = imgs[id];
    x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2);
    if (im) { x.fillStyle = C.logo; x.fill(); var s2 = R * 2 * 0.74, k = Math.min(s2 / im.width, s2 / im.height); x.drawImage(im, cx - im.width * k / 2, cy - im.height * k / 2, im.width * k, im.height * k); }
    else {
      var ts = TEAM_STYLE[id], tag = ts ? ts[1] : teamName(id).replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase();
      x.fillStyle = ts ? ts[0] : '#64748b'; x.fill();
      x.fillStyle = ts && ts[2] ? '#111' : '#fff'; x.font = '800 ' + Math.round(R * (tag.length <= 2 ? 0.8 : 0.62)) + 'px ' + FONT;
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(tag, cx, cy + 1); x.textAlign = 'left'; x.textBaseline = 'alphabetic';
    }
    var tx = cx + R + 14, room = X + w - tx - (status ? 40 : 14);
    x.fillStyle = status === 'dead' ? C.muted : C.ink;
    var fs = 22;                                     // довга назва: спершу менший шрифт, лише потім «…»
    do { x.font = '700 ' + fs + 'px ' + FONT; } while (x.measureText(teamName(id)).width > room && --fs > 16);
    var name = fitText(x, teamName(id), room);
    x.fillText(name, tx, cy + 8);
    if (status === 'dead') { var nw = x.measureText(name).width; x.fillRect(tx, cy, nw, 2); }
    if (status) {
      var ix = X + w - 26, iy = cy;
      x.beginPath(); x.arc(ix, iy, 12, 0, Math.PI * 2); x.fillStyle = status === 'hit' ? C.green[0] : C.red[0]; x.fill();
      x.strokeStyle = '#0e1014'; x.lineWidth = 3; x.lineCap = 'round'; x.beginPath();
      if (status === 'hit') { x.moveTo(ix - 5, iy); x.lineTo(ix - 1, iy + 4); x.lineTo(ix + 6, iy - 4); }
      else { x.moveTo(ix - 4.5, iy - 4.5); x.lineTo(ix + 4.5, iy + 4.5); x.moveTo(ix + 4.5, iy - 4.5); x.lineTo(ix - 4.5, iy + 4.5); }
      x.stroke();
    }
  }
  /** Малює картку (1200×675, у 2× щільності) і повертає canvas. */
  function drawShare(d) {
    var W = 1200, H = d.st === PO ? 540 : 675, cv = document.createElement('canvas'), imgs = {}, all = [];
    cv.width = W * 2; cv.height = H * 2;
    d.groups.forEach(function (g) { all = all.concat(g.ids); });
    return Promise.all(all.map(function (id) { return logoImage(id).then(function (im) { imgs[id] = im; }); })).then(function () {
      var x = cv.getContext('2d');
      x.scale(2, 2);
      x.fillStyle = C.bg; x.fillRect(0, 0, W, H);
      x.fillStyle = C.ink; x.font = '800 40px ' + FONT; x.fillText(fitText(x, d.title, d.chance ? 760 : 1100), 48, 82);
      x.fillStyle = C.muted; x.font = '500 22px ' + FONT; x.fillText('PGL Major Singapore 2026', 48, 118);
      if (d.chance) {
        x.textAlign = 'right';
        x.fillStyle = C.ink; x.font = '800 52px ' + FONT; x.fillText(d.chance, W - 48, 84);
        x.fillStyle = C.muted; x.font = '500 20px ' + FONT; x.fillText(d.chanceLabel, W - 48, 116);
        x.textAlign = 'left';
      }
      function box(g, X, Y, w, h, cols) {
        var col = C[g.color];
        rr(x, X, Y, w, h, 18); x.fillStyle = col[1]; x.fill();
        x.fillStyle = col[0]; x.font = '800 30px ' + FONT; x.fillText(g.label, X + 22, Y + 44);
        var gap = 14, cw = (w - 44 - gap * (cols - 1)) / cols, ch = 62;
        g.ids.forEach(function (id, i) {
          var r = Math.floor(i / cols), c2 = i % cols;
          drawChip(x, id, X + 22 + c2 * (cw + gap), Y + 64 + r * (ch + 12), cw, ch, g.st(id), imgs);
        });
      }
      var G = d.groups;
      if (d.st === PO) {
        box(G[0], 48, 150, W - 96, 150, 4);
        box(G[1], 48, 324, 700, 150, 2);
        box(G[2], 772, 324, W - 820, 150, 1);
      } else {
        box(G[0], 48, 150, (W - 120) / 2, 150, 2);
        box(G[2], 72 + (W - 120) / 2, 150, (W - 120) / 2, 150, 2);
        box(G[1], 48, 324, W - 96, 224, 3);
      }
      x.fillStyle = C.muted; x.font = '500 18px ' + FONT;
      x.fillText('cs2predict' + (d.foot ? ' · ' + d.foot : '') + ' · ' + new Date().toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' }), 48, H - 36);
      return cv;
    });
  }

  function shareModal() {
    var st = state.stage;
    if (!picksIn(st)) { toast('Спершу додай у картку хоча б одну команду.'); return; }
    var d = shareData(st), pid = state.profile;
    share = { blob: null, text: shareTextOf(d), st: st,
      name: 'pickem-' + st + (pid === 'me' ? '' : '-' + profileName(pid).replace(/[\\/:*?"<>|\s]+/g, '-')) + '.png' };
    openModal('<h3>Поділитися карткою</h3><p>Картинку можна вставити в Telegram, Viber чи інший месенджер (Cmd+V) або зберегти файлом.</p>' +
      '<div class="share-prev" id="sharePrev"><span class="spinner"></span></div>' +
      '<div class="share-acts"><button class="btn primary" data-act="share-img">Скопіювати картинку</button><button class="btn" data-act="share-dl">Зберегти PNG</button>' +
      '<button class="btn" data-act="share-txt">Скопіювати текстом</button><button class="btn" data-act="share-native" id="shareNative" hidden>Надіслати…</button>' +
      '<span class="grow"></span><button type="button" class="btn" data-act="modal-cancel">Закрити</button></div>', null, 'wide');
    drawShare(d).then(function (cv) {
      cv.toBlob(function (b) {
        share.blob = b;
        var box = $('sharePrev');
        if (!box || !b) return;
        box.innerHTML = '<img alt="' + esc(d.title) + '" src="' + URL.createObjectURL(b) + '">';
        var f = new File([b], share.name, { type: 'image/png' }), nb = $('shareNative');
        if (nb && navigator.canShare && navigator.canShare({ files: [f] })) nb.hidden = false;
      }, 'image/png');
    }).catch(function () { var box = $('sharePrev'); if (box) box.innerHTML = '<p class="fine">Не вдалося намалювати картинку — скопіюй текстом.</p>'; });
  }
  function shareCopyImage() {
    if (!share.blob) { toast('Ще малюю картинку…'); return; }
    if (!navigator.clipboard || typeof ClipboardItem === 'undefined') { toast('Цей браузер не копіює картинки — натисни «Зберегти PNG».'); return; }
    navigator.clipboard.write([new ClipboardItem({ 'image/png': share.blob })])
      .then(function () { toast('Картинку скопійовано — встав її в чат (Cmd+V).'); })
      .catch(function () { toast('Не вдалося скопіювати — натисни «Зберегти PNG».'); });
  }
  function shareDownload() {
    if (!share.blob) { toast('Ще малюю картинку…'); return; }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(share.blob); a.download = share.name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    toast('Картинку збережено в «Завантаження»: ' + share.name);
  }
  function shareCopyText() {
    if (!navigator.clipboard) { toast('Цей браузер не дає копіювати.'); return; }
    navigator.clipboard.writeText(share.text).then(function () { toast('Текст скопійовано — встав його в чат.'); })
      .catch(function () { toast('Не вдалося скопіювати текст.'); });
  }
  function shareNative() {
    if (!share.blob || !navigator.share) return;
    navigator.share({ files: [new File([share.blob], share.name, { type: 'image/png' })], text: share.text }).catch(function () { /* скасовано */ });
  }

  // ------------------------------------------------ симулятор стадії (web/sim.js) ---
  var simReady = false;
  function loadAsset(src, css) {
    return new Promise(function (res, rej) {
      var v = window.CS2P_V ? '?v=' + encodeURIComponent(window.CS2P_V) : '', n;
      if (css) { n = document.createElement('link'); n.rel = 'stylesheet'; n.href = src + v; }
      else { n = document.createElement('script'); n.src = src + v; }
      n.onload = res; n.onerror = rej; document.head.appendChild(n);
    });
  }
  loadAsset('web/sim.css', true).catch(function () {});
  (window.Engine ? Promise.resolve() : loadAsset('web/engine.js')).then(function () { return loadAsset('web/sim.js'); })
    .then(function () { simReady = true; if (state.stage) render(); }).catch(function () {});
  /** Припущення симулятора: winners {"a|b": id | null}; пари раунду, якого ще немає на Liquipedia, запам'ятовуємо. */
  function simSet(st, round, pairs, winners) {
    var wi = state.whatIf[st] || (state.whatIf[st] = {}), as = wi[round] || (wi[round] = {});
    if (!liveMatches(st).some(function (m) { return m.round === round; })) (state.wiPairs[st] || (state.wiPairs[st] = {}))[round] = pairs;
    Object.keys(winners).forEach(function (k) { if (winners[k]) as[k] = winners[k]; else delete as[k]; });
    if (!Object.keys(as).length) { delete wi[round]; if (state.wiPairs[st]) delete state.wiPairs[st][round]; }
  }
  function renderSim() {
    var st = state.stage, el = document.getElementById('simCard');
    if (!el) {
      var nx = document.getElementById('next');
      if (!nx) return;
      el = document.createElement('section'); el.id = 'simCard'; el.className = 'card sim-card';
      var host = nx.parentNode && nx.parentNode.classList.contains('duo') ? nx.parentNode : nx;
      host.parentNode.insertBefore(el, host);
    }
    if (st === PO || !simReady || !window.SwissSim || !state.cfg || !state.live) { el.hidden = true; return; }
    var c = cardOf(st), r = state.res[st];
    window.SwissSim.render(el, {
      stage: st, cfg: state.cfg,
      live: function () { return liveForWorker(true); }, realLive: function () { return liveForWorker(false); },
      card: normCard(c), teamName: teamName, logo: logoHTML, esc: esc, fmtPct: fmtPct1,
      p5: r && complete(c) && r.tag === cardKey(c) ? r.p5 : null, running: !!state.running[st],
      set: function (round, pairs, w) { simSet(st, round, pairs, w); },
      resetFrom: function (round) { dropWhatIfAfter(st, round - 1); },
      commit: onScenarioChanged
    });
  }
  // ------------------------------------------------------- змагання з друзями ---
  // Без сервера й реєстрації: кожен надсилає посилання зі своїми картками (web/league.js), друзі відкривають
  // його — і отримують тебе окремим профілем. Нове посилання від того самого друга оновлює його картки.
  function loadMe() {
    var m = lsJSON('cs2p-me');
    if (!m || typeof m.u !== 'string' || !League.UID.test(m.u)) m = { u: League.newUid(), n: '' };
    if (typeof m.n !== 'string') m.n = '';
    state.me = m;
    lsSet('cs2p-me', JSON.stringify(m));
  }
  function myName() { var n = state.me.n || profileName('me'); return n && n !== 'Я' ? n : ''; }
  function knownTeams() { var o = {}; Object.keys(teamIndex).forEach(function (id) { o[id] = 1; }); return o; }
  function cardsOfProfile(pid) { var o = {}; STAGES.concat([PO]).forEach(function (st) { o[st] = leagueCard(st, pid); }); return o; }
  function nameKey(n) { return String(n || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function shareBase() { return STATIC ? location.href.replace(/[?#].*$/, '') : PUBLIC_URL; }
  function inviteLinkOf(all) {
    var members = [{ u: state.me.u, n: myName() || 'Друг', t: Date.now(), cards: cardsOfProfile('me') }];
    if (all) state.profiles.forEach(function (p) {
      if (p.id !== 'me' && p.uid) members.push({ u: p.uid, n: p.name, t: (p.t || 1) * 1000, cards: cardsOfProfile(p.id) });
    });
    return League.linkFor(shareBase(), League.encode(members));
  }

  var invite = { link: '' };
  function inviteModal() {
    var picks = STAGES.reduce(function (n, st) { return n + nPicks(cardOf(st, 'me')); }, 0) + poPicks(poCard('me'));
    var linked = state.profiles.some(function (p) { return p.id !== 'me' && p.uid; });
    openModal('<form><h3>Запросити друзів</h3><p>Надішли посилання в чат. Хто його відкриє, побачить твою картку в блоці «Змагання» — і зможе надіслати тобі свою.</p>' +
      '<label class="label" for="meName" style="display:block;margin-bottom:6px">Твоє ім\'я для друзів</label>' +
      '<input id="meName" maxlength="24" value="' + esc(myName()) + '" placeholder="Наприклад, Данило" autocomplete="nickname" style="margin-bottom:12px">' +
      (linked ? '<label class="check"><input type="checkbox" id="inviteAll"> Додати картки всіх друзів — уся компанія одним посиланням</label>' : '') +
      '<div class="linkbox"><input id="inviteLink" readonly aria-label="Посилання для друзів"></div>' +
      (picks ? '' : '<p class="fine">У твоїй картці ще немає піків — друзі побачать тебе без карток. Заповниш — надішли посилання ще раз.</p>') +
      '<p class="fine">Змінив картку — надішли посилання ще раз: воно оновить твою картку в друзів. Картки зберігаються лише в браузерах.</p>' +
      '<div class="actions"><button type="button" class="btn" data-act="modal-cancel">Закрити</button>' +
      '<button type="button" class="btn" data-act="native-link" id="nativeLink" hidden>Надіслати…</button>' +
      '<button class="btn primary">' + ICON.link + 'Скопіювати посилання</button></div></form>', function () { copyInvite(); });
    updateInvite();
  }
  function updateInvite() {
    var nm = $('meName'), all = $('inviteAll'), box = $('inviteLink');
    if (!box) return;
    var n = nm ? League.cleanName(nm.value) || '' : myName();
    if (n !== state.me.n) { state.me.n = n; lsSet('cs2p-me', JSON.stringify(state.me)); }
    invite.link = inviteLinkOf(!!(all && all.checked));
    box.value = invite.link;
    var nb = $('nativeLink');
    if (nb) nb.hidden = !navigator.share;
  }
  function copyInvite() {
    updateInvite();
    if (!myName()) { toast('Вкажи своє ім\'я — так друзі тебе впізнають.'); var nm = $('meName'); if (nm) nm.focus(); return; }
    var box = $('inviteLink');
    function manual() { if (box) { box.focus(); box.select(); } toast('Скопіюй посилання вручну: Cmd+C (на телефоні — довге натискання).'); }
    if (!navigator.clipboard) return manual();
    navigator.clipboard.writeText(invite.link).then(function () { toast('Посилання скопійовано — встав його в чат друзям.'); }).catch(manual);
  }
  function nativeInvite() {
    updateInvite();
    if (!myName()) { toast('Вкажи своє ім\'я — так друзі тебе впізнають.'); return; }
    if (navigator.share) navigator.share({ title: 'cs2predict', text: 'Змагаймося в Pick\'Em PGL Major Singapore!', url: invite.link }).catch(function () { /* скасовано */ });
  }

  function addLinkModal() {
    openModal('<form><h3>Додати друга за посиланням</h3><p>Встав посилання, яке надіслав друг (можна все повідомлення разом із ним).</p>' +
      '<textarea id="joinText" placeholder="https://…#join=…" aria-label="Посилання від друга"></textarea>' +
      '<div class="actions"><button type="button" class="btn quiet" data-act="add-profile">Внести картку вручну</button><span style="flex:1"></span>' +
      '<button type="button" class="btn" data-act="modal-cancel">Скасувати</button><button class="btn primary">Далі</button></div></form>',
    function () {
      var t = League.tokenFrom(($('joinText') || {}).value || '');
      if (!t) { toast('Не бачу тут посилання з карткою — перевір, що скопійовано повністю.'); return; }
      closeModal();
      importToken(t);
    });
    var ta = $('joinText');
    if (ta) ta.focus();
  }

  var pendingJoin = null;
  /** Посилання від друга: показуємо, кого додамо чи оновимо, і чекаємо на підтвердження. */
  function importToken(token) {
    if (!state.cfg || !state.me) { pendingJoin = token; return; }
    var d = League.decode(token, knownTeams());
    if (d.error) { toast('Не вдалося відкрити посилання: ' + d.error + '.'); return; }
    var items = [], self = false;
    d.members.forEach(function (m) {
      if (m.u === state.me.u) { self = true; return; }
      var p = state.profiles.filter(function (x) { return x.id !== 'me' && x.uid === m.u; })[0] ||
        state.profiles.filter(function (x) { return x.id !== 'me' && !x.uid && nameKey(x.name) === nameKey(m.n); })[0] || null;
      items.push({ m: m, p: p, older: !!(p && p.t && m.t && m.t / 1000 < p.t) });
    });
    if (!items.length) { toast(self ? 'Це твоє власне посилання — надішли його друзям.' : 'У посиланні немає карток.'); return; }
    var room = 12 - state.profiles.length, fresh = items.filter(function (x) { return !x.p; }).length;
    function what(x) {
      var sts = Object.keys(x.m.cards).map(function (st) { return stageCfg(st).name; });
      return (x.older ? 'у тебе вже новіша версія — пропущу' : x.p ? 'оновлю картки' + (x.p.name !== x.m.n ? ' профілю «' + x.p.name + '»' : '') : 'новий учасник') +
        ' · ' + (sts.length ? sts.join(', ') : 'поки без карток');
    }
    var all = items.every(function (x) { return x.p; });
    openModal('<form><h3>' + (all ? 'Оновити картки друзів?' : 'Додати в змагання?') + '</h3><ul class="who-list">' + items.map(function (x, i) {
      return '<li><span class="av" style="background:' + (x.p ? profileColor(x.p.id) : PROFILE_COLORS[(state.profiles.length + i) % PROFILE_COLORS.length]) + '">' +
        esc(initial(x.m.n)) + '</span><b>' + esc(x.m.n) + '</b><small>' + esc(what(x)) + '</small></li>';
    }).join('') + '</ul>' + (fresh > room ? '<p class="fine">Учасників може бути не більше 12 — частину не вдасться додати.</p>' : '') +
      '<div class="actions"><button type="button" class="btn" data-act="modal-cancel">Скасувати</button><button class="btn primary">' + (all ? 'Оновити' : 'Додати') + '</button></div></form>',
    function () { applyImport(items); });
  }
  function uniqueName(n) {
    var taken = {};
    state.profiles.forEach(function (p) { taken[nameKey(p.name)] = 1; });
    if (!taken[nameKey(n)]) return n;
    for (var i = 2; i < 100; i++) { var c = Array.from(n).slice(0, 21).join('').trim() + ' ' + i; if (!taken[nameKey(c)]) return c; }
    return n;
  }
  function applyImport(items) {
    var done = [], chain = Promise.resolve();
    items.forEach(function (x) {
      if (x.older) return;
      chain = chain.then(function () {
        var secs = Math.round((x.m.t || Date.now()) / 1000);
        var req = x.p ? { action: 'link', id: x.p.id, uid: x.m.u, t: secs } : { action: 'create', name: uniqueName(x.m.n), uid: x.m.u, t: secs };
        return postJSON('/api/profiles', req).then(function (j) {
          if (j.version) state.version = j.version;
          state.profiles = j.profiles || state.profiles;
          var pid = x.p ? x.p.id : j.profile.id;
          Object.keys(x.m.cards).forEach(function (st) { setCard(st, x.m.cards[st], pid); state.dirty[pk(st, pid)] = true; scheduleSave(st, pid); });
          done.push(x.m.n);
        }).catch(function (e) { toast('Не вдалося додати «' + x.m.n + '»: ' + e.message); });
      });
    });
    chain.then(function () {
      closeModal();
      if (done.length) {
        state.leagueOpen = null;
        showFriends();
        toast((done.length === 1 ? 'У змаганні: ' : 'У змаганні: ') + done.join(', ') + '. Надішли їм і своє посилання.');
      } else render();
    });
  }

  // Справжній стан піків друзів — за зіграними матчами (без «що як» і без симуляцій).
  function realRecords(st) {
    var s = (state.live && state.live[st]) || {}, rec = {}, field = null;
    function r(id) { return rec[id] || (rec[id] = { w: 0, l: 0 }); }
    (s.matches || []).forEach(function (m) {
      if (!m.a || !m.b) return;
      r(m.a); r(m.b);
      if (m.finished && (m.winner === m.a || m.winner === m.b)) { r(m.winner).w++; r(m.winner === m.a ? m.b : m.a).l++; }
    });
    var seeds = (s.seeds || []).filter(function (x) { return x && x.id; });
    if (seeds.length >= 16) { field = {}; seeds.forEach(function (x) { field[x.id] = 1; }); }
    else if (Object.keys(rec).length >= 16) { field = {}; Object.keys(rec).forEach(function (id) { field[id] = 1; }); }
    return { rec: rec, field: field };
  }
  function realStatus(R, id, sl) {
    if (R.field && !R.field[id]) return 'dead';
    var x = R.rec[id] || { w: 0, l: 0 };
    return pickStatus(sl, x.w, x.l);
  }
  function poRealStatus(kind, id) {
    var ms = ((state.live && state.live[PO]) || {}).matches || [];
    function res(round) {
      var m = ms.filter(function (x) { return x.round === round && x.finished && (x.a === id || x.b === id); })[0];
      return m ? (m.winner === id ? 'w' : 'l') : null;
    }
    var q = res(1), s = res(2), f = res(3);
    if (kind === 'qf') return q === 'w' ? 'hit' : q === 'l' ? 'dead' : 'open';
    if (kind === 'sf') return q === 'l' || s === 'l' ? 'dead' : s === 'w' ? 'hit' : 'open';
    return q === 'l' || s === 'l' || f === 'l' ? 'dead' : f === 'w' ? 'hit' : 'open';
  }
  /** Рахунок учасника на стадії: {hit, dead, open, n}. */
  function scoreOf(st, pid) {
    var cnt = { hit: 0, dead: 0, open: 0, n: 0 };
    if (st === PO) {
      var c = leagueCard(PO, pid);
      c.qf.forEach(function (id) { cnt[poRealStatus('qf', id)]++; });
      c.sf.forEach(function (id) { cnt[poRealStatus('sf', id)]++; });
      if (c.champion) cnt[poRealStatus('champion', c.champion)]++;
      cnt.n = poPicks(c);
      return cnt;
    }
    var k = leagueCard(st, pid), R = realRecords(st);
    SLOT_KEYS.forEach(function (sl) { k[sl].forEach(function (id) { cnt[realStatus(R, id, sl)]++; }); });
    cnt.n = nPicks(k);
    return cnt;
  }
  function stageStarted(st) { return st === PO ? poProgress().done > 0 || poProgress().live : progress(st).started; }

  function avatarHTML(pid) { return '<span class="av" style="background:' + profileColor(pid) + '">' + esc(initial(profileName(pid))) + '</span>'; }
  function scoreHTML(sc, started, total) {
    if (!sc.n) return '<span class="muted">немає картки</span>';
    if (!started) return sc.n < total ? '<span class="muted">' + sc.n + '/' + total + ' піків</span>' : '<span class="muted">картка готова</span>';
    return '<span class="score"><span class="ok">✓ ' + sc.hit + '</span><span class="no">✗ ' + sc.dead + '</span>' + (sc.open ? '<span class="op">' + sc.open + ' у грі</span>' : '') + '</span>';
  }
  function friendDetails(st, pid, cols) {
    var p = state.profiles.filter(function (x) { return x.id === pid; })[0], body;
    if (st === PO) {
      var c = leagueCard(PO, pid);
      body = '<div class="groups">' + [['qf', 'У півфінал', c.qf], ['sf', 'У фінал', c.sf], ['champion', 'Чемпіон', c.champion ? [c.champion] : []]].map(function (g) {
        if (!g[2].length) return '';
        return '<div class="grp"><span class="gl">' + g[1] + '</span><div class="chips">' + g[2].map(function (id) {
          var s = poRealStatus(g[0], id);
          return '<span class="chip' + (s !== 'open' ? ' ' + s : '') + '"><span class="cl">' + logoHTML(id, 20) + '</span>' + esc(teamName(id)) + (s === 'hit' ? ICON.check : s === 'dead' ? ICON.x : '') + '</span>';
        }).join('') + '</div></div>';
      }).join('') + '</div>';
    } else {
      var R = realRecords(st);
      body = chipsHTML(leagueCard(st, pid), null, function (id, sl) { var s = realStatus(R, id, sl); return s === 'open' ? null : s; });
    }
    var lc = leagueCard(st, pid);
    if (!(st === PO ? poPicks(lc) : nPicks(lc))) body = '<p class="hint">' + (isClosed(st) && picksIn(st, pid) && !isLinked(pid) ? 'До старту ' + esc(stageCfg(st).name) + ' картки не було — у змаганні вона не рахується.' : 'На ' + esc(stageCfg(st).name) + ' картки ще немає.') + (pid !== 'me' && p && p.uid ? ' Попроси надіслати нове посилання.' : '') + '</p>';
    var when = p && p.t ? new Date(p.t * 1000) : null;
    var acts = '<button class="btn sm" data-act="open-profile" data-id="' + esc(pid) + '">' + (pid === 'me' ? 'Відкрити мою картку' : 'Відкрити картку') + '</button>' +
      (pid !== 'me' ? '<button class="btn sm quiet" data-act="rename-friend" data-id="' + esc(pid) + '">Перейменувати</button>' +
        '<button class="btn sm quiet" data-act="delete-friend" data-id="' + esc(pid) + '">Видалити</button>' : '');
    if (isClosed(st) && !isLinked(pid) && leagueDiffers(st, pid) && (st === PO ? poPicks(lc) : nPicks(lc))) body += '<p class="fine">Це картка до старту стадії. Зміни після старту бачиш лише ти — у змаганні вони не рахуються.</p>';
    return '<tr class="det"><td colspan="' + cols + '">' + body + (when && !isNaN(when) ? '<p class="fine">Посилання від ' + fmtWhen(when) + '</p>' : '') +
      '<div class="actions">' + acts + '</div></td></tr>';
  }

  function renderFriends() {
    var el = friendsBox(), st = state.stage, name = stageCfg(st).name;
    if (!el) return;
    if (state.profiles.length < 2) {
      el.innerHTML = '<section class="card"><div class="empty-state"><h2>Змагайся з друзями</h2>' +
        '<p>Хто вгадає більше піків на мейджорі? Реєстрація не потрібна — картки передаються звичайним посиланням.</p>' +
        '<ol class="steps"><li><b>Заповни картку</b> угорі сторінки.</li><li><b>Надішли посилання</b> друзям у чат — кнопка нижче.</li>' +
        '<li><b>Друзі відкривають його</b> й бачать тебе в таблиці. Хай надішлють свої посилання тобі.</li></ol>' +
        '<div class="actions"><button class="btn primary" data-act="invite">' + ICON.users + 'Запросити друзів</button>' +
        '<button class="btn" data-act="add-link">' + ICON.link + 'Додати за посиланням</button></div></div></section>';
      return;
    }
    var started = stageStarted(st), total = st === PO ? 7 : 10, ids = state.profiles.map(function (p) { return p.id; });
    var cards = st === PO ? null : leagueCards(st), key = cards && Object.keys(cards).length >= 2 ? leagueKey(st, cards) : null;
    var L = state.league[st], res = L && L.res && L.key === key ? L.res : null, busy = !!key && !res && !(L && L.err && L.key === key);
    var rows = ids.map(function (pid) { return { pid: pid, sc: scoreOf(st, pid), x: res ? res.players[pid] : null }; });
    rows.sort(function (a, b) {
      return (!!b.sc.n - !!a.sc.n) || (started ? b.sc.hit - a.sc.hit : 0) || ((b.x ? b.x.eK : 0) - (a.x ? a.x.eK : 0)) ||
        (started ? a.sc.dead - b.sc.dead : 0) || ids.indexOf(a.pid) - ids.indexOf(b.pid);
    });
    var probs = st !== PO, cols = probs ? 5 : 3, pos = 0;
    var head = '<thead><tr><th>#</th><th>Гравець</th><th>' + (started ? 'Вгадано' : 'Картка') + '</th>' +
      (probs ? '<th class="r hide-m" data-tip="Шанс, що в картці зайде 5 або більше піків">Шанс 5+</th><th class="r" data-tip="Частка симуляцій, у яких ця картка вгадала найбільше (нічия ділиться)">Буде першим</th>' : '') + '</tr></thead>';
    var body = rows.map(function (r, i) {
      pos = i + 1;                                   // рівні за вгаданими — за очікуваною кількістю
      var p = state.profiles.filter(function (x) { return x.id === r.pid; })[0], open = state.leagueOpen === r.pid, x = r.x;
      var sub = r.pid === 'me' ? 'це ти' : p && p.uid ? 'за посиланням' : 'внесено вручну';
      var html = '<tr class="row' + (r.pid === 'me' ? ' me' : '') + (open ? ' open' : '') + '" data-lrow="' + esc(r.pid) + '" tabindex="0" aria-expanded="' + open + '">' +
        '<td class="pos' + (pos === 1 && r.sc.n && (started || x) ? ' first' : '') + '">' + (r.sc.n ? pos : '') + '</td>' +
        '<td><div class="who">' + avatarHTML(r.pid) + '<span class="nm">' + esc(profileName(r.pid)) + '<small>' + sub + '</small></span></div></td>' +
        '<td>' + scoreHTML(r.sc, started, total) + '</td>';
      if (probs) {
        html += '<td class="r hide-m">' + (!r.sc.n ? '' : x ? '<span class="big">' + fmtPct(x.p5) + '</span>' : busy ? '…' : '—') + '</td>' +
          '<td class="r">' + (!r.sc.n ? '' : x ? '<span class="big">' + fmtPct(x.pFirst) + '</span><span class="bar"><i style="width:' + Math.min(100, x.pFirst * 100).toFixed(1) + '%"></i></span>' : busy ? '…' : '—') + '</td>';
      }
      return html + '</tr>' + (open ? friendDetails(st, r.pid, cols) : '');
    }).join('');
    var hint = st === PO ? 'Плей-оф: 7 піків — 4 переможці чвертьфіналів, 2 фіналісти і чемпіон.'
      : (started ? 'Хто вгадав більше піків у ' + name + '. ' : 'Стадія ще не почалась — порівнюємо шанси карток. ') +
        'Шанси — за ' + LEAGUE_SIMS.toLocaleString('uk-UA') + ' симуляціями, однаковими для всіх.' + (wiActive() ? ' Без твоїх припущень «що як».' : '') +
        (isClosed(st) ? ' Рахуються картки, збережені до старту стадії — зміни після старту лише для тебе.' : '');
    var note = probs && !key ? '<p class="fine">Шанси з\'являться, коли картки на ' + esc(name) + ' будуть хоча б у двох учасників.</p>'
      : L && L.err && L.key === key ? '<p class="fine">Помилка розрахунку: ' + esc(L.err) + '</p>' : '';
    var html = '<section class="card"><div class="card-h"><h2>Змагання · ' + esc(name) + '</h2>' + (busy ? '<span class="spinner" title="Рахую шанси"></span>' : '') +
      '<button class="btn" data-act="add-link">' + ICON.link + 'Додати за посиланням</button><button class="btn primary" data-act="invite">' + ICON.users + 'Запросити</button></div>' +
      '<p class="hint">' + esc(hint) + ' Натисни на рядок, щоб побачити піки.</p>' +
      '<div class="table-wrap"><table class="lb' + (busy ? ' is-stale' : '') + '"><caption class="sr">Змагання з друзями, ' + esc(name) + '</caption>' + head + '<tbody>' + body + '</tbody></table></div>' + note + '</section>';
    html += totalsHTML();
    el.innerHTML = html;
  }

  /** Загальний залік мейджора: вгадані піки на кожній стадії й монетки (5+). */
  function totalsHTML() {
    var sts = STAGES.concat([PO]).filter(stageStarted);
    if (!sts.length) return '';
    var rows = state.profiles.map(function (p) {
      var cells = sts.map(function (st) { var sc = scoreOf(st, p.id); return sc.n ? sc : null; });
      var tot = cells.reduce(function (n, c) { return n + (c ? c.hit : 0); }, 0);
      var coins = sts.reduce(function (n, st, i) { return n + (st !== PO && cells[i] && cells[i].hit >= 5 ? 1 : 0); }, 0);
      return { pid: p.id, cells: cells, tot: tot, coins: coins };
    }).sort(function (a, b) { return (b.tot - a.tot) || (b.coins - a.coins); });
    return '<section class="card tot"><div class="card-h"><h2>Загальний залік</h2></div><p class="hint">Скільки піків уже вгадано на кожній стадії. ' +
      '<span class="coin" aria-hidden="true">5</span> — уже 5+ на стадії (монетка Pick\'Em росте).</p>' +
      '<div class="table-wrap"><table class="lb"><thead><tr><th>Гравець</th>' + sts.map(function (st) { return '<th class="r">' + esc(stageCfg(st).name) + '</th>'; }).join('') +
      '<th class="r">Разом</th></tr></thead><tbody>' + rows.map(function (r) {
        return '<tr' + (r.pid === 'me' ? ' class="me"' : '') + '><td><div class="who">' + avatarHTML(r.pid) + '<span class="nm">' + esc(profileName(r.pid)) + '</span></div></td>' +
          r.cells.map(function (c, i) {
            return '<td class="r cell">' + (c ? c.hit + '<small>/' + (sts[i] === PO ? 7 : 10) + '</small>' + (sts[i] !== PO && c.hit >= 5 ? '<span class="coin" title="5+">5</span>' : '') : '<span class="muted">—</span>') + '</td>';
          }).join('') + '<td class="r"><span class="big">' + r.tot + '</span></td></tr>';
      }).join('') + '</tbody></table></div></section>';
  }

  /** Блок «Змагання з друзями» — перед «Як це рахується», видно на всіх вкладках. */
  function friendsBox() {
    var el = $('friendsBox');
    if (!el) {
      var how = $('how') || document.querySelector('.page > section.more:last-of-type');
      if (!how) return null;
      el = document.createElement('section'); el.id = 'friendsBox'; el.className = 'friends';
      how.parentNode.insertBefore(el, how);
    }
    return el;
  }
  function showFriends() { render(); var el = friendsBox(); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); requestLeague(); }

  // ---------------------------------------------------------- перемикання ---
  function switchStage(st) {
    if (st === state.stage) return;
    state.stage = st; lsSet('stage', st); state.leagueOpen = null; requestLeague();
    state.showVariants = false; state.showAllRoot = false;
    closePicker();
    render();
    if (st === PO) {
      if (!state.po || state.poStale || state.po.meta !== state.profile || state.po.tag !== poKey(poNorm(poCard()))) requestPlayoffs();
      return;
    }
    var c = cardOf(st), r = state.res[st];
    if (!state.running[st] && (!r || state.resStale[st] || (complete(c) && r.tag !== cardKey(c)))) requestRun(st);
    ensureRec(st);
    scheduleProfileStats();
    var x = state.ins[st];
    if (hasInsights(st) && (!x || state.insStale[st] || x.meta !== state.profile || x.tag !== (complete(c) ? cardKey(c) : ''))) requestInsights(st, true);
  }

  // ---------------------------------------------------- підказки і тости ---
  var tipEl = $('tip'), tipFor = null;
  function showTip(el) {
    var text = el.getAttribute('data-tip');
    if (!text) return;
    tipFor = el; tipEl.textContent = text; tipEl.hidden = false;
    var b = el.getBoundingClientRect(), tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
    var x = Math.min(Math.max(8, b.left + b.width / 2 - tw / 2), window.innerWidth - tw - 8);
    var y = b.top - th - 8;
    if (y < 64) y = b.bottom + 8;
    tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
  }
  function hideTip() { tipFor = null; tipEl.hidden = true; }
  document.addEventListener('pointerover', function (e) {
    var el = e.target.closest ? e.target.closest('[data-tip]') : null;
    if (el && !pickerEl.contains(el)) { if (el !== tipFor) showTip(el); } else if (tipFor) hideTip();
  });
  document.addEventListener('pointerout', function (e) { if (!e.relatedTarget) hideTip(); });
  document.addEventListener('focusin', function (e) { var el = e.target.closest ? e.target.closest('[data-tip]') : null; if (el) showTip(el); else hideTip(); });
  window.addEventListener('scroll', function () { hideTip(); closePicker(); }, { passive: true });
  window.addEventListener('resize', closePicker);

  var toastTimer = null;
  function toast(msg, opt) {
    var el = $('toast');
    el.innerHTML = '';
    var span = document.createElement('span');
    span.textContent = msg;
    el.appendChild(span);
    toastUndo = null;
    if (opt && opt.action) {
      var b = document.createElement('button');
      b.textContent = opt.action;
      b.onclick = function () { hideToast(); opt.onAction(); };
      el.appendChild(b);
      if (opt.action === 'Повернути') toastUndo = opt.onAction;
    }
    el.hidden = false;
    toastMs = opt && opt.action ? 15000 : 5000;
    armToast();
  }
  var toastMs = 5000, toastUndo = null;
  function armToast() { clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, toastMs); }
  function hideToast() { clearTimeout(toastTimer); $('toast').hidden = true; toastUndo = null; }
  $('toast').addEventListener('mouseenter', function () { clearTimeout(toastTimer); });
  $('toast').addEventListener('mouseleave', armToast);
  $('toast').addEventListener('focusin', function () { clearTimeout(toastTimer); });
  $('toast').addEventListener('focusout', armToast);

  // ---------------------------------------------------------------- події ---
  document.addEventListener('click', function (e) {
    if (!modalEl.hidden && e.target === modalEl) { closeModal(); return; }
    if (!pickerEl.hidden && !pickerEl.contains(e.target) && !(pickerAnchor && pickerAnchor.contains(e.target))) closePicker();
    var el = e.target.closest('[data-lrow],[data-tab],[data-act],[data-prof],[data-pick-team],[data-place],[data-copy-from],[data-cell],[data-wi],[data-po],.tcard,.pchip');
    if (!el || el.disabled) return;
    var st = state.stage, act = el.dataset.act;
    if (el.dataset.tab) return switchStage(el.dataset.tab);
    if (act === 'profile-menu') { e.stopPropagation(); return profileMenu(el); }
    if (el.dataset.prof && !act) return switchProfile(el.dataset.prof);
    if (el.dataset.pickTeam) { closePicker(); return placeAt(el.dataset.pickTeam, el.dataset.slot, +el.dataset.i); }
    if (el.dataset.place) { closePicker(); return placeAt(el.dataset.place, el.dataset.slot, el.dataset.i != null ? +el.dataset.i : null); }
    if (el.dataset.copyFrom) {
      closePicker();
      return applyCard(st, rawCard(st, el.dataset.copyFrom), 'Картку скопійовано з профілю «' + profileName(el.dataset.copyFrom) + '»');
    }
    if (el.dataset.cell) {
      if (!canEdit(st)) return toastClosed();
      var c = cardOf(st), cur = slotOf(c, el.dataset.cell);
      if (cur === el.dataset.slot) return removePick(el.dataset.cell);
      return placeAt(el.dataset.cell, el.dataset.slot, null);
    }
    if (el.dataset.wi) return setWhatIf(el.dataset.wst, +el.dataset.wr, el.dataset.wa, el.dataset.wb, el.dataset.wi);
    if (el.dataset.po) return poPick(el.dataset.po, el.dataset.id);
    if (act === 'wi-reset') return resetWhatIf();
    if (act === 'apply-ins') return applyInsight(el.dataset.which);
    if (act === 'apply-po') { var PB = poBracket(); if (PB && PB.best) applyCard(PO, PB.best.card, 'Картку плей-оф застосовано'); return; }
    if (act === 'share') return shareModal();
    if (el.dataset.lrow && !act) { state.leagueOpen = state.leagueOpen === el.dataset.lrow ? null : el.dataset.lrow; return keepFocus(renderFriends); }
    if (act === 'friends') return showFriends();
    if (act === 'invite') { closeModal(); return inviteModal(); }
    if (act === 'add-link') return addLinkModal();
    if (act === 'native-link') return nativeInvite();
    if (act === 'open-profile') { switchProfile(el.dataset.id); return window.scrollTo({ top: 0, behavior: 'smooth' }); }
    if (act === 'rename-friend') return renameProfile(el.dataset.id);
    if (act === 'delete-friend') return deleteProfile(el.dataset.id);
    if (act === 'share-img') return shareCopyImage();
    if (act === 'share-dl') return shareDownload();
    if (act === 'share-txt') return shareCopyText();
    if (act === 'share-native') return shareNative();
    if (act === 'po-all') { state.poAll = !state.poAll; return keepFocus(renderPlayoffs); }
    if (act === 'remove') { e.stopPropagation(); closePicker(); return removePick(el.dataset.id); }
    if (act === 'apply') return applyVariant(el.dataset.which);
    if (act === 'fill') return requestOpt(st, 'fill');
    if (act === 'variants') { state.showVariants = !state.showVariants; return keepFocus(renderRec); }
    if (act === 'save') {
      var k = pk(st, state.profile);
      clearTimeout(saveTimers[k]); saveNow(st, state.profile);
      return toast('Картку збережено' + (STATIC ? ' у цьому браузері' : '') + '.');
    }
    if (act === 'random') return randomCard();
    if (act === 'reset') return resetCard();
    if (act === 'add-profile') return addProfile();
    if (act === 'rename-profile') return renameProfile();
    if (act === 'delete-profile') return deleteProfile();
    if (act === 'copy-profile') return copyProfileMenu(pickerAnchor || el);
    if (act === 'modal-cancel') return closeModal();
    if (el.classList.contains('tcard')) {
      if (!canEdit(st)) return toastClosed();
      return pickTeamFor(el, el.dataset.slot, +el.dataset.i);
    }
    if (el.classList.contains('pchip')) {
      if (!canEdit(st)) return toastClosed();
      return pickSlotFor(el, el.dataset.team);
    }
  });
  function trapTab(e, box) {
    var f = Array.prototype.filter.call(box.querySelectorAll('button, input, a[href]'), function (n) { return !n.disabled; });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1], a = document.activeElement;
    if (!box.contains(a)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { if (!modalEl.hidden) closeModal(); else closePicker(); return; }
    if (e.key === 'Tab') {
      if (!modalEl.hidden) return trapTab(e, modalEl);
      if (!pickerEl.hidden && pickerEl.contains(document.activeElement)) return trapTab(e, pickerEl);
    }
    var typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z' || e.key === 'я') && toastUndo && !typing && modalEl.hidden) {
      e.preventDefault(); var u = toastUndo; hideToast(); u(); return;
    }
    var el = e.target;
    if ((e.key === 'Enter' || e.key === ' ') && el.dataset && el.dataset.lrow && el.tagName !== 'BUTTON') { e.preventDefault(); el.click(); return; }
    if ((e.key === 'Enter' || e.key === ' ') && el.classList && el.classList.contains('tcard') && el.tagName !== 'BUTTON') {
      e.preventDefault(); el.click();
    }
  });

  // Перетягування: з ряду команд у слот, між слотами, назад у ряд (прибрати).
  var dragId = null, dragFromCard = false;
  document.addEventListener('dragstart', function (e) {
    var el = e.target.closest && e.target.closest('[draggable="true"][data-team]');
    if (!el) return;
    dragId = el.dataset.team; dragFromCard = el.classList.contains('tcard');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
    el.classList.add('dragging');
    hideTip(); closePicker();
  });
  document.addEventListener('dragend', function () {
    dragId = null;
    document.querySelectorAll('.dragging, .drag-over').forEach(function (n) { n.classList.remove('dragging', 'drag-over'); });
  });
  function dropTarget(e) { return e.target.closest && (e.target.closest('.tcard[data-slot]') || e.target.closest('.box[data-drop]') || e.target.closest('#pool')); }
  document.addEventListener('dragover', function (e) {
    if (!dragId) return;
    var t = dropTarget(e);
    if (!t) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.drag-over').forEach(function (n) { if (n !== t) n.classList.remove('drag-over'); });
    t.classList.add('drag-over');
  });
  document.addEventListener('drop', function (e) {
    if (!dragId) return;
    var t = dropTarget(e), id = dragId;
    if (!t) return;
    e.preventDefault();
    t.classList.remove('drag-over');
    if (t.id === 'pool') return dragFromCard ? removePick(id, true) : undefined;
    if (t.classList.contains('tcard')) return placeAt(id, t.dataset.slot, +t.dataset.i);
    return placeAt(id, t.dataset.drop, null);
  });

  document.addEventListener('change', function (e) {
    var f = e.target && e.target.dataset ? e.target.dataset.flag : null;
    if (f) setFlag(f, !!e.target.checked);
  });

  $('refreshBtn').onclick = function () {
    loadResults(true).then(function (changed) { if (changed) onDataChanged(); else render(); });
  };

  setInterval(function () {
    loadResults(false, true).then(function (changed) {
      if (changed) onDataChanged();
      else if (state.stage) keepFocus(function () { renderTabs(); renderHead(); });
    });
  }, REFRESH_MS);
  setInterval(function () {
    if (!state.stage) return;
    var cl = isClosed(state.stage);
    if (state.lastClosed !== null && cl !== state.lastClosed) render();          // картку щойно закрито — ховаємо кнопки змін
    else keepFocus(function () { renderTabs(); renderHead(); });
    state.lastClosed = cl;
    getJSON('/api/version').then(function (v) {
      if (!v || !v.version) return;
      retryFailedSaves();
      var changed = state.version && v.version !== state.version;
      state.version = v.version;
      if (changed) Promise.all([loadConfig(), loadProfiles(), loadInsights()]).then(loadCards).then(function () {
        STAGES.forEach(function (st) { if (st !== state.stage) requestInsights(st, false); });
        onDataChanged();
      });
    }).catch(function () { /* сервер тимчасово недоступний */ });
  }, POLL_MS);

  window.addEventListener('online', retryFailedSaves);
  window.addEventListener('focus', retryFailedSaves);

  // ---------------------------------------------------------------- старт ---
  window.addEventListener('hashchange', function () {
    var t = League.tokenFrom(location.hash);
    if (t) { history.replaceState(null, '', location.href.replace(/#.*$/, '')); importToken(t); }
  });
  document.addEventListener('input', function (e) { if (e.target && (e.target.id === 'meName' || e.target.id === 'inviteAll')) updateInvite(); });
  newRunWorker(); newOptWorker(); newManyWorker(); newInsWorker(); newPoWorker(); newLeagueWorker();
  loadMe();
  // Посилання від друга (…#join=…): прибираємо його з адресного рядка й пропонуємо додати після завантаження.
  (function () { var t = League.tokenFrom(location.hash); if (t) { pendingJoin = t; history.replaceState(null, '', location.href.replace(/#.*$/, '')); } })();
  STAGES.forEach(function (st) { var f = lsJSON('fit-' + st); if (f && f.key && f.deltas) state.fit[st] = f; });
  (function () { var fl = lsJSON('flags'); if (fl) state.flags = { ai: fl.ai !== false, exp: fl.exp !== false }; })();
  $('refreshBtn').innerHTML = ICON.refresh;
  $('simsN').textContent = SIMS.toLocaleString('uk-UA');
  state.profile = lsGet('profile') || 'me';
  getJSON('web/logos/index.json').then(function (j) { LOGOS = (j && j.logos) || {}; if (state.stage) render(); }).catch(function () {});
  loadConfig().then(function () {
    getJSON('/api/version').then(function (v) { state.version = v.version; }).catch(function () {});
    return loadProfiles();
  }).then(loadCards).then(function () {
    syncFrozen();
    var saved = lsGet('stage');
    state.stage = saved && (state.cfg.stages[saved] || saved === PO) ? saved : 'stage1';
    render();
    return Promise.all([loadResults(false), loadInsights()]);
  }).then(function () {
    if (!lsGet('stage') && state.live) state.stage = defaultStage();
    render();
    requestRun(state.stage);
    ensureRec(state.stage);
    scheduleProfileStats();
    requestInsights(state.stage, true);
    STAGES.forEach(function (st) { if (st !== state.stage) requestInsights(st, false); });
    requestLeague();
    if (pendingJoin) { var t = pendingJoin; pendingJoin = null; importToken(t); }
  }).catch(function (e) {
    $('alerts').innerHTML = '<div class="alert critical"><span class="ai">!</span><span>Не вдалося завантажити сторінку: ' + esc(e && e.message || e) + '</span></div>';
  });
})();
