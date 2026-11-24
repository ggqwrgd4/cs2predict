/* cs2predict — симулятор стадії: сітка Swiss по раундах (0-0 → 3-0 / 0-3), клік по команді = «вона виграє».
 * Зіграні матчі беруться з Liquipedia, решту дограєш сам (або «Випадково» / «За сідом»). Наступний раунд
 * жеребкує рушій за правилами Valve. Шанс картки рахує сторінка (режим «що як»), тут — лише сітка.
 *
 * SwissSim.render(el, ctx). ctx від app.js:
 *   stage, cfg, live() — результати з припущеннями, realLive() — лише справжні, card — картка {p30, adv, p03},
 *   teamName(id), logo(id, px), esc(s), fmtPct(p), p5 — шанс 5+ картки в цьому сценарії (або null), running,
 *   set(round, pairs, winners) — winners: {"a|b": id | null}; без перерахунку,
 *   commit() — перерахувати сторінку, resetFrom(round) — зняти припущення з round і далі.
 */
(function (global) {
  'use strict';
  var E = function () { return global.Engine; };
  // Скільки матчів і з якими рекордами в кожному раунді Swiss на 16 команд — завжди однаково.
  var GROUPS = [null, [[0, 0, 8]], [[1, 0, 4], [0, 1, 4]], [[2, 0, 2], [1, 1, 4], [0, 2, 2]], [[2, 1, 3], [1, 2, 3]], [[2, 2, 3]]];
  var BUCKETS = [['3-0', 3, 0, 'win'], ['3-1', 3, 1, 'win'], ['3-2', 3, 2, 'win'], ['2-3', 2, 3, 'lose'], ['1-3', 1, 3, 'lose'], ['0-3', 0, 3, 'lose']];

  function key(a, b) { return a < b ? a + '|' + b : b + '|' + a; }

  /** Стан стадії: раунди з парами (відомими чи нашим жеребкуванням), рекорди, хто вже вийшов/вилетів. */
  function model(ctx, liveObj) {
    var Eng = E(), M = Eng.buildMajor(ctx.cfg, liveObj || ctx.live()), si = M.keys.indexOf(ctx.stage);
    if (si < 0) return null;
    var field = Eng.fieldOf(M, si);
    if (!field) return { noField: true, prev: si > 0 ? M.stages[si - 1].name : '' };
    var S = M.stages[si], id = function (g) { return M.teams[g].id; };
    var real = {};
    ((ctx.realLive()[ctx.stage] || {}).matches || []).forEach(function (m) { if (m.winner) real[m.round + ':' + key(m.a, m.b)] = m.winner; });
    var w = {}, l = {}, seed = {}, rounds = [null], open = null;
    field.forEach(function (g, i) { w[id(g)] = 0; l[id(g)] = 0; seed[id(g)] = i + 1; });
    for (var r = 1; r <= 5; r++) {
      var list = S.known[r], derived = false;
      if (!list || !list.length) {
        var dp = Eng.derivedPending(M, si);
        if (dp && dp.si === si && dp.round === r) { list = dp.list; derived = true; } else break;
      }
      var ms = list.map(function (k) {
        var a = id(k.a), b = id(k.b), win = k.w >= 0 ? id(k.w) : null;
        return { a: a, b: b, win: win, real: !!real[r + ':' + key(a, b)], rec: w[a] + '-' + l[a],
          bo: S.bo3All || w[a] === 2 || l[a] === 2 ? 3 : 1, ga: k.a, gb: k.b };
      });
      rounds.push({ r: r, matches: ms, derived: derived, done: ms.every(function (m) { return m.win; }) });
      ms.forEach(function (m) { if (m.win) { var lo = m.win === m.a ? m.b : m.a; w[m.win]++; l[lo]++; } });
      if (!rounds[r].done) { open = r; break; }
    }
    if (open == null && rounds.length <= 5 && rounds.length > 1 && rounds[rounds.length - 1].done) open = null;
    return { M: M, si: si, rounds: rounds, open: open, w: w, l: l, seed: seed, th: M.thBase,
      complete: Object.keys(w).every(function (t) { return w[t] === 3 || l[t] === 3; }) };
  }

  /** Переможці для ще не вирішених матчів раунду: 'seed' — вищий сід, 'random' — за шансами моделі. */
  function autoWinners(md, rd, mode) {
    var out = {};
    rd.matches.forEach(function (m) {
      if (m.win) return;
      var winner;
      if (mode === 'seed') winner = md.seed[m.a] <= md.seed[m.b] ? m.a : m.b;
      else {
        var p = E().pSeries(1 / (1 + Math.exp(-(md.th[m.ga] - md.th[m.gb]))), m.bo);
        winner = Math.random() < p ? m.a : m.b;
      }
      out[key(m.a, m.b)] = winner;
    });
    return out;
  }
  function pairsOf(rd) { return rd.matches.map(function (m) { return { a: m.a, b: m.b }; }); }

  function fillRound(ctx, r, mode) {
    var md = model(ctx), rd = md && md.rounds[r];
    if (!rd || rd.done) return;
    ctx.set(r, pairsOf(rd), autoWinners(md, rd, mode));
    ctx.commit();
  }
  function fillAll(ctx, mode) {
    for (var guard = 0; guard < 6; guard++) {
      var md = model(ctx);
      if (!md || md.noField || md.open == null) break;
      var rd = md.rounds[md.open];
      ctx.set(md.open, pairsOf(rd), autoWinners(md, rd, mode));
    }
    ctx.commit();
  }

  function teamBtn(ctx, m, t, r) {
    var won = m.win === t, lost = m.win && m.win !== t, cls = 'sm-t' + (won ? (m.real ? ' won real' : ' won') : '') + (lost ? ' lost' : '') + (m.real ? ' ro' : '');
    var tip = ctx.teamName(t) + (m.real ? (won ? ' · виграли' : ' · програли') : won ? ' · твоє припущення: виграють' : ' · натисни: виграють');
    return '<button class="' + cls + '" data-sim="pick" data-r="' + r + '" data-a="' + ctx.esc(m.a) + '" data-b="' + ctx.esc(m.b) + '" data-t="' + ctx.esc(t) + '"' +
      (m.real ? ' disabled' : '') + ' data-tip="' + ctx.esc(tip) + '" aria-label="' + ctx.esc(tip) + '">' + ctx.logo(t, 34) + '</button>';
  }

  function render(el, ctx) {
    if (!E()) { el.innerHTML = ''; return; }
    var md = model(ctx);
    if (!md) { el.hidden = true; return; }
    el.hidden = false;
    var esc = ctx.esc, html = '<div class="label">Симулятор стадії</div>';
    if (md.noField) {
      el.innerHTML = html + '<p class="hint">Склад стадії ще не відомий. Дограй спершу ' + esc(md.prev) + ' — у її симуляторі або дочекайся результатів.</p>';
      return;
    }
    var assumed = 0;
    md.rounds.forEach(function (rd) { if (rd) rd.matches.forEach(function (m) { if (m.win && !m.real) assumed++; }); });
    html += '<p class="hint">Натисни на команду — вона виграє матч. Наступний раунд рушій жеребкує сам за правилами Valve. Сіре — уже зіграно насправді.</p>';
    html += '<div class="sim-bar"><button class="btn sm" data-sim="all" data-mode="seed">Дограти за сідами</button>' +
      '<button class="btn sm" data-sim="all" data-mode="random">Дограти випадково</button>' +
      (assumed ? '<button class="btn sm" data-sim="reset" data-r="1">Повернути реальні результати</button>' : '') +
      '<span class="sim-p">' + (ctx.p5 != null ? 'Шанс 5+ у цьому сценарії: <b>' + ctx.fmtPct(ctx.p5) + '</b>' + (ctx.running ? ' …' : '') : '') + '</span></div>';
    html += '<div class="sim-wrap"><div class="sim">';
    for (var r = 1; r <= 5; r++) {
      var rd = md.rounds[r], canFill = rd && !rd.done, canReset = rd && rd.matches.some(function (m) { return m.win && !m.real; });
      html += '<div class="sim-col"><div class="sim-h"><span>Раунд ' + r + '</span>' + (rd ? '<span class="sim-acts">' +
        '<button class="ib" data-sim="reset" data-r="' + r + '"' + (canReset ? '' : ' disabled') + ' data-tip="Зняти припущення з цього раунду й далі">↺</button>' +
        '<button class="ib" data-sim="fill" data-mode="random" data-r="' + r + '"' + (canFill ? '' : ' disabled') + ' data-tip="Випадково, за шансами моделі">⤨</button>' +
        '<button class="ib" data-sim="fill" data-mode="seed" data-r="' + r + '"' + (canFill ? '' : ' disabled') + ' data-tip="Перемагає вищий сід">сід</button></span>' : '') + '</div>';
      GROUPS[r].forEach(function (gp) {
        var rec = gp[0] + '-' + gp[1], ms = rd ? rd.matches.filter(function (m) { return m.rec === rec; }) : [];
        html += '<div class="sim-g"><div class="sim-rec">' + rec + '</div>';
        for (var i = 0; i < gp[2]; i++) {
          var m = ms[i];
          html += m ? '<div class="sim-m' + (m.bo === 3 ? ' bo3' : '') + '">' + teamBtn(ctx, m, m.a, r) + '<span class="vs">' + (m.bo === 3 ? 'Bo3' : 'vs') + '</span>' + teamBtn(ctx, m, m.b, r) + '</div>'
            : '<div class="sim-m empty"><span class="q">?</span><span class="vs">vs</span><span class="q">?</span></div>';
        }
        html += '</div>';
      });
      html += '</div>';
    }
    // Підсумок: хто як вийшов чи вилетів (і чи збігається з твоєю карткою).
    var card = ctx.card, slotOf = {};
    ['p30', 'adv', 'p03'].forEach(function (sl) { (card[sl] || []).forEach(function (t) { slotOf[t] = sl; }); });
    var hits = 0, decided = 0;
    html += '<div class="sim-col sim-res"><div class="sim-h"><span>Підсумок</span></div>';
    BUCKETS.forEach(function (b) {
      var ts = Object.keys(md.w).filter(function (t) { return md.w[t] === b[1] && md.l[t] === b[2]; });
      html += '<div class="sim-b ' + b[3] + '"><div class="sim-rec">' + b[0] + '</div><div class="sim-bt">' + (ts.length ? ts.map(function (t) {
        var sl = slotOf[t], ok = sl === 'p30' ? b[0] === '3-0' : sl === 'p03' ? b[0] === '0-3' : sl === 'adv' ? b[1] === 3 && b[2] > 0 : null;
        if (sl) { decided++; if (ok) hits++; }
        return '<span class="sim-tm' + (sl ? (ok ? ' hit' : ' miss') : '') + '" data-tip="' + esc(ctx.teamName(t) + (sl ? (ok ? ' · твій пік зайшов' : ' · твій пік не зайшов') : '')) + '">' + ctx.logo(t, 30) + '</span>';
      }).join('') : '<span class="q">—</span>') + '</div></div>';
    });
    html += '</div></div></div>';
    var n = (card.p30 || []).length + (card.adv || []).length + (card.p03 || []).length;
    if (n === 10 && md.complete) html += '<p class="sim-sum">У цьому сценарії твоя картка: <b>' + hits + ' з 10</b>' + (hits >= 5 ? ' — виклик виконано ✓' : ' — замало для виклику') + '</p>';
    else if (n && decided) html += '<p class="fine">Поки що в цьому сценарії зайшло ' + hits + ' з ' + decided + ' вирішених піків.</p>';
    el.innerHTML = html;
    el.onclick = function (e) {
      var b = e.target.closest ? e.target.closest('[data-sim]') : null;
      if (!b || b.disabled) return;
      var act = b.getAttribute('data-sim'), r2 = +b.getAttribute('data-r');
      if (act === 'pick') {
        var mm = model(ctx), rr = mm && mm.rounds[r2];
        if (!rr) return;
        var a = b.getAttribute('data-a'), bb = b.getAttribute('data-b'), t = b.getAttribute('data-t'), cur = null;
        rr.matches.forEach(function (x) { if (x.a === a && x.b === bb) cur = x.win; });
        var wins = {};
        wins[key(a, bb)] = cur === t ? null : t;                 // повторний клік знімає припущення
        ctx.set(r2, pairsOf(rr), wins);
        ctx.resetFrom(r2 + 1, true);
        ctx.commit();
      } else if (act === 'fill') fillRound(ctx, r2, b.getAttribute('data-mode'));
      else if (act === 'all') fillAll(ctx, b.getAttribute('data-mode'));
      else if (act === 'reset') { ctx.resetFrom(r2); ctx.commit(); }
    };
  }

  global.SwissSim = { render: render, model: model };
})(typeof self !== 'undefined' ? self : this);
