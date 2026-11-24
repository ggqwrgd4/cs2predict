/* Фоновий потік: симуляції, оптимізація, AI/експерти і плей-оф не блокують сторінку. */
importScripts('engine.js', 'insights.js');

self.onmessage = function (e) {
  var d = e.data, t0 = Date.now();
  try {
    var res;
    if (d.type === 'insights') res = self.Insights.job(self.Engine, d);
    else {
      var M = self.Engine.buildMajor(d.cfg, d.live);
      if (d.type === 'optimize') res = self.Engine.optimize(M, d.stage, d.opts);
      else if (d.type === 'playoffs') res = self.Engine.runPlayoffs(M, d.card, d.opts);
      else if (d.type === 'many') {
        // Шанс 5+ для кількох карток (профілів) — швидка оцінка для перемикача профілів.
        res = { results: {} };
        Object.keys(d.cards || {}).forEach(function (pid) {
          var r = self.Engine.runMajor(M, d.stage, d.cards[pid], d.opts);
          res.results[pid] = { p5: r.p5, eK: r.eK, sims: r.sims };
        });
      } else res = self.Engine.runMajor(M, d.stage, d.card, d.opts);
    }
    res.ms = Date.now() - t0;
    res.reqId = d.reqId; res.type = d.type; res.stage = d.stage; res.tag = d.tag; res.meta = d.meta;
    self.postMessage(res);
  } catch (err) {
    self.postMessage({ reqId: d.reqId, type: d.type, stage: d.stage, tag: d.tag, meta: d.meta, error: String(err && err.stack || err) });
  }
};
