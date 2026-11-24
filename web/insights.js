/* cs2predict insights: AI-поправки та консенсус експертів → невеликі зсуви сили команд.
 * Чистий JavaScript без залежностей (працює у Web Worker і в тестах через macOS jsc).
 * Принцип (PLAN.md §5, §8, §9): базові шанси дає модель; AI та експерти лише трохи її зсувають.
 */
(function (global) {
  'use strict';

  var SLOTS = ['p30', 'adv', 'p03'], SIZE = { p30: 2, adv: 6, p03: 2 };
  var AI_MAX_DELTA = 0.3;      // одна поправка: від −0.3 до +0.3 (логіт на карту)
  var AI_TEAM_CAP = 0.25;      // сума поправок AI на команду
  var EXP_WEIGHT = 0.15;       // вага експертів у фінальній моделі
  var EXP_CAP = 0.15;          // найбільший зсув від експертів на команду
  var AI_FACTORS = { visa_travel: 'поїздка й візи', illness: 'здоров\'я', form: 'форма', map_pool: 'мап-пул',
    roster_change: 'зміна складу', stand_in: 'стендін', other: 'інше' };
  // Що пік експерта означає для шансу команди вийти зі стадії (м'які мітки з docs/research.md):
  // пік на 3:0 справджується як «вийшла» у ≈80% випадків, на 3:1/3:2 — ≈60%, на 0:3 — ≈20%, без піку — ≈37%.
  var Q_PICK = { p30: 0.80, adv: 0.60, p03: 0.20, none: 0.37 };

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function logit(p) { return Math.log(p / (1 - p)); }
  function expit(x) { return 1 / (1 + Math.exp(-x)); }

  /**
   * AI-файл → придатні поправки й сумарний зсув на команду.
   * known: {id: назва} усіх команд; manual: {id: 1} — команди з ручною поправкою (стендіни вже враховано).
   */
  function sanitizeAI(ai, known, manual) {
    var items = [], deltas = {}, skipped = [], list = ai && ai.adjustments;
    if (list != null && !Array.isArray(list)) skipped.push('поле adjustments має бути списком');
    (Array.isArray(list) ? list : []).forEach(function (a, idx) {
      var why = null, team = a && typeof a.team === 'string' ? a.team.trim().toLowerCase() : '';
      if (!a || typeof a !== 'object') why = 'не об\'єкт';
      else if (!team || !(team in known)) why = 'невідома команда «' + (a.team || '') + '»';
      else if (typeof a.delta !== 'number' || !isFinite(a.delta) || Math.abs(a.delta) > AI_MAX_DELTA + 1e-9) why = 'поправка поза межами ±' + AI_MAX_DELTA;
      else if (typeof a.confidence !== 'number' || !(a.confidence >= 0 && a.confidence <= 1)) why = 'впевненість має бути від 0 до 1';
      else if (!AI_FACTORS[a.factor]) why = 'невідомий чинник «' + a.factor + '»';
      else if (!Array.isArray(a.evidence) || !a.evidence.some(function (e) { return e && /^https:\/\//.test(e.url || '') && e.quote; })) why = 'немає джерела з цитатою';
      else if ((a.factor === 'stand_in' || a.factor === 'roster_change') && manual && manual[team]) why = 'склад уже враховано ручною поправкою';
      if (why) { skipped.push('Поправка ' + (idx + 1) + ': ' + why); return; }
      var eff = a.delta * a.confidence;
      items.push({ team: team, factor: a.factor, factorName: AI_FACTORS[a.factor], delta: a.delta, confidence: a.confidence, effect: eff,
        summary: String(a.summary || ''), evidence: a.evidence.filter(function (e) { return e && /^https:\/\//.test(e.url || '') && e.quote; })
          .map(function (e) { return { url: String(e.url), quote: String(e.quote), date: e.date ? String(e.date) : null }; }) });
      deltas[team] = (deltas[team] || 0) + eff;
    });
    Object.keys(deltas).forEach(function (t) { deltas[t] = clamp(deltas[t], -AI_TEAM_CAP, AI_TEAM_CAP); });
    return { items: items, deltas: deltas, skipped: skipped };
  }

  /** Картка з файлу (AI або експерт) → чиста картка з відомих команд або null, якщо вона неповна чи з повторами. */
  function cleanCard(c, inField) {
    if (!c) return null;
    var out = { p30: [], adv: [], p03: [] }, seen = {}, ok = true;
    SLOTS.forEach(function (sl) {
      (Array.isArray(c[sl]) ? c[sl] : []).forEach(function (id) {
        id = typeof id === 'string' ? id.trim().toLowerCase() : '';
        if (!id || seen[id] || (inField && !inField[id])) { ok = false; return; }
        seen[id] = 1; out[sl].push(id);
      });
      if (out[sl].length !== SIZE[sl]) ok = false;
    });
    return ok ? out : null;
  }

  /**
   * Борди експертів → голоси, консенсус, картка більшості, показник «стадності».
   * field: [id] команд стадії. Одна редакція чи панель (group) = один голос.
   */
  function summarizeBoards(boards, field) {
    var inField = {}, votes = {}, full = [], partial = 0, bad = [];
    field.forEach(function (id) { inField[id] = 1; votes[id] = { p30: 0, adv: 0, p03: 0 }; });
    (boards || []).forEach(function (b, i) {
      if (!b || typeof b !== 'object') { bad.push('Борд ' + (i + 1) + ': не об\'єкт'); return; }
      var card = cleanCard(b, inField), name = String(b.analyst || 'експерт ' + (i + 1));
      if (card) { full.push({ name: name, group: String(b.group || b.analyst || i), url: b.sourceUrl || null, card: card }); return; }
      // неповний борд: рахуємо лише його голоси
      var any = false, seen = {};
      SLOTS.forEach(function (sl) {
        (Array.isArray(b[sl]) ? b[sl] : []).forEach(function (id) {
          id = typeof id === 'string' ? id.trim().toLowerCase() : '';
          if (inField[id] && !seen[id]) { seen[id] = 1; any = true; }
        });
      });
      if (any) partial++; else bad.push('Борд «' + name + '»: немає команд цієї стадії');
    });
    var size = {};
    full.forEach(function (b) { size[b.group] = (size[b.group] || 0) + 1; });
    var wsum = 0, qsum = {};
    field.forEach(function (id) { qsum[id] = 0; });
    full.forEach(function (b) {
      var w = 1 / size[b.group], where = {};
      b.w = w; wsum += w;
      SLOTS.forEach(function (sl) { b.card[sl].forEach(function (id) { where[id] = sl; votes[id][sl] += w; }); });
      field.forEach(function (id) { qsum[id] += w * Q_PICK[where[id] || 'none']; });
    });
    var groups = Object.keys(size).length, qbar = null, majority = null, agreement = null;
    if (wsum > 0) {
      qbar = {};
      field.forEach(function (id) { qbar[id] = clamp(qsum[id] / wsum, 0.03, 0.97); });
      // зсув у логітах, щоб у сумі вийшло рівно стільки команд, скільки виходить зі стадії (половина)
      var target = field.length / 2, lo = -4, hi = 4;
      for (var it = 0; it < 40; it++) {
        var mid = (lo + hi) / 2, s = 0;
        field.forEach(function (id) { s += expit(logit(qbar[id]) + mid); });
        if (s > target) hi = mid; else lo = mid;
      }
      field.forEach(function (id) { qbar[id] = expit(logit(qbar[id]) + (lo + hi) / 2); });
      // картка більшості: найбільше голосів у слоті; за рівності — вищий консенсус (для 0:3 — нижчий)
      var used = {}, pick = function (sl, n, sign) {
        return field.filter(function (id) { return !used[id]; })
          .sort(function (a, b) { return (votes[b][sl] - votes[a][sl]) || sign * (qbar[b] - qbar[a]); })
          .slice(0, n).map(function (id) { used[id] = 1; return id; });
      };
      majority = { p30: pick('p30', 2, 1), p03: pick('p03', 2, -1), adv: [] };
      majority.adv = pick('adv', 6, 1);
      // «стадність»: у середньому яка частка піків збігається у двох різних голосів
      if (full.length >= 2) {
        var tot = 0, n = 0;
        for (var i = 0; i < full.length; i++) for (var j = i + 1; j < full.length; j++) {
          if (full[i].group === full[j].group) continue;
          var same = 0;
          SLOTS.forEach(function (sl) { full[i].card[sl].forEach(function (id) { if (full[j].card[sl].indexOf(id) >= 0) same++; }); });
          tot += same / 10; n++;
        }
        agreement = n ? tot / n : null;
      }
    }
    return {
      nFull: full.length, nPartial: partial, nGroups: groups, weight: wsum,
      votes: votes, qbar: qbar, majority: majority, agreement: agreement, problems: bad,
      boards: full.map(function (b) { return { name: b.name, group: b.group, url: b.url, card: b.card }; })
    };
  }

  /** Копія конфігу зі зсувами сили: adj команди += deltas[id]. */
  function applyDeltas(cfg, deltas) {
    var out = { stages: {} };
    Object.keys(cfg.stages).forEach(function (k) {
      var st = cfg.stages[k], copy = {};
      Object.keys(st).forEach(function (f) { copy[f] = st[f]; });
      ['teams', 'invited'].forEach(function (f) {
        if (!st[f]) return;
        copy[f] = st[f].map(function (t) {
          if (!deltas || !deltas[t.id]) return t;
          var c = {};
          Object.keys(t).forEach(function (x) { c[x] = t[x]; });
          c.adj = (t.adj || 0) + deltas[t.id];
          return c;
        });
      });
      out.stages[k] = copy;
    });
    return out;
  }

  function addDeltas(a, b) {
    var out = {};
    [a, b].forEach(function (d) { Object.keys(d || {}).forEach(function (k) { out[k] = (out[k] || 0) + d[k]; }); });
    return out;
  }

  /**
   * Експерти задають ПОРЯДОК команд, а розкид шансів беремо з моделі: команда, яка за консенсусом k-та,
   * отримує k-й за величиною шанс виходу в моделі (однакові оцінки — середнє). Так «м'які» мітки (20–80%)
   * не стискають шанси: одностайного фаворита не тягне донизу, а явного аутсайдера — догори.
   */
  function rankTargets(qbar, model) {
    var ids = Object.keys(model).filter(function (id) { return id in qbar; });
    var vals = ids.map(function (id) { return model[id]; }).sort(function (a, b) { return b - a; });
    var order = ids.slice().sort(function (a, b) { return (qbar[b] - qbar[a]) || (model[b] - model[a]); }), out = {};
    for (var i = 0; i < order.length;) {
      var j = i, avg = 0, k;
      while (j + 1 < order.length && Math.abs(qbar[order[j + 1]] - qbar[order[i]]) < 1e-9) j++;
      for (k = i; k <= j; k++) avg += vals[k];
      avg /= j - i + 1;
      for (k = i; k <= j; k++) out[order[k]] = avg;
      i = j + 1;
    }
    return out;
  }

  /**
   * Обернена симуляція: підбираємо зсуви сили так, щоб шанс виходу кожної команди в моделі
   * збігся з думкою експертів. Борди зроблено ДО стадії, тому модель беремо теж до її початку
   * (результати цієї стадії прибираємо). Ціль — rankTargets (порядок від експертів, розкид від моделі);
   * opts.rank === false — ціль сам qbar. Повертає повні зсуви; у модель іде лише їх частка (blendExperts).
   */
  function fitExperts(Engine, cfg, live, stage, qbar, opts) {
    opts = opts || {};
    var iters = opts.iters || 5, sims = opts.sims || 20000, eta = opts.eta || 0.37, deltas = {}, resid = null, target = qbar, model = null;
    var pre = {};
    Object.keys(live || {}).forEach(function (k) { pre[k] = k === stage ? { matches: [], seeds: (live[k] || {}).seeds || [] } : live[k]; });
    for (var it = 0; it < iters; it++) {
      var M = Engine.buildMajor(applyDeltas(cfg, deltas), pre);
      var r = Engine.runMajor(M, stage, null, { sims: sims, seed: 4242 + it });
      if (it === 0) {
        model = {};
        r.teams.forEach(function (t) { if (t.id in qbar && t.pIn >= 0.999) model[t.id] = t.qual; });
        if (opts.rank !== false) target = rankTargets(qbar, model);
      }
      resid = 0;
      r.teams.forEach(function (t) {
        if (!(t.id in target) || t.pIn < 0.999) return;
        var d = logit(clamp(target[t.id], 0.02, 0.98)) - logit(clamp(t.qual, 0.02, 0.98));
        resid = Math.max(resid, Math.abs(d));
        deltas[t.id] = clamp((deltas[t.id] || 0) + eta * d, -1.5, 1.5);
      });
      if (resid < 0.06) break;
    }
    return { deltas: deltas, residual: resid, target: target, model: model };
  }

  /** Частка думки експертів, яка йде у фінальну модель: 15% зсуву, не більше ±0.15 на команду. */
  function blendExperts(full) {
    var out = {};
    Object.keys(full || {}).forEach(function (k) { out[k] = clamp(EXP_WEIGHT * full[k], -EXP_CAP, EXP_CAP); });
    return out;
  }

  /**
   * AI-файли всіх стадій → одна поправка на команду. Файл пізнішої стадії головніший:
   * для команд, які він розглянув (covered) або згадав у поправках, його значення замінює попередні.
   * files: {stage: aiFile | null}; order: стадії за порядком. Повертає {deltas, byStage: {stage: sanitizeAI(...)}}.
   */
  function mergeAI(files, order, known, manual) {
    var out = {}, by = {};
    (order || []).forEach(function (st) {
      var f = files && files[st];
      if (!f || typeof f !== 'object' || f.error) return;
      var s = sanitizeAI(f, known, manual);
      by[st] = s;
      (Array.isArray(f.covered) ? f.covered : []).forEach(function (id) {
        id = typeof id === 'string' ? id.trim().toLowerCase() : '';
        if (id && id in known) out[id] = 0;
      });
      Object.keys(s.deltas).forEach(function (id) { out[id] = s.deltas[id]; });
    });
    Object.keys(out).forEach(function (id) { if (!out[id]) delete out[id]; });
    return { deltas: out, byStage: by };
  }

  /** Підгонки експертів по стадіях ({stage: {deltas}}) → зсуви, які йдуть у модель (15%); пізніша стадія головніша. */
  function mergeExperts(fits, order, skip) {
    var out = {};
    (order || []).forEach(function (st) {
      if (st === skip || !fits || !fits[st] || !fits[st].deltas) return;
      var b = blendExperts(fits[st].deltas);
      Object.keys(b).forEach(function (id) { out[id] = b[id]; });
    });
    return out;
  }

  /** Ключ підгонки: та сама думка експертів і ті самі AI-поправки → підгонку можна взяти з кешу. */
  function fitKey(stage, qbar, deltas) {
    return 'r1|' + stage + '|' + Object.keys(qbar).sort().map(function (id) {
      return id + ':' + qbar[id].toFixed(4) + ':' + ((deltas && deltas[id]) || 0).toFixed(3);
    }).join(',');
  }

  function roundDeltas(dl) {
    return Object.keys(dl || {}).sort().map(function (k) { return [k, Math.round(dl[k] * 1e4) / 1e4]; });
  }
  function hash(t) { var h = 5381, h2 = 52711; for (var i = 0; i < t.length; i++) { var c = t.charCodeAt(i); h = ((h << 5) + h + c) | 0; h2 = ((h2 << 5) + h2 + c * 31) | 0; } return (h >>> 0).toString(36) + (h2 >>> 0).toString(36) + t.length; }

  function overlay(base, top) {
    var o = {};
    Object.keys(base || {}).forEach(function (k) { o[k] = base[k]; });
    Object.keys(top || {}).forEach(function (k) { o[k] = top[k]; });
    return o;
  }

  /**
   * Повний розрахунок для однієї стадії (працює у Web Worker і в тестах).
   * d: {cfg, live, stage, ai — AI-файл цієї стадії, aiAll — зведені AI-поправки всіх стадій,
   *     boards — борди експертів цієї стадії, fitsOther — підгонки експертів інших стадій ({stage: {deltas}}), order,
   *     flags: {ai, exp} — що враховує модель, userCard, prevFit — кеш підгонки, prevCards — кеш карток, wantExpertCard, sims,
   *     fitOnly — лише підгонка експертів, без карток для порівняння і впливу на картку}.
   * Повертає поправки AI, зведення експертів, фінальні зсуви, картки для порівняння і вплив на картку користувача.
   */
  function job(Engine, d) {
    var known = {}, manual = {}, sims = d.sims || 30000;
    Object.keys(d.cfg.stages).forEach(function (k) {
      var st = d.cfg.stages[k];
      (st.teams || st.invited || []).forEach(function (t) { known[t.id] = t.name; if (t.adj) manual[t.id] = 1; });
    });
    var flags = d.flags || {}, ai = sanitizeAI(d.ai, known, manual);
    var aiAll = d.aiAll || {}, aiOn = flags.ai ? aiAll : {};
    var cfgAI = applyDeltas(d.cfg, aiOn), M = Engine.buildMajor(cfgAI, d.live), vi = M.keys.indexOf(d.stage);
    var field = vi >= 0 ? Engine.fieldOf(M, vi) : null, fieldIds = field ? field.map(function (g) { return M.teams[g].id; }) : null;
    var exp = null, full = {}, blend = {};
    if (d.boards && fieldIds) {
      var sum = summarizeBoards(d.boards, fieldIds);
      exp = { summary: sum, enough: sum.nGroups >= 3, deltaFull: {}, deltaBlend: {}, residual: null, fit: null };
      if (sum.qbar && exp.enough) {
        var key = fitKey(d.stage, sum.qbar, aiOn);
        var fit = d.prevFit && d.prevFit.key === key && d.prevFit.deltas ? d.prevFit : null;
        if (!fit) {
          var f = fitExperts(Engine, cfgAI, d.live, d.stage, sum.qbar, { sims: 15000 });
          fit = { key: key, deltas: f.deltas, residual: f.residual, target: f.target, model: f.model };
        }
        full = fit.deltas; blend = blendExperts(full);
        exp.deltaFull = full; exp.deltaBlend = blend; exp.residual = fit.residual; exp.fit = fit;
      }
    } else if (d.boards) exp = { summary: null, enough: false, waitingField: true };
    var order = d.order || ['stage1', 'stage2', 'stage3', 'playoffs'], fitsAll = overlay(d.fitsOther, {});
    if (exp && exp.fit) fitsAll[d.stage] = exp.fit;
    var expOthers = d.fitsOther ? mergeExperts(d.fitsOther, order) : (d.expOther || {});
    var expAll = d.fitsOther ? mergeExperts(fitsAll, order) : overlay(d.expOther, blend);
    var finalDeltas = addDeltas(aiOn, flags.exp ? expAll : {});
    var cards = {}, impact = null, ck = null;
    // fitOnly: лише підгонка експертів для моделі (швидко); картки для порівняння і вплив — коли відкрито «Аналітику».
    if (vi >= 0 && !d.fitOnly) {
      var inField = null;
      if (fieldIds) { inField = {}; fieldIds.forEach(function (id) { inField[id] = 1; }); }
      var own = d.ai && d.ai.ownCard ? cleanCard(d.ai.ownCard, inField || known) : null;
      // Картки для порівняння залежать лише від моделі, даних і файлів — не від картки користувача. Кешуємо.
      ck = hash(JSON.stringify([d.stage, sims, !!d.wantExpertCard, roundDeltas(finalDeltas), roundDeltas(full), d.live, own,
        exp && exp.summary ? exp.summary.majority : null]));
      if (d.prevCards && d.prevCards.key === ck && d.prevCards.cards) cards = d.prevCards.cards;
      else {
        var Mf = Engine.buildMajor(applyDeltas(d.cfg, finalDeltas), d.live);
        var evalCard = function (card) {
          var r = Engine.runMajor(Mf, d.stage, card, { sims: sims, seed: 5150 });
          return { card: card, p5: r.p5, p5se: r.p5se, eK: r.eK };
        };
        if (own) cards.ai = evalCard(own);
        if (exp && exp.summary && exp.summary.majority) cards.majority = evalCard(exp.summary.majority);
        if (d.wantExpertCard && exp && exp.enough && exp.summary.qbar) {
          // «Картка за експертами»: найкраща картка у світі, де експерти цієї стадії повністю праві.
          var Mexp = Engine.buildMajor(applyDeltas(d.cfg, addDeltas(aiOn, overlay(expOthers, full))), d.live);
          var o = Engine.optimize(Mexp, d.stage, { searchSims: 15000, selectSims: 30000, evalSims: 20000, restarts: 3 });
          if (o && o.best) cards.expert = evalCard(o.best.card);
        }
      }
      if (d.userCard) {
        var p = function (deltas) {
          return Engine.runMajor(Engine.buildMajor(applyDeltas(d.cfg, deltas), d.live), d.stage, d.userCard, { sims: sims, seed: 5150 }).p5;
        };
        impact = { base: p({}), withAI: p(aiAll), withAll: p(addDeltas(aiAll, expAll)) };
      }
    }
    return { ai: { items: ai.items, skipped: ai.skipped, deltas: ai.deltas, hasFile: !!(d.ai && !d.ai.error), own: cards.ai ? cards.ai.card : null },
      exp: exp, finalDeltas: finalDeltas, cards: cards, cardsKey: ck, impact: impact, fitOnly: !!d.fitOnly };
  }

  global.Insights = {
    AI_MAX_DELTA: AI_MAX_DELTA, AI_TEAM_CAP: AI_TEAM_CAP, EXP_WEIGHT: EXP_WEIGHT, EXP_CAP: EXP_CAP, AI_FACTORS: AI_FACTORS, Q_PICK: Q_PICK,
    sanitizeAI: sanitizeAI, cleanCard: cleanCard, summarizeBoards: summarizeBoards, applyDeltas: applyDeltas, addDeltas: addDeltas,
    fitExperts: fitExperts, rankTargets: rankTargets, blendExperts: blendExperts,
    mergeAI: mergeAI, mergeExperts: mergeExperts, fitKey: fitKey, overlay: overlay, job: job
  };
})(typeof self !== 'undefined' ? self : this);
