/* cs2predict — змагання з друзями без сервера: картки передаються посиланням.
 *
 * Посилання: <адреса сайту>#join=<токен>. Токен — base64url від JSON
 *   {"v":1,"m":[{"u":"k3j9x2ab","n":"Данило","t":1764000000,"c":{"1":"a,b|c,d,e,f,g,h|i,j","2":…,"3":…,"p":"q1,q2,q3,q4|s1,s2|ch"}}]}
 * u — випадковий id людини (щоб нове посилання від того самого друга оновило його картки, а не додало дубль),
 * n — ім'я, t — коли створено посилання (секунди), c — картки за стадіями (1, 2, 3, p — плей-оф).
 * Усе після «#» браузер не надсилає на сервер, тож картки друзів не потрапляють у журнали GitHub.
 * Токен — чужі дані: decode() перевіряє кожне поле, зайве відкидає, назви команд бере лише зі списку відомих.
 */
(function (global) {
  'use strict';

  var VERSION = 1, MAX_MEMBERS = 12, MAX_TOKEN = 6000;
  var STAGE_KEYS = { stage1: '1', stage2: '2', stage3: '3', playoffs: 'p' };
  var KEY_STAGES = { '1': 'stage1', '2': 'stage2', '3': 'stage3', p: 'playoffs' };
  var SLOTS = [['p30', 2], ['adv', 6], ['p03', 2]];
  var UID = /^[a-z0-9]{6,16}$/;
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

  // ------------------------------------------------------------ base64url ---
  function toBase64Url(str) {
    var bin = unescape(encodeURIComponent(str)), out = '', i;
    for (i = 0; i < bin.length; i += 3) {
      var a = bin.charCodeAt(i), b = bin.charCodeAt(i + 1), c = bin.charCodeAt(i + 2);
      var n = (a << 16) | ((b || 0) << 8) | (c || 0);
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bin.length ? B64[(n >> 6) & 63] : '') + (i + 2 < bin.length ? B64[n & 63] : '');
    }
    return out;
  }
  function fromBase64Url(s) {
    var bin = '', buf = 0, bits = 0;
    for (var i = 0; i < s.length; i++) {
      var v = B64.indexOf(s.charAt(i));
      if (v < 0) throw new Error('bad base64');
      buf = ((buf << 6) | v) & 0xffffff; bits += 6;
      if (bits >= 8) { bits -= 8; bin += String.fromCharCode((buf >> bits) & 255); }
    }
    return decodeURIComponent(escape(bin));         // зіпсований UTF-8 → виняток
  }

  // ---------------------------------------------------------------- імена ---
  /** Ім'я з посилання: без керівних і невидимих символів, пробіли зведено, не довше 24 символів. */
  function cleanName(name) {
    if (typeof name !== 'string') return null;
    var s = name.replace(/[\u0000-\u001f\u007f-\u009f­​-‏‪-‮⁠-⁯﻿]/g, '')
      .replace(/\s+/g, ' ').trim();
    if (s.normalize) s = s.normalize('NFC');
    var chars = Array.from ? Array.from(s) : s.split('');
    if (!chars.length) return null;
    if (chars.length > 24) s = chars.slice(0, 24).join('').trim();
    return s || null;
  }

  function newUid() {
    var a = '', abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var rnd = global.crypto && global.crypto.getRandomValues ? global.crypto.getRandomValues(new Uint8Array(10)) : null;
    for (var i = 0; i < 10; i++) a += abc[(rnd ? rnd[i] : Math.floor(Math.random() * 256)) % abc.length];
    return a;
  }

  // -------------------------------------------------------------- картки ---
  function swissToStr(c) {
    return SLOTS.map(function (s) { return ((c && c[s[0]]) || []).join(','); }).join('|');
  }
  function poToStr(c) {
    return [(c && c.qf) || [], (c && c.sf) || [], c && c.champion ? [c.champion] : []].map(function (x) { return x.join(','); }).join('|');
  }
  function hasPicks(st, c) {
    if (!c) return false;
    return st === 'playoffs' ? !!((c.qf && c.qf.length) || (c.sf && c.sf.length) || c.champion)
      : !!((c.p30 && c.p30.length) || (c.adv && c.adv.length) || (c.p03 && c.p03.length));
  }

  /** Картка Swiss з рядка: лише відомі команди, кожна один раз, не більше 2 / 6 / 2. */
  function swissFromStr(s, known) {
    if (typeof s !== 'string' || s.length > 400) return null;
    var parts = s.split('|');
    if (parts.length !== 3) return null;
    var out = { p30: [], adv: [], p03: [] }, seen = {}, n = 0;
    SLOTS.forEach(function (sl, i) {
      parts[i].split(',').forEach(function (id) {
        if (id && known[id] && !seen[id] && out[sl[0]].length < sl[1]) { seen[id] = 1; out[sl[0]].push(id); n++; }
      });
    });
    return n ? out : null;
  }
  /** Картка плей-оф з рядка: 4 переможці ЧФ, 2 фіналісти з-поміж них, чемпіон з-поміж фіналістів. */
  function poFromStr(s, known) {
    if (typeof s !== 'string' || s.length > 300) return null;
    var parts = s.split('|');
    if (parts.length !== 3) return null;
    function list(t, max) {
      var o = [];
      t.split(',').forEach(function (id) { if (id && known[id] && o.indexOf(id) < 0 && o.length < max) o.push(id); });
      return o;
    }
    var qf = list(parts[0], 4), sf = list(parts[1], 2).filter(function (id) { return qf.indexOf(id) >= 0; });
    var ch = list(parts[2], 1)[0] || null;
    if (ch && sf.indexOf(ch) < 0) ch = null;
    return qf.length || sf.length || ch ? { qf: qf, sf: sf, champion: ch } : null;
  }

  // -------------------------------------------------------------- токен ---
  /**
   * members: [{u, n, t (мс), cards: {stage1: {p30, adv, p03}, …, playoffs: {qf, sf, champion}}}] → токен.
   * Порожні картки не передаємо.
   */
  function encode(members) {
    var m = members.slice(0, MAX_MEMBERS).map(function (x) {
      var c = {};
      Object.keys(STAGE_KEYS).forEach(function (st) {
        var card = x.cards && x.cards[st];
        if (hasPicks(st, card)) c[STAGE_KEYS[st]] = st === 'playoffs' ? poToStr(card) : swissToStr(card);
      });
      return { u: x.u, n: x.n, t: Math.round((x.t || Date.now()) / 1000), c: c };
    });
    return toBase64Url(JSON.stringify({ v: VERSION, m: m }));
  }

  /**
   * Токен → {members: [{u, n, t (мс), cards: {stage: card}}]} або {error}.
   * known — {id команди: 1}: команди, яких сайт не знає, відкидаємо.
   */
  function decode(token, known) {
    if (typeof token !== 'string' || !token || token.length > MAX_TOKEN || /[^A-Za-z0-9_-]/.test(token)) return { error: 'посилання пошкоджене' };
    var obj;
    try { obj = JSON.parse(fromBase64Url(token)); } catch (e) { return { error: 'посилання пошкоджене' }; }
    if (!obj || typeof obj !== 'object') return { error: 'посилання пошкоджене' };
    if (obj.v !== VERSION) return { error: 'посилання з новішої версії сайту — онови сторінку' };
    if (!Array.isArray(obj.m) || !obj.m.length) return { error: 'у посиланні немає карток' };
    var out = [], seen = {};
    obj.m.slice(0, MAX_MEMBERS).forEach(function (x) {
      if (!x || typeof x !== 'object' || typeof x.u !== 'string' || !UID.test(x.u) || seen[x.u]) return;
      var name = cleanName(x.n);
      if (!name) return;
      var cards = {}, any = false;
      if (x.c && typeof x.c === 'object') Object.keys(KEY_STAGES).forEach(function (k) {
        if (!(k in x.c)) return;
        var st = KEY_STAGES[k], card = st === 'playoffs' ? poFromStr(x.c[k], known) : swissFromStr(x.c[k], known);
        if (card) { cards[st] = card; any = true; }
      });
      var t = typeof x.t === 'number' && isFinite(x.t) && x.t > 0 ? x.t * 1000 : 0;
      seen[x.u] = 1;
      out.push({ u: x.u, n: name, t: t, cards: cards, empty: !any });
    });
    if (!out.length) return { error: 'у посиланні немає жодного гравця' };
    return { members: out };
  }

  /** Токен із тексту: повне посилання (…#join=…) або сам токен. */
  function tokenFrom(text) {
    if (typeof text !== 'string') return null;
    var m = text.match(/[#?&]join=([A-Za-z0-9_-]+)/);
    if (m) return m[1];
    var t = text.trim();
    return /^[A-Za-z0-9_-]{16,}$/.test(t) ? t : null;
  }

  function linkFor(base, token) { return base.replace(/#.*$/, '') + '#join=' + token; }

  global.League = {
    VERSION: VERSION, MAX_MEMBERS: MAX_MEMBERS, UID: UID,
    encode: encode, decode: decode, tokenFrom: tokenFrom, linkFor: linkFor, newUid: newUid, cleanName: cleanName,
    toBase64Url: toBase64Url, fromBase64Url: fromBase64Url, swissFromStr: swissFromStr, poFromStr: poFromStr, hasPicks: hasPicks
  };
})(typeof self !== 'undefined' ? self : this);
