/* cs2predict engine: модель матчу + Swiss-симулятор за правилами Valve + ланцюжок стадій
 * S1 → S2 → S3 + оцінка й оптимізація Pick'Em картки.
 * Чистий JavaScript без залежностей. Працює в браузері (Web Worker); тести — через macOS jsc.
 * Специфікація: docs/research.md («Специфікація Swiss-рушія», «Оптимізатор картки»).
 */
(function (global) {
  'use strict';

  // R4–R5: група з 6, перший рядок без реваншу (Valve Major Supplemental Rulebook).
  var PRIORITY6 = [
    [[1, 6], [2, 5], [3, 4]], [[1, 6], [2, 4], [3, 5]], [[1, 5], [2, 6], [3, 4]], [[1, 5], [2, 4], [3, 6]], [[1, 4], [2, 6], [3, 5]],
    [[1, 4], [2, 5], [3, 6]], [[1, 6], [2, 3], [4, 5]], [[1, 5], [2, 3], [4, 6]], [[1, 3], [2, 6], [4, 5]], [[1, 3], [2, 5], [4, 6]],
    [[1, 4], [2, 3], [5, 6]], [[1, 3], [2, 4], [5, 6]], [[1, 2], [3, 6], [4, 5]], [[1, 2], [3, 5], [4, 6]], [[1, 2], [3, 4], [5, 6]]
  ];

  var DEFAULTS = { scale: 800, sd: 0.2, sims: 50000, seed: 20261124, searchSims: 30000, selectSims: 60000, evalSims: 100000, restarts: 6 };
  var SLOTS = ['p30', 'adv', 'p03'];
  var SLOT_SIZE = { p30: 2, adv: 6, p03: 2 };

  // ------------------------------------------------------------- утиліти ---
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gauss(rng) {
    var u = 0; while (u === 0) u = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
  }

  /** P(виграти серію) з ймовірності виграти карту. */
  function pSeries(p, bo) {
    if (bo === 1) return p;
    if (bo === 3) return p * p * (3 - 2 * p);
    if (bo === 5) return p * p * p * (10 - 15 * p + 6 * p * p);
    throw new Error('bad bo ' + bo);
  }

  /** Сила команд у логіт-шкалі на карту: ln10·(R − R̄)/s, плюс ручні поправки adj. */
  function thetas(teams, scale) {
    var s = scale || DEFAULTS.scale, mean = 0;
    teams.forEach(function (t) { mean += t.vrs; });
    mean /= teams.length;
    return teams.map(function (t) { return Math.LN10 * (t.vrs - mean) / s + (t.adj || 0); });
  }

  function pMapFromTheta(d) { return 1 / (1 + Math.exp(-d)); }

  function slotHit(slot, w, l) {
    if (slot === 'p30') return w === 3 && l === 0;
    if (slot === 'adv') return w === 3 && l > 0;
    return w === 0 && l === 3;                     // p03
  }

  /** Статус піку за вже відомими результатами: 'hit' | 'dead' | 'open'. */
  function pickStatus(slot, w, l) {
    if (slot === 'p30') return l > 0 ? 'dead' : (w === 3 ? 'hit' : 'open');
    if (slot === 'p03') return w > 0 ? 'dead' : (l === 3 ? 'hit' : 'open');
    if (w === 3) return l === 0 ? 'dead' : 'hit';
    return l === 3 ? 'dead' : 'open';
  }

  function roundOk(r) { return r >= 1 && r <= 5 && r % 1 === 0; }

  function pairKey(x, y) { return x < y ? x + '-' + y : y + '-' + x; }

  // ------------------------------------------------------ ядро Swiss ---
  /**
   * Одна Swiss-стадія. Локальні індекси 0..n-1 — це сіди 1..n.
   * th: сила (з шумом) за локальним індексом; known[r]: [{a, b, w}] (w = -1, якщо ще не зіграно).
   * Відому пару беремо, лише якщо вона узгоджена з рекордами цієї симуляції (обидві активні, однаковий W-L);
   * інакше цих команд жеребкуємо самі. Так кожна активна команда грає в кожному раунді.
   * Повертає рекорди, суперників, матчі кожного раунду, фінальний порядок (order) і bad = true,
   * якщо хтось лишився без пари (непарна кількість активних команд — лише при неузгоджених даних).
   */
  function swissCore(n, th, known, bo3All, rng) {
    var w = new Int8Array(n), l = new Int8Array(n), opp = new Array(n), i, bad = false;
    for (i = 0; i < n; i++) opp[i] = [];
    function diff(x) { var s = 0, o = opp[x]; for (var j = 0; j < o.length; j++) s += w[o[j]] - l[o[j]]; return s; }
    function met(a, b) { return opp[a].indexOf(b) >= 0; }
    // рекорд → Buchholz (на момент жеребкування / фінальний) → сід
    function cmp(a, b) { return ((w[b] - l[b]) - (w[a] - l[a])) || (diff(b) - diff(a)) || (a - b); }
    function dfs(g, allowRematch) {
      if (!g.length) return [];
      var top = g[0], rest = g.slice(1);
      for (var k = rest.length - 1; k >= 0; k--) {
        if (!allowRematch && met(top, rest[k])) continue;
        var sub = dfs(rest.slice(0, k).concat(rest.slice(k + 1)), allowRematch);
        if (sub) return [[top, rest[k]]].concat(sub);
      }
      return null;
    }
    function byTable(g) {
      for (var r = 0; r < PRIORITY6.length; r++) {
        var row = PRIORITY6[r], ok = true, pr = [];
        for (var c = 0; c < 3; c++) {
          var a = g[row[c][0] - 1], b = g[row[c][1] - 1];
          if (met(a, b)) { ok = false; break; }
          pr.push([a, b]);
        }
        if (ok) return pr;
      }
      return null;
    }

    var outcomes = [null, [], [], [], [], []];
    for (var r = 1; r <= 5; r++) {
      var pairs = [], used = new Uint8Array(n), kn = known[r] || [], q;
      for (q = 0; q < kn.length; q++) {
        var k = kn[q];
        if (k.a === k.b || used[k.a] || used[k.b] || w[k.a] === 3 || l[k.a] === 3 ||
            w[k.a] !== w[k.b] || l[k.a] !== l[k.b]) continue;          // неузгоджені дані: цих команд жеребкуємо самі
        pairs.push([k.a, k.b, k.w]);
        used[k.a] = used[k.b] = 1;
      }
      if (r === 1) {
        // 1v9, 2v10, … 8v16. Хто лишився без свого суперника (лише при неузгоджених даних) — між собою за сідом.
        var h = Math.floor(n / 2), left = [];
        for (i = 0; i < h; i++) {
          if (!used[i] && !used[i + h]) pairs.push([i, i + h, -1]);
          else if (!used[i]) left.push(i);
          else if (!used[i + h]) left.push(i + h);
        }
        if (n % 2 && !used[n - 1]) left.push(n - 1);
        left.sort(function (x, y) { return x - y; });
        var lh = Math.floor(left.length / 2);
        for (i = 0; i < lh; i++) pairs.push([left[i], left[i + lh], -1]);
        if (left.length % 2) bad = true;
      } else {
        var groups = {}, carry = [];
        for (i = 0; i < n; i++) {
          if (used[i] || w[i] >= 3 || l[i] >= 3) continue;
          var gk = w[i] + '-' + l[i];
          (groups[gk] = groups[gk] || []).push(i);
        }
        Object.keys(groups).sort(function (x, y) {      // від кращого рекорду до гіршого
          var a = x.split('-'), b = y.split('-');
          return (b[0] - b[1]) - (a[0] - a[1]);
        }).forEach(function (key) {
          // Непарна група можлива лише при неузгоджених даних: найнижча команда грає в найближчій нижчій групі.
          var g = carry.concat(groups[key]).sort(cmp);
          carry = g.length % 2 ? [g.pop()] : [];
          if (!g.length) return;
          var pr = (r >= 4 && g.length === 6 ? byTable(g) : null) || dfs(g, false) || dfs(g, true);
          pr.forEach(function (p) { pairs.push([p[0], p[1], -1]); });
        });
        // Залишок після останньої групи означає непарну кількість активних команд: пари для нього немає.
        if (carry.length) bad = true;
      }
      var res = [];
      for (q = 0; q < pairs.length; q++) {
        var a = pairs[q][0], b = pairs[q][1], win = pairs[q][2];
        if (win !== a && win !== b) {
          var bo = (bo3All || w[a] === 2 || l[a] === 2) ? 3 : 1;
          win = rng() < pSeries(pMapFromTheta(th[a] - th[b]), bo) ? a : b;
        }
        res.push({ a: a, b: b, w: win });
      }
      for (q = 0; q < res.length; q++) {           // результати — ПІСЛЯ жеребкування всього раунду
        var m = res[q], lo = m.w === m.a ? m.b : m.a;
        w[m.w]++; l[lo]++; opp[m.a].push(m.b); opp[m.b].push(m.a);
      }
      outcomes[r] = res;
    }
    var order = [];
    for (i = 0; i < n; i++) order.push(i);
    order.sort(cmp);                                 // фінальний порядок: рекорд → фінальний Buchholz → сід
    return { w: w, l: l, opp: opp, outcomes: outcomes, order: order, bad: bad };
  }

  // ------------------------------------------ одна стадія (старий API) ---
  function prepare(stage, known) {
    var teams = stage.teams.slice().sort(function (x, y) { return x.seed - y.seed; });
    var idx = {};
    teams.forEach(function (t, i) { idx[t.id] = i; });
    var byRound = [[], [], [], [], [], []];
    (known || []).forEach(function (k) {
      if (!k.a || !k.b || k.a === k.b || !(k.a in idx) || !(k.b in idx) || !roundOk(k.round)) return;
      byRound[k.round].push({ a: idx[k.a], b: idx[k.b], w: k.winner === k.a ? idx[k.a] : k.winner === k.b ? idx[k.b] : -1 });
    });
    return { teams: teams, idx: idx, n: teams.length, known: byRound, bo3: stage.bo3Policy || 'deciders' };
  }

  function simulateOnce(P, theta, rng, sd) {
    var th = new Float64Array(P.n);
    for (var i = 0; i < P.n; i++) th[i] = theta[i] + (sd ? sd * gauss(rng) : 0);
    return swissCore(P.n, th, P.known, P.bo3 === 'all', rng);
  }

  function currentRecords(P) {
    var w = new Array(P.n).fill(0), l = new Array(P.n).fill(0);
    for (var r = 1; r <= 5; r++) P.known[r].forEach(function (k) {
      if (k.w < 0) return;
      w[k.w]++; l[k.w === k.a ? k.b : k.a]++;
    });
    return { w: w, l: l };
  }

  // ------------------------------------------------------- ланцюжок ---
  function fromRound(r) { return r === 5 ? 'раунд 5 рахуємо самі' : 'раунди ' + r + '–5 рахуємо самі'; }

  function pctUa(x) { return (100 * x).toFixed(1).replace('.', ',') + '%'; }

  /**
   * Звірка повністю записаного раунду r з нашим жеребкуванням за результатами попередніх раундів
   * (docs/research.md, «Live-режим»). Жеребкування детерміноване: rng впливає лише на результати.
   */
  function compareDraw(M, S, r, list) {
    var field = S.fixed, n = field.length, loc = {}, kl = [null, [], [], [], [], []], r0;
    function nm(g) { return M.teams[g].name || M.teams[g].id; }
    field.forEach(function (g, i) { loc[g] = i; });
    for (r0 = 1; r0 < r; r0++) S.known[r0].forEach(function (x) { kl[r0].push({ a: loc[x.a], b: loc[x.b], w: loc[x.w] }); });
    var o = swissCore(n, new Float64Array(n), kl, S.bo3All, mulberry32(1));
    var ours = {}, theirs = {}, onlyOurs = [], onlyTheirs = [];
    o.outcomes[r].forEach(function (m) { ours[pairKey(field[m.a], field[m.b])] = [field[m.a], field[m.b]]; });
    list.forEach(function (x) {
      theirs[pairKey(x.a, x.b)] = 1;
      if (!ours[pairKey(x.a, x.b)]) onlyTheirs.push(nm(x.a) + '–' + nm(x.b));
    });
    Object.keys(ours).forEach(function (key) { if (!theirs[key]) onlyOurs.push(nm(ours[key][0]) + '–' + nm(ours[key][1])); });
    if (!onlyTheirs.length) return;
    S.drawMismatch.push(r);
    M.warnings.push(S.name + ': наше жеребкування раунду ' + r + ' не збігається з Liquipedia: у нас ' + onlyOurs.join(', ') +
      '; у Liquipedia ' + onlyTheirs.join(', ') + '. Беремо пари Liquipedia.');
  }

  /**
   * Перевірка живих даних стадії раунд за раундом. Пари раунду з Liquipedia беремо, лише коли
   * (1) усі матчі попередніх раундів відомі й мають переможця; (2) у пари однаковий W-L за цими результатами;
   * (3) жодна з команд ще не має 3 перемог чи 3 поразок; (4) кожна команда в раунді один раз;
   * (5) обидві команди в складі стадії (поки склад невідомий — серед тих, хто взагалі може в ній грати).
   * Інакше цей і пізніші раунди рушій жеребкує сам; одне попередження на стадію.
   * raw[r]: [{a, b, w}] з глобальними індексами; skippedIn[r]: скільки матчів раунду відкинуто ще під час читання.
   * Заповнює S.known (лише придатні дані), S.ignoredFromRound і S.drawMismatch.
   */
  function checkStage(M, S, raw, skippedIn) {
    var field = S.fixed, n = field ? field.length : S.invited.length + 8;
    var member = {}, w = {}, l = {}, finished = 0, r, q;
    (field || S.maybe).forEach(function (g) { member[g] = 1; });
    function W(g) { return w[g] || 0; }
    function L(g) { return l[g] || 0; }
    function nm(g) { return M.teams[g].name || M.teams[g].id; }
    function pn(k) { return nm(k.a) + '–' + nm(k.b); }
    function done(g) { return W(g) >= 3 || L(g) >= 3; }
    for (r = 1; r <= 5; r++) {
      var list = raw[r], why = null, seen = {}, k = null;
      for (q = 0; q < list.length && !why; q++) {
        k = list[q];
        if (!member[k.a] || !member[k.b]) why = nm(member[k.a] ? k.b : k.a) + ' не грає в цій стадії (пара ' + pn(k) + ')';
        else if (seen[k.a] || seen[k.b]) why = nm(seen[k.a] ? k.a : k.b) + ' двічі в раунді (пара ' + pn(k) + ')';
        else if (done(k.a) || done(k.b)) why = nm(done(k.a) ? k.a : k.b) + ' вже завершила стадію (пара ' + pn(k) + ')';
        else if (W(k.a) !== W(k.b) || L(k.a) !== L(k.b) || W(k.a) + L(k.a) !== r - 1)
          why = 'пара ' + pn(k) + ' суперечить попереднім результатам (рекорди ' + W(k.a) + '-' + L(k.a) + ' і ' + W(k.b) + '-' + L(k.b) + ')';
        seen[k.a] = seen[k.b] = 1;
      }
      if (why) {
        S.ignoredFromRound = r;
        M.warnings.push(S.name + ': раунд ' + r + ' — ' + why + '; ' + fromRound(r) + '.');
        return;
      }
      S.known[r] = list;
      var full = list.length * 2 === n - finished;          // усі команди раунду на місці
      if (full && field) compareDraw(M, S, r, list);
      var pend = list.filter(function (x) { return x.w < 0; });
      if (!full || pend.length) {
        for (var r2 = r + 1; r2 <= 5 && !raw[r2].length; r2++);
        if (r2 <= 5) {                                       // пізніші раунди вже записані, але спираються на невідоме
          S.ignoredFromRound = r2;
          var what = pend.length ? 'Liquipedia ще не внесла результат' + (pend.length > 1 ? 'и ' : ' ') + pend.map(pn).join(', ') + ' (раунд ' + r + ')'
            : skippedIn[r] ? 'раунд ' + r + ' неповний (є пропущений матч)'
            : 'Liquipedia ще не внесла ' + (list.length ? 'всі пари' : 'пари') + ' раунду ' + r;
          M.warnings.push(S.name + ': ' + what + '; пари раунду ' + r2 + ' тимчасово рахуємо самі.');
        }
        return;
      }
      list.forEach(function (x) {
        var lo = x.w === x.a ? x.b : x.a;
        w[x.w] = W(x.w) + 1; l[lo] = L(lo) + 1;
        if (w[x.w] === 3) finished++;
        if (l[lo] === 3) finished++;
      });
    }
  }

  /**
   * cfg: {stages: {stage1: {teams:[…16], bo3Policy, lockAt}, stage2: {invited:[…8], bo3Policy, lockAt}, stage3: {…}}}
   * live: {stage1: {matches:[{round,a,b,winner}], seeds:[{id,seed}]}, …}
   * stages[i]: known — лише придатні пари й результати (checkStage); ignoredFromRound — з якого раунду
   * дані Liquipedia відкинуто (або null); drawMismatch — раунди, де наше жеребкування не збіглося з Liquipedia;
   * fixed — склад стадії, якщо він уже відомий (конфіг, перевірені сіди Liquipedia або повністю зіграна попередня стадія).
   */
  function buildMajor(cfg, live, opts) {
    opts = opts || {};
    var keys = ['stage1', 'stage2', 'stage3'].filter(function (k) { return cfg.stages[k]; });
    var teams = [], gIdx = {}, warnings = [];
    function addTeam(t) { if (!(t.id in gIdx)) { gIdx[t.id] = teams.length; teams.push(t); } }
    keys.forEach(function (k) { (cfg.stages[k].teams || cfg.stages[k].invited || []).forEach(addTeam); });
    var M = { teams: teams, gIdx: gIdx, thBase: Float64Array.from(thetas(teams, opts.scale)), stages: [], keys: keys, warnings: warnings };
    function nm(g) { return teams[g].name || teams[g].id; }
    function byNum(x, y) { return x - y; }
    keys.forEach(function (k, si) {
      var st = cfg.stages[k], lv = (live && live[k]) || {}, name = st.name || k, prev = M.stages[si - 1] || null;
      var bySeed = function (x, y) { return x.seed - y.seed; };
      var base = (st.teams || st.invited).slice().sort(bySeed).map(function (t) { return gIdx[t.id]; });
      var S = { key: k, si: si, name: name, lockAt: st.lockAt || null, bo3All: st.bo3Policy === 'all',
        invited: st.teams ? null : base, fixed: st.teams ? base : null, seedsLive: null, maybe: null,
        known: [null, [], [], [], [], []], ignoredFromRound: null, drawMismatch: [] };
      if (!st.teams && !prev) S.fixed = base;              // перша стадія без списку teams: склад = запрошені
      else if (!st.teams) {
        // Склад: перевірені сіди Liquipedia → наш розрахунок із повністю зіграної попередньої стадії → ще невідомий.
        var derived = derivedField(M, si, base), recP = currentStageRecords(M, si - 1), pool = base.slice();
        (prev.fixed || prev.maybe).forEach(function (g) { if (recP.l[g] < 3 && pool.indexOf(g) < 0) pool.push(g); });
        var ls = (lv.seeds || []).filter(function (s) { return s && s.id; });
        if (ls.length === 16) {
          var why = null, seen = {}, nums = {}, unknown = [], i;
          ls.forEach(function (s) {
            if (!(s.id in gIdx)) unknown.push(s.id);
            else if (seen[s.id] && !why) why = nm(gIdx[s.id]) + ' двічі';
            seen[s.id] = 1; nums[s.seed] = 1;
          });
          var ids = ls.slice().sort(bySeed).map(function (s) { return gIdx[s.id]; });
          if (unknown.length) why = 'невідомі команди: ' + unknown.join(', ');
          for (i = 1; i <= 16 && !why; i++) if (!nums[i]) why = 'номери сідів не 1–16';
          if (!why && ids.slice(0, 8).join() !== base.join()) why = 'сіди 1–8 не збігаються із запрошеними';
          for (i = 8; i < 16 && !why; i++) if (pool.indexOf(ids[i]) < 0) why = nm(ids[i]) + ' не могла вийти з ' + prev.name;
          if (!why && derived && ids.slice(8).sort(byNum).join() !== derived.slice(8).sort(byNum).join())
            why = 'сіди 9–16 не збігаються з тими, хто вийшов з ' + prev.name;
          if (why) warnings.push(name + ': сіди з Liquipedia не беремо (' + why + '); склад рахуємо самі.');
          else S.fixed = S.seedsLive = ids;
        }
        if (!S.fixed && derived) S.fixed = derived;
        if (!S.fixed) S.maybe = pool;
      }
      var raw = [null, [], [], [], [], []], skippedIn = [0, 0, 0, 0, 0, 0], unknownN = 0;
      (lv.matches || []).forEach(function (m) {
        if (!m || !m.a || !m.b || !roundOk(m.round)) return;
        if (!(m.a in gIdx) || !(m.b in gIdx)) { unknownN++; skippedIn[m.round]++; return; }
        if (m.a === m.b) {
          skippedIn[m.round]++;
          warnings.push(name + ': пропущено хибний матч ' + nm(gIdx[m.a]) + '–' + nm(gIdx[m.a]) + ' (раунд ' + m.round + ').');
          return;
        }
        var a = gIdx[m.a], b = gIdx[m.b], wg = m.winner === m.a ? a : m.winner === m.b ? b : -1;
        if (wg < 0 && m.winner) warnings.push(name + ': переможець «' + m.winner + '» не грав у матчі ' + nm(a) + '–' + nm(b) +
          ' (раунд ' + m.round + '); вважаємо матч незіграним.');
        raw[m.round].push({ a: a, b: b, w: wg });
      });
      if (unknownN) warnings.push(name + ': пропущено матчів з невідомими командами: ' + unknownN);
      checkStage(M, S, raw, skippedIn);
      M.stages.push(S);
    });
    return M;
  }

  function localKnown(S, loc) {
    var out = [null, [], [], [], [], []];
    for (var r = 1; r <= 5; r++) {
      for (var q = 0; q < S.known[r].length; q++) {
        var k = S.known[r][q], a = loc[k.a], b = loc[k.b];
        if (a >= 0 && b >= 0) out[r].push({ a: a, b: b, w: k.w >= 0 ? loc[k.w] : -1 });
      }
    }
    return out;
  }

  /** Кваліфіканти стадії (3 перемоги) у фінальному порядку; ok = false, якщо їх не 8 (лише при неузгоджених даних). */
  function qualifiersOf(o) {
    var list = [];
    for (var i = 0; i < o.order.length; i++) if (o.w[o.order[i]] === 3) list.push(o.field[o.order[i]]);
    if (list.length === 8) return { list: list, ok: true };
    return { list: o.order.slice(0, 8).map(function (x) { return o.field[x]; }), ok: false };
  }

  /**
   * Одна симуляція мейджора до стадії upto (індекс) включно.
   * stages[i].bad = true — стадію в цій симуляції дограно приблизно (лише при неузгоджених даних).
   */
  function simulateMajorOnce(M, rng, sd, upto) {
    var G = M.teams.length, th = new Float64Array(G), g, i;
    for (g = 0; g < G; g++) th[g] = M.thBase[g] + (sd ? sd * gauss(rng) : 0);
    var res = [], prevQ = null;
    for (var si = 0; si <= upto; si++) {
      var S = M.stages[si];
      var field = S.fixed || S.invited.concat(prevQ);   // кваліфіканти — сіди 9–16
      var n = field.length, loc = new Int16Array(G).fill(-1), thL = new Float64Array(n);
      for (i = 0; i < n; i++) { loc[field[i]] = i; thL[i] = th[field[i]]; }
      var out = swissCore(n, thL, localKnown(S, loc), S.bo3All, rng);
      out.field = field; out.loc = loc;
      var q = qualifiersOf(out);
      if (!q.ok) out.bad = true;
      prevQ = q.list;
      res.push(out);
    }
    return { th: th, stages: res };
  }

  /** Склад стадії si з повністю зіграної попередньої: запрошені (сіди 1–8) + 8 кваліфікантів у фінальному порядку (9–16). */
  function derivedField(M, si, invited) {
    var prev = M.stages[si - 1];
    if (!prev || !prev.fixed || !stageComplete(prev)) return null;
    var q = qualifiersOf(simulateMajorOnce(M, mulberry32(1), 0, si - 1).stages[si - 1]);
    return q.ok ? invited.concat(q.list) : null;
  }

  /** Склад стадії si, якщо він уже визначений (конфіг, сіди Liquipedia або повністю зіграна попередня стадія). */
  function fieldOf(M, si) {
    var S = M.stages[si];
    return S.fixed || (si > 0 ? derivedField(M, si, S.invited) : null);
  }

  function stageComplete(S) {
    var n = 0;
    for (var r = 1; r <= 5; r++) S.known[r].forEach(function (k) { if (k.w >= 0) n++; });
    return n === 33;
  }

  /** Наш розрахунок складу/сідів стадії si з результатів попередньої (для звірки з Liquipedia). */
  function derivedSeeds(M, si) {
    var S = M.stages[si];
    if (si === 0) return null;
    var mine = derivedField(M, si, S.invited);
    if (!mine) return null;
    var ids = mine.map(function (g) { return M.teams[g].id; });
    var live = S.seedsLive ? S.seedsLive.map(function (g) { return M.teams[g].id; }) : null;
    return { ids: ids, live: live, match: live ? ids.join('|') === live.join('|') : null };
  }

  /** Поточні рекорди стадії лише з придатних результатів (S.known після checkStage). */
  function currentStageRecords(M, si) {
    var G = M.teams.length, w = new Int8Array(G), l = new Int8Array(G), S = M.stages[si];
    for (var r = 1; r <= 5; r++) S.known[r].forEach(function (k) {
      if (k.w < 0) return;
      w[k.w]++; l[k.w === k.a ? k.b : k.a]++;
    });
    return { w: w, l: l };
  }

  /** Перший раунд із записаними, але ще не зіграними парами (лише з придатних раундів). */
  function findPending(M, vi) {
    for (var si = 0; si <= vi; si++) {
      for (var r = 1; r <= 5; r++) {
        var list = M.stages[si].known[r].filter(function (k) { return k.w < 0; });
        if (list.length) return { si: si, round: r, list: list };
      }
    }
    return null;
  }

  /** Скільки перших раундів стадії зіграно повністю (усі пари на місці, у кожної є переможець). */
  function completedRounds(S, n) {
    var active = n, w = {}, l = {};
    for (var r = 1; r <= 5; r++) {
      var list = S.known[r];
      if (!list.length || list.length * 2 !== active) return r - 1;
      for (var q = 0; q < list.length; q++) if (list[q].w < 0) return r - 1;
      for (q = 0; q < list.length; q++) {
        var x = list[q], lo = x.w === x.a ? x.b : x.a;
        w[x.w] = (w[x.w] || 0) + 1; l[lo] = (l[lo] || 0) + 1;
        if (w[x.w] === 3) active--;
        if (l[lo] === 3) active--;
      }
    }
    return 5;
  }

  /**
   * Наше жеребкування першого ще не оголошеного раунду (воно детерміноване), якщо склад стадії відомий
   * і всі попередні раунди зіграні. Потрібне для «Що як»: стадію можна «дограти» припущеннями раунд за раундом.
   */
  function derivedPending(M, vi) {
    for (var si = 0; si <= vi; si++) {
      var S = M.stages[si];
      if (stageComplete(S)) continue;
      if (!S.fixed) return null;
      var n = S.fixed.length, r = completedRounds(S, n) + 1;
      if (r > 5 || S.known[r].length) return null;      // раунд уже оголошено або дані неповні
      var loc = {}, kl = [null, [], [], [], [], []];
      S.fixed.forEach(function (g, i) { loc[g] = i; });
      for (var r0 = 1; r0 < r; r0++) {
        for (var q = 0; q < S.known[r0].length; q++) { var x = S.known[r0][q]; kl[r0].push({ a: loc[x.a], b: loc[x.b], w: loc[x.w] }); }
      }
      var o = swissCore(n, new Float64Array(n), kl, S.bo3All, mulberry32(1)), field = S.fixed;
      return { si: si, round: r, derived: true,
        list: o.outcomes[r].map(function (m) { return { a: field[m.a], b: field[m.b], w: -1 }; }) };
    }
    return null;
  }

  function cardPicks(M, card) {
    var picks = [];
    if (card) SLOTS.forEach(function (slot) {
      (card[slot] || []).forEach(function (id) { if (id && id in M.gIdx) picks.push({ slot: slot, id: id, g: M.gIdx[id] }); });
    });
    return picks;
  }

  function stageSeedOf(M, si, g) {
    var S = M.stages[si], f = S.fixed || S.invited;
    var i = f.indexOf(g);
    return i >= 0 ? i + 1 : null;
  }

  /**
   * Головна функція для сторінки: N симуляцій ланцюжка до стадії viewKey;
   * ймовірності команд у цій стадії, розподіл 0..10 для картки, swing-матчі.
   * swing[i]: {a, b, pOccur — частка симуляцій, де матч відбувся; pA — P(A виграє | матч відбувся);
   *            p5IfA / p5IfB — P(5+ | переміг A / B)}.
   */
  function runMajor(M, viewKey, card, opts) {
    opts = opts || {};
    var N = opts.sims || DEFAULTS.sims, sd = opts.sd == null ? DEFAULTS.sd : opts.sd;
    var rng = mulberry32(opts.seed || DEFAULTS.seed);
    var vi = M.keys.indexOf(viewKey);
    if (vi < 0) throw new Error('unknown stage ' + viewKey);
    var G = M.teams.length, g, i, sj;
    var inF = new Float64Array(G), c30 = new Float64Array(G), cAdv = new Float64Array(G), c03 = new Float64Array(G), cQ = new Float64Array(G);
    var recDist = []; for (g = 0; g < G; g++) recDist.push({});
    var picks = cardPicks(M, card);
    var hits = new Float64Array(picks.length), hist = new Float64Array(picks.length + 1);
    var pend = findPending(M, vi) || derivedPending(M, vi);
    var sw = pend ? pend.list.map(function () { return { aW: 0, bW: 0, aW5: 0, bW5: 0 }; }) : [];
    var badN = new Float64Array(vi + 1);

    for (var s = 0; s < N; s++) {
      var o = simulateMajorOnce(M, rng, sd, vi), V = o.stages[vi];
      // «приблизні» симуляції рахуємо там, де вони впливають на цю стадію
      for (sj = 0; sj <= vi; sj++) if (o.stages[sj].bad && (sj === vi || !M.stages[sj + 1].fixed)) badN[sj]++;
      for (i = 0; i < V.field.length; i++) {
        g = V.field[i];
        var W = V.w[i], L = V.l[i];
        inF[g]++;
        if (W === 3) { cQ[g]++; if (L === 0) c30[g]++; else cAdv[g]++; } else if (W === 0) c03[g]++;
        var key = W + '-' + L; recDist[g][key] = (recDist[g][key] || 0) + 1;
      }
      var K = 0;
      for (var p = 0; p < picks.length; p++) {
        var li = V.loc[picks[p].g];
        if (li >= 0 && slotHit(picks[p].slot, V.w[li], V.l[li])) { hits[p]++; K++; }
      }
      hist[K]++;
      if (pend) {
        var SO = o.stages[pend.si], outs = SO.outcomes[pend.round];
        for (var q = 0; q < pend.list.length; q++) {
          var la = SO.loc[pend.list[q].a], lb = SO.loc[pend.list[q].b];
          for (var z = 0; z < outs.length; z++) {
            var m = outs[z];
            if ((m.a === la && m.b === lb) || (m.a === lb && m.b === la)) {
              if (m.w === la) { sw[q].aW++; if (K >= 5) sw[q].aW5++; } else { sw[q].bW++; if (K >= 5) sw[q].bW5++; }
              break;
            }
          }
        }
      }
    }

    var p5 = 0, eK = 0, e2 = 0;
    for (var k = 0; k < hist.length; k++) { if (k >= 5) p5 += hist[k]; eK += k * hist[k]; e2 += k * k * hist[k]; }
    p5 /= N; eK /= N; e2 /= N;
    var S = M.stages[vi], rec = currentStageRecords(M, vi), field = fieldOf(M, vi);
    var teamsOut = [];
    for (g = 0; g < G; g++) {
      if (!inF[g]) continue;
      var t = M.teams[g], dist = {};
      Object.keys(recDist[g]).forEach(function (kk) { dist[kk] = recDist[g][kk] / N; });
      teamsOut.push({
        id: t.id, name: t.name, vrs: t.vrs, note: t.note || null, theta: M.thBase[g],
        seed: field ? (field.indexOf(g) >= 0 ? field.indexOf(g) + 1 : null) : stageSeedOf(M, vi, g),
        w: rec.w[g], l: rec.l[g], pIn: inF[g] / N,
        p30: c30[g] / N, adv: cAdv[g] / N, p03: c03[g] / N, qual: cQ[g] / N, records: dist
      });
    }
    teamsOut.sort(function (a, b) {
      return (b.pIn - a.pIn) || ((a.seed || 99) - (b.seed || 99)) || (b.theta - a.theta);
    });
    var warnings = M.warnings.slice();
    for (sj = 0; sj <= vi; sj++) {
      if (badN[sj]) warnings.push(M.stages[sj].name + ': дані суперечливі — ' + pctUa(badN[sj] / N) + ' симуляцій пораховано приблизно.');
    }
    return {
      stage: viewKey, sims: N,
      fieldKnown: !!field,
      p5: p5, p5se: Math.sqrt(p5 * (1 - p5) / N), eK: eK, sdK: Math.sqrt(Math.max(0, e2 - eK * eK)),
      hist: Array.prototype.map.call(hist, function (h) { return h / N; }),
      teams: teamsOut,
      picks: picks.map(function (pk, j) {
        var inField = field ? field.indexOf(pk.g) >= 0 : inF[pk.g] > 0;
        return { slot: pk.slot, id: pk.id, prob: hits[j] / N,
          status: !inField ? 'dead' : pickStatus(pk.slot, rec.w[pk.g], rec.l[pk.g]) };
      }),
      swingStage: pend ? M.keys[pend.si] : null, swingRound: pend ? pend.round : 0,
      swingDerived: !!(pend && pend.derived),      // true — пари ще не оголошені, це наше жеребкування
      swing: pend ? pend.list.map(function (pm, q) {
        var c = sw[q], occ = c.aW + c.bW;
        return { a: M.teams[pm.a].id, b: M.teams[pm.b].id, pOccur: occ / N, pA: occ ? c.aW / occ : null,
          p5IfA: c.aW ? c.aW5 / c.aW : null, p5IfB: c.bW ? c.bW5 / c.bW : null };
      }).filter(function (x) { return x.pOccur > 0; }) : [],
      derived: vi > 0 ? derivedSeeds(M, vi) : null,
      liveChecks: M.stages.map(function (st) {
        return { stage: st.key, ignoredFromRound: st.ignoredFromRound, drawMismatch: st.drawMismatch.slice() };
      }),
      warnings: warnings
    };
  }

  /**
   * Змагання з друзями: одні й ті самі N симуляцій стадії viewKey для кількох карток одразу.
   * cards: {id: {p30, adv, p03}} — неповні картки теж можна (рахуються лише наявні піки).
   * З тим самим seed і N симуляції збігаються з runMajor, тож шанс 5+ кожної картки той самий, що на її сторінці.
   * Повертає {sims, players: {id: {p5, eK, hist, pFirst, eRank, n}}}:
   *   pFirst — частка симуляцій, де картка вгадала найбільше (нічия ділиться порівну між тими, хто її поділив);
   *   eRank — середнє місце (1 — перше; при нічиї — середнє з місць, які ділять).
   */
  function runLeague(M, viewKey, cards, opts) {
    opts = opts || {};
    var N = opts.sims || DEFAULTS.sims, sd = opts.sd == null ? DEFAULTS.sd : opts.sd;
    var rng = mulberry32(opts.seed || DEFAULTS.seed);
    var vi = M.keys.indexOf(viewKey);
    if (vi < 0) throw new Error('unknown stage ' + viewKey);
    var ids = Object.keys(cards || {}), P = ids.length, j, q, p;
    var picks = ids.map(function (id) { return cardPicks(M, cards[id]); });
    var hist = picks.map(function (pk) { return new Float64Array(pk.length + 1); });
    var first = new Float64Array(P), rankSum = new Float64Array(P), K = new Int32Array(P), inF = new Float64Array(M.teams.length);
    for (var s = 0; s < N; s++) {
      var V = simulateMajorOnce(M, rng, sd, vi).stages[vi], best = -1, nb = 0;
      for (q = 0; q < V.field.length; q++) inF[V.field[q]]++;
      for (j = 0; j < P; j++) {
        var k = 0, pj = picks[j];
        for (p = 0; p < pj.length; p++) {
          var li = V.loc[pj[p].g];
          if (li >= 0 && slotHit(pj[p].slot, V.w[li], V.l[li])) k++;
        }
        K[j] = k; hist[j][k]++;
        if (k > best) { best = k; nb = 1; } else if (k === best) nb++;
      }
      for (j = 0; j < P; j++) {
        if (K[j] === best) first[j] += 1 / nb;
        var more = 0, same = 0;
        for (q = 0; q < P; q++) { if (K[q] > K[j]) more++; else if (K[q] === K[j]) same++; }
        rankSum[j] += 1 + more + (same - 1) / 2;
      }
    }
    // Справжній стан піків (за зіграними матчами): зайшов, згорів чи ще в грі — як у runMajor.
    var rec = currentStageRecords(M, vi), field = fieldOf(M, vi), players = {};
    ids.forEach(function (id, jj) {
      var h = hist[jj], p5 = 0, eK = 0, cnt = { hit: 0, dead: 0, open: 0 };
      for (var kk = 0; kk < h.length; kk++) { if (kk >= 5) p5 += h[kk]; eK += kk * h[kk]; }
      var status = picks[jj].map(function (pk) {
        var inField = field ? field.indexOf(pk.g) >= 0 : inF[pk.g] > 0;
        var st = !inField ? 'dead' : pickStatus(pk.slot, rec.w[pk.g], rec.l[pk.g]);
        cnt[st]++;
        return { slot: pk.slot, id: pk.id, status: st };
      });
      players[id] = { p5: p5 / N, eK: eK / N, pFirst: first[jj] / N, eRank: rankSum[jj] / N, n: picks[jj].length,
        hit: cnt.hit, dead: cnt.dead, open: cnt.open, picks: status,
        hist: Array.prototype.map.call(h, function (x) { return x / N; }) };
    });
    return { stage: viewKey, sims: N, fieldKnown: !!field, players: players };
  }

  // ------------------------------------------------------ оптимізатор ---
  function collectBits(M, vi, N, rng, sd) {
    var G = M.teams.length, X = [new Array(G), new Array(G), new Array(G)], inF = new Float64Array(G);
    for (var s = 0; s < N; s++) {
      var V = simulateMajorOnce(M, rng, sd, vi).stages[vi];
      for (var i = 0; i < V.field.length; i++) {
        var g = V.field[i], W = V.w[i], L = V.l[i];
        inF[g]++;
        var c = W === 3 ? (L === 0 ? 0 : 1) : (W === 0 ? 2 : -1);
        if (c >= 0) { if (!X[c][g]) X[c][g] = new Uint8Array(N); X[c][g][s] = 1; }
      }
    }
    return { X: X, inF: inF };
  }

  function cardKey(card) {
    return SLOTS.map(function (s) { return card[s].slice().sort(function (a, b) { return a - b; }).join(','); }).join('|');
  }

  function cloneCard(c) { return { p30: c.p30.slice(), adv: c.adv.slice(), p03: c.p03.slice() }; }

  /** Точний максимум очікуваних правильних (E лінійне): перебір пар 3:0 і 0:3, у вихід — 6 найкращих із решти. */
  function exactMaxE(cands, marg, locks) {
    var lockedAll = locks.p30.concat(locks.adv, locks.p03);
    var free = cands.filter(function (g) { return lockedAll.indexOf(g) < 0; });
    var need30 = 2 - locks.p30.length, need03 = 2 - locks.p03.length, needAdv = 6 - locks.adv.length;
    var advSorted = free.slice().sort(function (a, b) { return marg[1][b] - marg[1][a]; });
    function combos(arr, k) {
      var out = [];
      (function rec(start, acc) {
        if (acc.length === k) { out.push(acc.slice()); return; }
        for (var i = start; i < arr.length; i++) { acc.push(arr[i]); rec(i + 1, acc); acc.pop(); }
      })(0, []);
      return out;
    }
    var best = null, bestE = -1;
    var c30s = combos(free, need30), c03s = combos(free, need03);
    var baseE = 0;
    locks.p30.forEach(function (g) { baseE += marg[0][g]; });
    locks.adv.forEach(function (g) { baseE += marg[1][g]; });
    locks.p03.forEach(function (g) { baseE += marg[2][g]; });
    for (var a = 0; a < c30s.length; a++) {
      var e30 = 0; c30s[a].forEach(function (g) { e30 += marg[0][g]; });
      for (var b = 0; b < c03s.length; b++) {
        var t03 = c03s[b], clash = false;
        for (var x = 0; x < t03.length; x++) if (c30s[a].indexOf(t03[x]) >= 0) { clash = true; break; }
        if (clash) continue;
        var e = baseE + e30, adv = [];
        t03.forEach(function (g) { e += marg[2][g]; });
        for (var j = 0; j < advSorted.length && adv.length < needAdv; j++) {
          var g = advSorted[j];
          if (c30s[a].indexOf(g) >= 0 || t03.indexOf(g) >= 0) continue;
          adv.push(g); e += marg[1][g];
        }
        if (adv.length < needAdv) continue;
        if (e > bestE + 1e-12) {
          bestE = e;
          best = { p30: locks.p30.concat(c30s[a]), adv: locks.adv.concat(adv), p03: locks.p03.concat(t03) };
        }
      }
    }
    return best;
  }

  /** Картка «фаворитів»: 2 найсильніші в 3:0, наступні 6 у вихід, 2 найслабші в 0:3 (серед імовірного складу). */
  function favoritesCard(M, cands, inF, locks) {
    var field = cands.slice().sort(function (a, b) { return (inF[b] - inF[a]) || (M.thBase[b] - M.thBase[a]); }).slice(0, 16);
    field.sort(function (a, b) { return M.thBase[b] - M.thBase[a]; });
    var lockedAll = locks.p30.concat(locks.adv, locks.p03);
    var free = field.filter(function (g) { return lockedAll.indexOf(g) < 0; });
    var card = cloneCard(locks);
    while (card.p03.length < 2 && free.length) card.p03.push(free.pop());
    while (card.p30.length < 2 && free.length) card.p30.push(free.shift());
    while (card.adv.length < 6 && free.length) card.adv.push(free.shift());
    return card.p30.length === 2 && card.adv.length === 6 && card.p03.length === 2 ? card : null;
  }

  function randomCard(cands, locks, rng) {
    var lockedAll = locks.p30.concat(locks.adv, locks.p03);
    var pool = cands.filter(function (g) { return lockedAll.indexOf(g) < 0; });
    for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)), t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    var card = cloneCard(locks);
    SLOTS.forEach(function (s) { while (card[s].length < SLOT_SIZE[s]) card[s].push(pool.pop()); });
    return card;
  }

  function better(a, b) {                       // ціль: P(K≥5), далі E[K], далі P(K≥6)
    if (a.f !== b.f) return a.f > b.f;
    if (Math.abs(a.E - b.E) > 1e-9) return a.E > b.E;
    return a.f6 > b.f6;
  }

  function byScore(a, b) { return better(a.score, b.score) ? -1 : better(b.score, a.score) ? 1 : 0; }

  /** Рахунок картки на вибірці пошуку: f = #(K≥5), f6 = #(K≥6), E = Σ влучань. */
  function cardScore(card, X, N, msum, zero) {
    var c = new Uint8Array(N), f = 0, f6 = 0, E = 0, s;
    SLOTS.forEach(function (sl, idx) {
      card[sl].forEach(function (g) { var x = X[idx][g] || zero; for (s = 0; s < N; s++) c[s] += x[s]; E += msum[idx][g]; });
    });
    for (s = 0; s < N; s++) if (c[s] >= 5) { f++; if (c[s] >= 6) f6++; }
    return { f: f, f6: f6, E: E };
  }

  /**
   * Локальний пошук під P(K≥5) (найкращий хід за ітерацію). Ходи: заміна піку командою поза карткою в тому ж слоті
   * і обмін двох піків між слотами; замкнені команди не рухаються.
   * Повертає {card, score} локального оптимуму і neighbors — 5 найкращих карток за один хід від нього.
   */
  function localSearch(start, X, N, cands, lockedSet, msum, zero) {
    var card = cloneCard(start), c = new Uint8Array(N), s;
    function arr(slotIdx, g) { return X[slotIdx][g] || zero; }
    function recount() {
      c.fill(0);
      SLOTS.forEach(function (sl, idx) { card[sl].forEach(function (g) { var x = arr(idx, g); for (s = 0; s < N; s++) c[s] += x[s]; }); });
      var f = 0, f6 = 0, E = 0;
      for (s = 0; s < N; s++) { if (c[s] >= 5) { f++; if (c[s] >= 6) f6++; } }
      SLOTS.forEach(function (sl, idx) { card[sl].forEach(function (g) { E += msum[idx][g]; }); });
      return { f: f, f6: f6, E: E };
    }
    function apply(cd, mv) {
      if (mv.kind === 'rep') cd[SLOTS[mv.si]][mv.pi] = mv.v;
      else { var t = cd[SLOTS[mv.s1]][mv.ia]; cd[SLOTS[mv.s1]][mv.ia] = cd[SLOTS[mv.s2]][mv.ib]; cd[SLOTS[mv.s2]][mv.ib] = t; }
    }
    // Усі ходи з поточної картки: найкращий покращувальний (best) і 5 найкращих узагалі (top).
    function scan(cur) {
      var best = null, top = [], inCard = {}, si;
      function consider(mv) {
        if (better(mv.score, best ? best.score : cur)) best = mv;
        if (top.length === 5 && !better(mv.score, top[4].score)) return;
        top.push(mv); top.sort(byScore);
        if (top.length > 5) top.pop();
      }
      SLOTS.forEach(function (sl) { card[sl].forEach(function (g) { inCard[g] = 1; }); });
      // заміна піку командою поза карткою в тому ж слоті
      for (si = 0; si < 3; si++) {
        var sl = SLOTS[si];
        for (var pi = 0; pi < card[sl].length; pi++) {
          var u = card[sl][pi];
          if (lockedSet[u]) continue;
          var xu = arr(si, u);
          for (var ci = 0; ci < cands.length; ci++) {
            var v = cands[ci];
            if (inCard[v]) continue;
            var xv = arr(si, v), f = 0, f6 = 0;
            for (s = 0; s < N; s++) { var nc = c[s] - xu[s] + xv[s]; if (nc >= 5) { f++; if (nc >= 6) f6++; } }
            consider({ score: { f: f, f6: f6, E: cur.E - msum[si][u] + msum[si][v] }, kind: 'rep', si: si, pi: pi, v: v });
          }
        }
      }
      // обмін двох піків між різними слотами
      for (var s1 = 0; s1 < 3; s1++) for (var s2 = s1 + 1; s2 < 3; s2++) {
        var A = card[SLOTS[s1]], B = card[SLOTS[s2]];
        for (var ia = 0; ia < A.length; ia++) for (var ib = 0; ib < B.length; ib++) {
          var ua = A[ia], vb = B[ib];
          if (lockedSet[ua] || lockedSet[vb]) continue;
          var x1u = arr(s1, ua), x2v = arr(s2, vb), x2u = arr(s2, ua), x1v = arr(s1, vb), f2 = 0, f62 = 0;
          for (s = 0; s < N; s++) { var nc2 = c[s] - x1u[s] - x2v[s] + x2u[s] + x1v[s]; if (nc2 >= 5) { f2++; if (nc2 >= 6) f62++; } }
          consider({ score: { f: f2, f6: f62, E: cur.E - msum[s1][ua] - msum[s2][vb] + msum[s2][ua] + msum[s1][vb] },
            kind: 'swap', s1: s1, s2: s2, ia: ia, ib: ib });
        }
      }
      return { best: best, top: top };
    }
    var cur = recount(), last = null;
    for (var iter = 0; iter < 80; iter++) {
      last = scan(cur);
      if (!last.best) break;
      apply(card, last.best);
      cur = recount();
      last = null;
    }
    if (!last) last = scan(cur);                    // вичерпано ліміт ходів: сусіди саме фінальної картки
    return {
      card: card, score: cur,
      neighbors: last.top.map(function (mv) { var cd = cloneCard(card); apply(cd, mv); return { card: cd, score: mv.score }; })
    };
  }

  /** Оцінка кількох карток на тих самих свіжих симуляціях. cards: [{p30:[g],adv:[g],p03:[g]}] */
  function evalCards(M, vi, cards, N, seed, sd) {
    var rng = mulberry32(seed), hists = cards.map(function () { return new Float64Array(11); });
    var flat = cards.map(function (c) {
      var out = [];
      SLOTS.forEach(function (sl) { c[sl].forEach(function (g) { out.push([sl, g]); }); });
      return out;
    });
    for (var s = 0; s < N; s++) {
      var V = simulateMajorOnce(M, rng, sd, vi).stages[vi];
      for (var k = 0; k < cards.length; k++) {
        var K = 0, f = flat[k];
        for (var p = 0; p < f.length; p++) {
          var li = V.loc[f[p][1]];
          if (li >= 0 && slotHit(f[p][0], V.w[li], V.l[li])) K++;
        }
        hists[k][K]++;
      }
    }
    return hists.map(function (h) {
      var p5 = 0, e = 0, e2 = 0, p6 = 0;
      for (var k = 0; k <= 10; k++) { h[k] /= N; if (k >= 5) p5 += h[k]; if (k >= 6) p6 += h[k]; e += k * h[k]; e2 += k * k * h[k]; }
      return { p5: p5, p6: p6, p5se: Math.sqrt(p5 * (1 - p5) / N), eK: e, sdK: Math.sqrt(Math.max(0, e2 - e * e)), hist: Array.prototype.slice.call(h) };
    });
  }

  /**
   * Оптимізатор. opts: {locks:{p30:[id],adv:[id],p03:[id]}, bans:[id], userCard, searchSims, selectSims, evalSims, restarts, seed, sd}
   * 1) пошук на вибірці searchSims: локальні оптимуми + по 5 найкращих сусідів кожного + max-E і фаворити (20 найкращих);
   * 2) вибір найкращої й альтернатив — на свіжій вибірці A (selectSims, seed + 1000003);
   * 3) усі показані цифри — на незалежній вибірці B (evalSims, seed + 2000003), щоб не завищувати переможця.
   * Кожна картка: {card, p5, p6, p5se, eK, sdK, hist, picks, selectP5, selectEK (вибірка A або null), risk?};
   * maxE.source — звідки картка з найбільшим E: 'exact' | 'best' | 'alt1'..'alt3' | 'favorites'.
   */
  function optimize(M, viewKey, opts) {
    opts = opts || {};
    var vi = M.keys.indexOf(viewKey);
    if (vi < 0) throw new Error('unknown stage ' + viewKey);
    var N = opts.searchSims || DEFAULTS.searchSims, NA = opts.selectSims || DEFAULTS.selectSims, NB = opts.evalSims || DEFAULTS.evalSims;
    var sd = opts.sd == null ? DEFAULTS.sd : opts.sd, seed = opts.seed || DEFAULTS.seed;
    var t0 = Date.now(), rng = mulberry32(seed + 17);
    var bits = collectBits(M, vi, N, rng, sd), X = bits.X, inF = bits.inF, G = M.teams.length;
    var bans = {}; (opts.bans || []).forEach(function (id) { if (id in M.gIdx) bans[M.gIdx[id]] = 1; });
    var locksIn = opts.locks || {}, locks = { p30: [], adv: [], p03: [] }, lockedSet = {}, errors = [];
    SLOTS.forEach(function (sl) {
      (locksIn[sl] || []).forEach(function (id) {
        if (!(id in M.gIdx)) { errors.push('невідома команда ' + id); return; }
        var g = M.gIdx[id];
        if (lockedSet[g]) { errors.push(M.teams[g].name + ' замкнена двічі'); return; }
        if (!inF[g]) { errors.push(M.teams[g].name + ' не потрапляє в цю стадію'); return; }
        if (locks[sl].length >= SLOT_SIZE[sl]) { errors.push('забагато замків у слоті ' + sl); return; }
        locks[sl].push(g); lockedSet[g] = 1;
      });
    });
    if (errors.length) return { error: errors.join('; ') };
    var marg = [new Float64Array(G), new Float64Array(G), new Float64Array(G)], msum = [new Float64Array(G), new Float64Array(G), new Float64Array(G)];
    for (var c = 0; c < 3; c++) for (var g = 0; g < G; g++) {
      var x = X[c][g], sum = 0;
      if (x) for (var s = 0; s < N; s++) sum += x[s];
      msum[c][g] = sum; marg[c][g] = sum / N;
    }
    // Кандидати: ті, хто реально може дати влучання (команди, які майже не доходять до стадії, лише гальмують пошук).
    var cands = [];
    for (g = 0; g < G; g++) {
      if (!inF[g] || (bans[g] && !lockedSet[g])) continue;
      if (lockedSet[g] || Math.max(marg[0][g], marg[1][g], marg[2][g]) >= (opts.minProb == null ? 0.003 : opts.minProb)) cands.push(g);
    }
    if (cands.length < 10) return { error: 'замало команд для картки (заборонено забагато)' };
    var zero = new Uint8Array(N);
    var maxE = exactMaxE(cands, marg, locks), fav = favoritesCard(M, cands, inF, locks);
    var restarts = opts.restarts == null ? DEFAULTS.restarts : opts.restarts, rr = mulberry32(seed + 99);
    var pool = {}, top = null;
    function addPool(card, score) {
      var key = cardKey(card);
      if (!pool[key]) pool[key] = { card: cloneCard(card), score: score, key: key };
      return pool[key];
    }
    function addRun(res) {
      addPool(res.card, res.score);
      res.neighbors.forEach(function (nb) { addPool(nb.card, nb.score); });
      if (!top || better(res.score, top.score)) top = { card: cloneCard(res.card), score: res.score };
    }
    var starts = [];
    if (maxE) starts.push(maxE);
    if (fav) starts.push(fav);
    starts.push(randomCard(cands, locks, rr));       // одна повністю випадкова стартова точка для різноманіття
    starts.forEach(function (st) { addRun(localSearch(st, X, N, cands, lockedSet, msum, zero)); });
    // Iterated local search: збурюємо найкращу картку (3 випадкові зміни) і знову шукаємо локальний оптимум.
    for (var k = 0; k < restarts; k++) {
      var pert = cloneCard(top.card), inCard = {};
      SLOTS.forEach(function (sl) { pert[sl].forEach(function (g2) { inCard[g2] = 1; }); });
      var outside = cands.filter(function (g2) { return !inCard[g2]; });
      for (var ch = 0; ch < 3; ch++) {
        var sl = SLOTS[Math.floor(rr() * 3)], pi = Math.floor(rr() * pert[sl].length), u = pert[sl][pi];
        if (lockedSet[u]) continue;
        if (rr() < 0.5 && outside.length) {               // заміна командою поза карткою
          var oi = Math.floor(rr() * outside.length), v = outside[oi];
          pert[sl][pi] = v; outside[oi] = u;
        } else {                                          // обмін зі слотом іншої категорії
          var sl2 = SLOTS[(SLOTS.indexOf(sl) + 1 + Math.floor(rr() * 2)) % 3], pj = Math.floor(rr() * pert[sl2].length);
          if (lockedSet[pert[sl2][pj]]) continue;
          var t2 = pert[sl2][pj]; pert[sl2][pj] = u; pert[sl][pi] = t2;
        }
      }
      addRun(localSearch(pert, X, N, cands, lockedSet, msum, zero));
    }
    // Кандидати на вибір: 20 найкращих за пошуком, а max-E і фаворити — завжди.
    var mk = maxE ? addPool(maxE, cardScore(maxE, X, N, msum, zero)).key : null;
    var fk = fav ? addPool(fav, cardScore(fav, X, N, msum, zero)).key : null;
    var list = Object.keys(pool).map(function (key) { return pool[key]; }).sort(byScore).slice(0, 20);
    [mk, fk].forEach(function (key) { if (key && list.indexOf(pool[key]) < 0) list.push(pool[key]); });
    // Вибір на свіжій вибірці A: найбільший P(5+), далі E[K] — серед усіх кандидатів, max-E і фаворитів теж.
    var evA = evalCards(M, vi, list.map(function (e) { return e.card; }), NA, seed + 1000003, sd);
    list.forEach(function (e, i) { e.A = evA[i]; e.rank = i; });
    var ranked = list.slice().sort(function (a, b) { return (b.A.p5 - a.A.p5) || (b.A.eK - a.A.eK) || (a.rank - b.rank); });
    var bestE = ranked[0], tol = Math.max(0.005, 2 * bestE.A.p5se);
    // Альтернативи: шанс 5+ у межах похибки від найкращої (max-E і фаворити показуються окремими рядками).
    // Картка з точно тим самим розподілом K, що й уже показана, відрізняється лише «мертвими» піками — це не альтернатива.
    function sameHist(a, b) { for (var i = 0; i <= 10; i++) if (a.hist[i] !== b.hist[i]) return false; return true; }
    var altE = [], shownA = [bestE.A].concat(mk ? [pool[mk].A] : [], fk ? [pool[fk].A] : []);
    ranked.slice(1).forEach(function (e) {
      if (altE.length >= 3 || e.key === mk || e.key === fk || bestE.A.p5 - e.A.p5 > tol) return;
      if (shownA.some(function (a) { return sameHist(a, e.A); })) return;
      altE.push(e); shownA.push(e.A);
    });
    var user = null;
    if (opts.userCard) {
      var uc = { p30: [], adv: [], p03: [] }, ok = true, seenU = {};
      SLOTS.forEach(function (sl3) {
        (opts.userCard[sl3] || []).forEach(function (id) {
          if (!(id in M.gIdx) || seenU[id]) ok = false;
          else { seenU[id] = 1; uc[sl3].push(M.gIdx[id]); }
        });
      });
      if (ok && uc.p30.length === 2 && uc.adv.length === 6 && uc.p03.length === 2) user = uc;
    }
    // Звіт на незалежній вибірці B: лише показані картки.
    var rep = [], repIdx = {};
    function want(card) { var key = cardKey(card); if (!(key in repIdx)) { repIdx[key] = rep.length; rep.push(card); } }
    want(bestE.card);
    altE.forEach(function (e) { want(e.card); });
    if (mk) want(maxE);
    if (fk) want(fav);
    if (user) want(user);
    var evB = evalCards(M, vi, rep, NB, seed + 2000003, sd);
    function mB(card) { return evB[repIdx[cardKey(card)]]; }
    function pack(card, a) {
      var m = mB(card);
      var out = { card: {}, p5: m.p5, p6: m.p6, p5se: m.p5se, eK: m.eK, sdK: m.sdK, hist: m.hist, picks: [],
        selectP5: a ? a.p5 : null, selectEK: a ? a.eK : null };
      SLOTS.forEach(function (sl3, idx) {
        out.card[sl3] = card[sl3].map(function (g2) { return M.teams[g2].id; });
        card[sl3].forEach(function (g2) { out.picks.push({ slot: sl3, id: M.teams[g2].id, prob: marg[idx][g2], locked: !!lockedSet[g2] }); });
      });
      return out;
    }
    var best = pack(bestE.card, bestE.A), alts = altE.map(function (e) { return pack(e.card, e.A); });
    // «Макс. очікуваних» — картка з найбільшим E[K] на вибірці B серед показаних (точний max-E, найкраща, альтернативи, фаворити).
    var srcs = [];
    if (mk) srcs.push(['exact', pool[mk]]);
    srcs.push(['best', bestE]);
    altE.forEach(function (e, i) { srcs.push(['alt' + (i + 1), e]); });
    if (fk) srcs.push(['favorites', pool[fk]]);
    var mx = null;
    srcs.forEach(function (sx) {
      var e = mB(sx[1].card).eK;
      if (!mx || e > mx.eK + 1e-12) mx = { src: sx[0], entry: sx[1], eK: e };
    });
    var maxOut = pack(mx.entry.card, mx.entry.A);
    maxOut.source = mx.src;
    var trio = [best].concat(alts).sort(function (a, b) { return a.sdK - b.sdK; });
    if (trio.length >= 2) {
      trio[0].risk = 'safe'; trio[trio.length - 1].risk = 'risky';
      for (var t = 1; t < trio.length - 1; t++) trio[t].risk = 'medium';
    }
    var margOut = cands.map(function (g2) {
      return { id: M.teams[g2].id, name: M.teams[g2].name, pIn: inF[g2] / N, p30: marg[0][g2], adv: marg[1][g2], p03: marg[2][g2] };
    });
    return {
      stage: viewKey, searchSims: N, selectSims: NA, evalSims: NB, ms: Date.now() - t0,
      best: best, alternatives: alts, maxE: maxOut, favorites: fk ? pack(fav, pool[fk].A) : null,
      user: user ? pack(user, null) : null, marginals: margOut, searched: list.length
    };
  }

  // ---------------------------------------------------------- плей-оф ---
  // Сітка: QF 1v8 і 4v5 → півфінал 1; QF 2v7 і 3v6 → півфінал 2; фінал Bo5, решта Bo3.
  // Сіди 1–8 — фінальний порядок останньої Swiss-стадії.
  var PO_PAIRS = [[0, 7], [3, 4], [1, 6], [2, 5]];

  /** Одна симуляція плей-оф. kn — уже зіграні матчі ({qf: [g|-1]×4, sf: [g|-1]×2, champ: g|-1}): їх не розігруємо. */
  function playoffsOnce(seeds, th, rng, kn) {
    function play(a, b, bo, w) { return w === a || w === b ? w : rng() < pSeries(pMapFromTheta(th[a] - th[b]), bo) ? a : b; }
    var qf = [];
    for (var i = 0; i < 4; i++) qf.push(play(seeds[PO_PAIRS[i][0]], seeds[PO_PAIRS[i][1]], 3, kn ? kn.qf[i] : -1));
    var sf = [play(qf[0], qf[1], 3, kn ? kn.sf[0] : -1), play(qf[2], qf[3], 3, kn ? kn.sf[1] : -1)];
    return { qf: qf, sf: sf, champ: play(sf[0], sf[1], 5, kn ? kn.champ : -1) };
  }

  /** Сітка з Liquipedia (усі 4 пари чвертьфіналів: R1M1 і R1M2 ведуть у перший півфінал) у форматі PO_PAIRS; інакше null. */
  function lpBracket(M, results) {
    var seeds = new Array(8), used = {};
    for (var k = 0; k < 4; k++) {
      var r = (results || []).filter(function (x) { return x && x.round === 1 && x.slot === k + 1; })[0];
      var a = r ? M.gIdx[r.a] : null, b = r ? M.gIdx[r.b] : null;
      if (a == null || b == null || a === b || used[a] || used[b]) return null;
      used[a] = used[b] = 1;
      seeds[PO_PAIRS[k][0]] = a; seeds[PO_PAIRS[k][1]] = b;
    }
    return seeds;
  }
  /** Ті самі пари в тих самих половинах сітки? */
  function sameBracket(x, y) {
    function halves(sd) {
      return [0, 1].map(function (h) {
        return [0, 1].map(function (j) { var p = PO_PAIRS[2 * h + j]; return [sd[p[0]], sd[p[1]]].sort().join('-'); }).sort().join('+');
      }).sort().join('|');
    }
    return halves(x) === halves(y);
  }
  /** Зіграні матчі плей-оф (пари шукаємо за командами, а не за місцем у сітці). */
  function knownPlayoffs(M, seeds, results) {
    var kn = { qf: [-1, -1, -1, -1], sf: [-1, -1], champ: -1, n: 0 };
    function find(round, x, y) {
      var r = (results || []).filter(function (q) {
        if (!q || q.round !== round || !q.winner) return false;
        var a = M.gIdx[q.a], b = M.gIdx[q.b];
        return (a === x && b === y) || (a === y && b === x);
      })[0];
      var w = r ? M.gIdx[r.winner] : null;
      return w === x || w === y ? w : -1;
    }
    for (var i = 0; i < 4; i++) { kn.qf[i] = find(1, seeds[PO_PAIRS[i][0]], seeds[PO_PAIRS[i][1]]); if (kn.qf[i] >= 0) kn.n++; }
    for (var k = 0; k < 2; k++) {
      if (kn.qf[2 * k] < 0 || kn.qf[2 * k + 1] < 0) continue;
      kn.sf[k] = find(2, kn.qf[2 * k], kn.qf[2 * k + 1]);
      if (kn.sf[k] >= 0) kn.n++;
    }
    if (kn.sf[0] >= 0 && kn.sf[1] >= 0) { kn.champ = find(3, kn.sf[0], kn.sf[1]); if (kn.champ >= 0) kn.n++; }
    return kn;
  }

  /** Усі 128 узгоджених карток плей-оф для відомої сітки (глобальні індекси команд). */
  function playoffCards(seeds) {
    var out = [];
    for (var m = 0; m < 16; m++) {
      var qf = [];
      for (var i = 0; i < 4; i++) qf.push(seeds[PO_PAIRS[i][(m >> i) & 1]]);
      for (var s = 0; s < 4; s++) {
        var sf = [qf[s & 1], qf[2 + ((s >> 1) & 1)]];
        for (var c = 0; c < 2; c++) out.push({ qf: qf.slice(), sf: sf.slice(), champ: sf[c] });
      }
    }
    return out;
  }

  /**
   * Плей-оф: шанси команд (вийти в плей-оф, півфінал, фінал, чемпіон) і, коли сітка відома
   * (остання Swiss-стадія зіграна), оцінка картки та найкраща з 128 узгоджених карток.
   * Картка: {qf: [id — переможці чвертьфіналів], sf: [id — фіналісти], champion: id}.
   * Виклики Pick'Em: ≥2 правильні QF, ≥1 правильний SF, правильний чемпіон.
   */
  function runPlayoffs(M, card, opts) {
    opts = opts || {};
    var N = opts.sims || DEFAULTS.sims, sd = opts.sd == null ? DEFAULTS.sd : opts.sd;
    var rng = mulberry32((opts.seed || DEFAULTS.seed) + 7);
    var vi = M.keys.length - 1, G = M.teams.length, S = M.stages[vi], g, i, s, warnings = M.warnings.slice();
    var kq = S.fixed && stageComplete(S) ? qualifiersOf(simulateMajorOnce(M, mulberry32(1), 0, vi).stages[vi]) : null;
    var ours = kq && kq.ok ? kq.list : null, seeds = ours, source = ours ? 'model' : null;
    // Сітка з Liquipedia головніша за наш розрахунок сідів (і з'являється, щойно її там заповнять).
    var lp = lpBracket(M, opts.results);
    if (lp) {
      if (ours && !sameBracket(lp, ours)) warnings.push('Сітка плей-оф на Liquipedia відрізняється від нашого розрахунку сідів — беремо Liquipedia.');
      seeds = lp; source = 'liquipedia';
    }
    var kn = seeds ? knownPlayoffs(M, seeds, opts.results) : null;
    var reach = new Float64Array(G), wQF = new Float64Array(G), wSF = new Float64Array(G), wF = new Float64Array(G), seedPos = new Float64Array(G);
    var st = seeds ? { qf: new Uint8Array(N * 4), sf: new Uint8Array(N * 2), ch: new Uint8Array(N) } : null;
    for (s = 0; s < N; s++) {
      var o = simulateMajorOnce(M, rng, sd, vi), q = seeds || qualifiersOf(o.stages[vi]).list;
      var r = playoffsOnce(q, o.th, rng, kn);
      for (i = 0; i < 8; i++) { reach[q[i]]++; seedPos[q[i]] += i; }
      for (i = 0; i < 4; i++) wQF[r.qf[i]]++;
      wSF[r.sf[0]]++; wSF[r.sf[1]]++; wF[r.champ]++;
      if (st) {
        for (i = 0; i < 4; i++) st.qf[s * 4 + i] = r.qf[i];
        st.sf[s * 2] = r.sf[0]; st.sf[s * 2 + 1] = r.sf[1]; st.ch[s] = r.champ;
      }
    }
    function evalCard(c, S2, n) {               // c: {qf: [g], sf: [g], champ: g | -1}; S2, n — інший набір симуляцій сітки
      S2 = S2 || st; n = n || N;
      var inQ = new Uint8Array(G), inS = new Uint8Array(G), p1 = 0, p2 = 0, p3 = 0, all = 0, dist = [0, 0, 0, 0];
      c.qf.forEach(function (x) { inQ[x] = 1; });
      c.sf.forEach(function (x) { inS[x] = 1; });
      for (var k = 0; k < n; k++) {
        var nq = inQ[S2.qf[k * 4]] + inQ[S2.qf[k * 4 + 1]] + inQ[S2.qf[k * 4 + 2]] + inQ[S2.qf[k * 4 + 3]];
        var a = nq >= 2 ? 1 : 0, b = (inS[S2.sf[k * 2]] + inS[S2.sf[k * 2 + 1]]) >= 1 ? 1 : 0, ch = S2.ch[k] === c.champ ? 1 : 0;
        p1 += a; p2 += b; p3 += ch; dist[a + b + ch]++;
        if (a + b + ch === 3) all++;
      }
      return { pQF: p1 / n, pSF: p2 / n, pChamp: p3 / n, pAll: all / n, expected: (p1 + p2 + p3) / n,
        dist: dist.map(function (x) { return x / n; }) };
    }
    function ids(c, m) {
      var out = { card: { qf: c.qf.map(function (x) { return M.teams[x].id; }), sf: c.sf.map(function (x) { return M.teams[x].id; }),
        champion: c.champ >= 0 ? M.teams[c.champ].id : null } };
      Object.keys(m).forEach(function (k) { out[k] = m[k]; });
      return out;
    }
    /** Лише коректні піки картки для сітки sd: команда в сітці, не більше одного піку на матч чи половину сітки. */
    function validCard(sd, cd) {
      var pos = {}, uc = { qf: [], sf: [], champ: -1 }, usedQ = {}, usedH = {}, matchOf = {};
      sd.forEach(function (x, j) { pos[x] = j; });
      PO_PAIRS.forEach(function (p, mi) { matchOf[p[0]] = mi; matchOf[p[1]] = mi; });
      (cd.qf || []).forEach(function (id) {
        var x = M.gIdx[id];
        if (x == null || pos[x] == null || usedQ[matchOf[pos[x]]]) return;
        usedQ[matchOf[pos[x]]] = 1; uc.qf.push(x);
      });
      (cd.sf || []).forEach(function (id) {
        var x = M.gIdx[id];
        if (x == null || pos[x] == null) return;
        var half = matchOf[pos[x]] < 2 ? 0 : 1;
        if (usedH[half]) return;
        usedH[half] = 1; uc.sf.push(x);
      });
      var cx = cd.champion != null ? M.gIdx[cd.champion] : null;
      if (cx != null && pos[cx] != null) uc.champ = cx;
      return { uc: uc, pos: pos, matchOf: matchOf };
    }
    var best = null, user = null;
    if (seeds) {
      playoffCards(seeds).forEach(function (c) {
        var m = evalCard(c);
        if (!best || m.expected > best.m.expected + 1e-12 || (Math.abs(m.expected - best.m.expected) <= 1e-12 && m.pAll > best.m.pAll)) best = { c: c, m: m };
      });
      if (card) {
        var vc = validCard(seeds, card), uc = vc.uc, pos = vc.pos, matchOf = vc.matchOf;
        user = ids(uc, evalCard(uc));
        user.complete = uc.qf.length === 4 && uc.sf.length === 2 && uc.champ >= 0;
        if (kn && kn.n) {
          // Статус кожного піку і кожного виклику: зайшов, згорів чи ще в грі.
          var lost = function (x, upto) {            // вибула до півфіналу (upto=1) чи до фіналу (upto=2)
            var mi = matchOf[pos[x]], h = mi < 2 ? 0 : 1;
            return (kn.qf[mi] >= 0 && kn.qf[mi] !== x) || (upto > 1 && kn.sf[h] >= 0 && kn.sf[h] !== x);
          };
          var stt = { qf: {}, sf: {}, champion: null }, qh = 0, qo = 0, sh = 0, so = 0;
          uc.qf.forEach(function (x) {
            var w = kn.qf[matchOf[pos[x]]], v = w < 0 ? 'open' : w === x ? 'hit' : 'dead';
            stt.qf[M.teams[x].id] = v; if (v === 'hit') qh++; if (v === 'open') qo++;
          });
          uc.sf.forEach(function (x) {
            var w = kn.sf[matchOf[pos[x]] < 2 ? 0 : 1], v = w === x ? 'hit' : lost(x, 2) ? 'dead' : 'open';
            stt.sf[M.teams[x].id] = v; if (v === 'hit') sh++; if (v === 'open') so++;
          });
          if (uc.champ >= 0) stt.champion = kn.champ === uc.champ ? 'hit' : kn.champ >= 0 || lost(uc.champ, 2) ? 'dead' : 'open';
          stt.challenges = { qf: qh >= 2 ? 'hit' : qh + qo < 2 ? 'dead' : 'open', sf: sh >= 1 ? 'hit' : so === 0 ? 'dead' : 'open',
            champ: uc.champ < 0 ? 'dead' : stt.champion };
          user.status = stt;
        }
      }
    }
    // Сітка ще невідома: найімовірніша (8 команд з найбільшим шансом потрапити в плей-оф, сіди — за середнім місцем)
    // і найкраща картка моделі саме для неї. Лише для перегляду: піки можна буде робити, коли сітка стане відомою.
    var projected = null;
    if (!seeds) {
      var cand = [];
      for (g = 0; g < G; g++) if (reach[g]) cand.push(g);
      cand.sort(function (a, b) { return reach[b] - reach[a]; });
      var top = cand.slice(0, 8);
      if (top.length === 8) {
        top.sort(function (a, b) { return seedPos[a] / reach[a] - seedPos[b] / reach[b]; });
        var N2 = Math.min(N, 20000), prng = mulberry32((opts.seed || DEFAULTS.seed) + 11), th2 = new Float64Array(G);
        var pst = { qf: new Uint8Array(N2 * 4), sf: new Uint8Array(N2 * 2), ch: new Uint8Array(N2) };
        var pQ = new Float64Array(G), pS = new Float64Array(G), pC = new Float64Array(G), pbest = null;
        for (s = 0; s < N2; s++) {
          for (g = 0; g < G; g++) th2[g] = M.thBase[g] + (sd ? sd * gauss(prng) : 0);
          var r2 = playoffsOnce(top, th2, prng);
          for (i = 0; i < 4; i++) { pst.qf[s * 4 + i] = r2.qf[i]; pQ[r2.qf[i]]++; }
          pst.sf[s * 2] = r2.sf[0]; pst.sf[s * 2 + 1] = r2.sf[1]; pS[r2.sf[0]]++; pS[r2.sf[1]]++;
          pst.ch[s] = r2.champ; pC[r2.champ]++;
        }
        playoffCards(top).forEach(function (c) {
          var mm = evalCard(c, pst, N2);
          if (!pbest || mm.expected > pbest.m.expected + 1e-12 || (Math.abs(mm.expected - pbest.m.expected) <= 1e-12 && mm.pAll > pbest.m.pAll)) pbest = { c: c, m: mm };
        });
        projected = {
          sims: N2, seeds: top.map(function (x) { return M.teams[x].id; }),
          matches: PO_PAIRS.map(function (p) { var a = top[p[0]], b = top[p[1]]; return { a: M.teams[a].id, b: M.teams[b].id, pA: pQ[a] / N2 }; }),
          teams: top.map(function (x) { return { id: M.teams[x].id, pReach: reach[x] / N, pSF: pQ[x] / N2, pFinal: pS[x] / N2, pChamp: pC[x] / N2 }; }),
          best: ids(pbest.c, pbest.m), user: null
        };
        if (card) {                               // твоя чернетка на прогнозованій сітці
          var pu = validCard(top, card).uc;
          projected.user = ids(pu, evalCard(pu, pst, N2));
          projected.user.complete = pu.qf.length === 4 && pu.sf.length === 2 && pu.champ >= 0;
        }
      }
    }
    var teams = [];
    for (g = 0; g < G; g++) {
      if (!reach[g]) continue;
      teams.push({ id: M.teams[g].id, name: M.teams[g].name, seed: ours ? ours.indexOf(g) + 1 : seeds ? seeds.indexOf(g) + 1 : null, expSeed: seedPos[g] / reach[g] + 1,
        pReach: reach[g] / N, pSF: wQF[g] / N, pFinal: wSF[g] / N, pChamp: wF[g] / N });
    }
    teams.sort(function (a, b) { return (b.pChamp - a.pChamp) || (b.pReach - a.pReach); });
    return {
      stage: 'playoffs', sims: N, bracketKnown: !!seeds, source: source,
      seeds: seeds ? seeds.map(function (x) { return M.teams[x].id; }) : null,
      seedNums: ours ? (function () { var o = {}; ours.forEach(function (x, j) { o[M.teams[x].id] = j + 1; }); return o; })() : null,
      results: kn ? { qf: kn.qf.map(function (x) { return x >= 0 ? M.teams[x].id : null; }), sf: kn.sf.map(function (x) { return x >= 0 ? M.teams[x].id : null; }),
        champion: kn.champ >= 0 ? M.teams[kn.champ].id : null, played: kn.n } : null,
      matches: seeds ? PO_PAIRS.map(function (p) {
        var a = seeds[p[0]], b = seeds[p[1]];
        return { a: M.teams[a].id, b: M.teams[b].id, pA: wQF[a] / N };
      }) : null,
      teams: teams,
      best: best ? ids(best.c, best.m) : null,
      user: user,
      projected: projected,
      warnings: warnings
    };
  }

  // ------------------------------------- сумісність: одна стадія ---
  /** run(stage, known, card, opts): одна стадія без ланцюжка (тести і простий трекер). */
  function run(stage, known, card, opts) {
    var M = buildMajor({ stages: { stage1: stage } }, { stage1: { matches: known || [] } }, opts);
    return runMajor(M, 'stage1', card, opts);
  }

  global.Engine = {
    PRIORITY6: PRIORITY6, DEFAULTS: DEFAULTS, SLOTS: SLOTS, SLOT_SIZE: SLOT_SIZE,
    mulberry32: mulberry32, pSeries: pSeries, thetas: thetas, slotHit: slotHit, pickStatus: pickStatus,
    swissCore: swissCore, prepare: prepare, simulateOnce: simulateOnce, currentRecords: currentRecords,
    buildMajor: buildMajor, simulateMajorOnce: simulateMajorOnce, fieldOf: fieldOf, stageComplete: stageComplete,
    derivedSeeds: derivedSeeds, derivedField: derivedField, qualifiersOf: qualifiersOf, currentStageRecords: currentStageRecords,
    runMajor: runMajor, run: run, runLeague: runLeague,
    exactMaxE: exactMaxE, evalCards: evalCards, optimize: optimize, collectBits: collectBits, localSearch: localSearch,
    cardScore: cardScore, cardKey: cardKey,
    derivedPending: derivedPending, completedRounds: completedRounds,
    PO_PAIRS: PO_PAIRS, playoffsOnce: playoffsOnce, playoffCards: playoffCards, runPlayoffs: runPlayoffs
  };
})(typeof self !== 'undefined' ? self : this);
