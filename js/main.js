/*
 * Ablauf der Seite nach dem Flowchart:
 * 01 Berg wählen → 02 Analyse → 03 Simulation → 04 Empfehlung
 * Analyse, Simulation und Empfehlung laufen alle auf dem 3D-Modell des Bergs.
 */
(function () {
  const WB = window.WB;
  const T = WB.terrain;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  const state = { step: 1, mountain: null, zone: 'kuppe' };
  const views = {}; // 3D-Ansichten je Schritt
  let sim = null;
  let cover = null;

  // ---------- Navigation ----------
  function go(step) {
    if (step > 1 && !state.mountain) return;
    state.step = step;
    $$('.view').forEach((v) => v.classList.toggle('active', +v.dataset.view === step));
    $$('.steps button').forEach((b) => b.classList.toggle('active', +b.dataset.step === step));
    $('.topbar').classList.toggle('on-dark', step > 1);
    $('.topbar').classList.toggle('on-cover', step === 1);
    if (step !== 1 && cover) cover.stop();
    requestAnimationFrame(() => {
      if (step === 1) {
        if (!cover) cover = WB.startCover($('#waves'), T);
        else cover.start();
      }
      if (step === 2) initAnalyse();
      if (step === 3) initSim();
      if (step === 4) initReco();
    });
    window.scrollTo(0, 0);
  }
  function updateNav() {
    $$('.steps button').forEach((b) => (b.disabled = +b.dataset.step > 1 && !state.mountain));
  }
  $$('.steps button').forEach((b) => b.addEventListener('click', () => go(+b.dataset.step)));
  $$('[data-goto]').forEach((b) => b.addEventListener('click', () => go(+b.dataset.goto)));

  // ---------- 01 Suche ----------
  const input = $('#search');
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    $$('.sugg[data-mountain]').forEach((li) => li.classList.toggle('hidden', !!q && !li.textContent.toLowerCase().includes(q)));
  });
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const first = $$('.sugg[data-mountain]').find((li) => !li.classList.contains('hidden'));
    if (first) choose(first.dataset.mountain);
  });
  $$('.sugg[data-mountain]').forEach((li) => li.addEventListener('click', () => choose(li.dataset.mountain)));
  $('#go').addEventListener('click', () => {
    const first = $$('.sugg[data-mountain]').find((li) => !li.classList.contains('hidden'));
    if (first) choose(first.dataset.mountain);
  });
  input.addEventListener('focus', () => $('.cover-search').classList.add('open'));
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.cover-search')) $('.cover-search').classList.remove('open');
  });
  function choose(id) {
    state.mountain = id;
    updateNav();
    go(2);
  }

  const stats = T.zoneStats();

  // ---------- 02 Analyse ----------
  function initAnalyse() {
    $('#mountain-name').textContent = T.name;
    $('#mountain-place').textContent = `${T.place} · Gipfel ${Math.round(T.TOP)} m · Ausschnitt ${T.SIZE / 1000} × ${T.SIZE / 1000} km`;
    if (views.analyse) return views.analyse.resize();
    const v = (views.analyse = new WB.Mountain3D($('#mountain'), T));
    $('#zones').innerHTML = stats
      .map(
        (z) => `<li data-zone="${z.key}">
          <span class="sw" style="background:${z.color}"></span>
          <span><span class="nm">${z.name}</span>${z.sub ? ` <span class="ds">${z.sub}</span>` : ''}<br>
            <span class="ds">${z.range} · ${z.water}</span><br>
            <span class="ds">Ø ${z.meanSlope.toFixed(0)} % · meist nach ${z.mainDir}</span></span>
          <span class="pc">${Math.round(z.share * 100)} %<small>${z.ha.toFixed(1)} ha</small></span>
        </li>`
      )
      .join('');
    $$('#zones li').forEach((li) => {
      li.addEventListener('mouseenter', () => { v.highlight = li.dataset.zone; v.invalidate(); });
      li.addEventListener('mouseleave', () => { v.highlight = null; v.invalidate(); });
    });
    $$('.view-analyse [data-mode]').forEach((b) =>
      b.addEventListener('click', () => {
        $$('.view-analyse [data-mode]').forEach((x) => x.classList.toggle('active', x === b));
        v.mode = b.dataset.mode;
        v.invalidate();
      })
    );
    $$('.view-analyse [data-view3d]').forEach((b) => b.addEventListener('click', () => v.setView(b.dataset.view3d)));
    bindToggles('.view-analyse', v);
  }

  // Schalter „Konzept“ und „Beschriftung“
  function bindToggles(scope, v) {
    $$(`${scope} [data-toggle]`).forEach((b) => {
      const key = { concept: 'showConcept', labels: 'showLabels', paths: 'showPaths' }[b.dataset.toggle];
      b.classList.toggle('on', !!v[key]);
      b.addEventListener('click', () => {
        v[key] = !v[key];
        b.classList.toggle('on', v[key]);
        v.invalidate();
      });
    });
  }

  // ---------- 03 Simulation (auf dem 3D-Modell) ----------
  let raf = null;
  let last = 0;
  function initSim() {
    if (views.sim) { views.sim.resize(); return refresh(); }
    sim = new WB.WaterModel3D(T);
    const v = (views.sim = new WB.Mountain3D($('#sim3d'), T, { mode: 'sim' }));
    v.showConcept = true;
    bindToggles('.view-sim', v);
    v.onOverlay = (ctx, view) => WB.drawWater(ctx, view, sim);
    v.invalidate();
    $$('#variant button').forEach((b) =>
      b.addEventListener('click', () => {
        $$('#variant button').forEach((x) => x.classList.toggle('active', x === b));
        sim.setVariant(b.dataset.variant);
        v.showConcept = sim.variant === 'konzept';
        $('#break').disabled = sim.variant !== 'konzept';
        v.invalidate();
        refresh();
      })
    );
    $$('.view-sim [data-v3]').forEach((b) =>
      b.addEventListener('click', () => {
        $$('.view-sim [data-v3]').forEach((x) => x.classList.toggle('active', x === b));
        v.setView(b.dataset.v3);
      })
    );
    $('#period').addEventListener('change', (e) => (sim.factor = WB.content.rainFactor[e.target.value]));
    $('#rain').addEventListener('click', () => { sim.startRain(); loop(); });
    $('#break').addEventListener('click', () => { if (sim.breakWall()) loop(); refresh(); });
    $('#reset').addEventListener('click', () => { sim.reset(); refresh(); });
    refresh();
  }
  function loop() {
    if (raf) return;
    last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      sim.step(dt * 1.5);
      refresh();
      if (sim.done() && sim.stored() < 0.01) { raf = null; return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
  function refresh() {
    if (!views.sim) return;
    views.sim.draw();
    const s = sim.stats;
    const r = Math.max(1, s.regen);
    const pct = (v) => (s.regen ? Math.round((v / r) * 100) + ' %' : '–');
    const items = [
      ['Regen', s.regen ? s.regen : '–', 'Wasserpakete', '#5C7CFF', 1],
      ['Versickert', pct(s.versickert), 'im Boden', '#A8A8A8', s.versickert / r],
      ['In Mulden', pct(sim.stored()), 'versickert gerade', '#2433F0', sim.stored() / r],
      ['Geleitet', pct(s.geleitet), 'über Rinnen', '#9FE0FF', s.geleitet / r],
      ['Richtung Ort', pct(s.ort), 'abgeflossen', '#E5402A', s.ort / r],
    ];
    $('#stats').innerHTML = items
      .map(([k, v, d, c, f]) => `<div class="stat"><span>${k}</span><b>${v}</b><span>${d}</span><div class="bar" style="background:${c};width:${Math.round(Math.min(1, f) * 100)}%"></div></div>`)
      .join('');
  }

  // ---------- 04 Empfehlung (Zone auf dem 3D-Modell wählen) ----------
  function initReco() {
    if (views.reco) return views.reco.resize();
    const v = (views.reco = new WB.Mountain3D($('#reco3d'), T, { mode: 'reco' }));
    v.showConcept = true;
    v.onPick = (hit) => selectZone(hit.zone);
    bindToggles('.view-reco', v);
    $('#zone-tabs').innerHTML = stats
      .map((z) => `<button data-zone="${z.key}"><i style="background:${z.color}"></i>${z.name}</button>`)
      .join('');
    $$('#zone-tabs button').forEach((b) => b.addEventListener('click', () => selectZone(b.dataset.zone)));
    $('#toolkit').innerHTML = WB.content.toolkit.map(([a, b]) => `<li><strong>${a}</strong> – ${b}</li>`).join('');
    const total = stats.filter((z) => z.key !== 'ort').reduce((a, z) => a + z.ha, 0);
    const vers = stats.filter((z) => z.key === 'mittel' || z.key === 'auslauf').reduce((a, z) => a + z.ha, 0);
    $('#facts').innerHTML = [
      ['Berg', T.name],
      ['Gipfel', `${Math.round(T.TOP)} m`],
      ['Fläche Hang (ohne Ort)', `${total.toFixed(0)} ha`],
      ['Fläche zum Versickern', `${vers.toFixed(0)} ha`],
      ['Grenze Leiten / Versickern', '30 %'],
      ['Datenbasis', 'STL-Modell 1:13333'],
    ]
      .map(([a, b]) => `<li><span>${a}</span><strong>${b}</strong></li>`)
      .join('');
    selectZone(state.zone);
  }
  function selectZone(key) {
    state.zone = key;
    const v = views.reco;
    v.highlight = key;
    v.invalidate();
    $$('#zone-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.zone === key));
    const z = stats.find((s) => s.key === key);
    const c = WB.content.zones[key] || WB.content.ortInfo;
    const groups = Object.entries(c.plants)
      .map(([g, list]) => `<div class="group">${g}</div><div class="chips dark">${list.map((p) => `<span class="chip">${p}</span>`).join('')}</div>`)
      .join('');
    $('#zone-detail').innerHTML = `
      <p class="eyebrow">04 · Empfehlung</p>
      <h2>${z.name}</h2>
      <p class="muted">${z.range} · ${z.water} · ${Math.round(z.share * 100)} % der Fläche (${z.ha.toFixed(1)} ha)</p>
      <p>${c.idea}</p>
      <ul class="measures">${c.measures.map((m) => `<li>${m}</li>`).join('')}</ul>
      ${groups}
      ${c.open ? `<div class="open">${c.open}</div>` : ''}`;
  }

  // ---------- Start ----------
  window.addEventListener('resize', () => {
    const v = { 2: views.analyse, 3: views.sim, 4: views.reco }[state.step];
    if (v) v.resize();
  });
  updateNav();
  go(1);

  // für Tests: #2, #3, #4 in der URL springt direkt zum Schritt
  const h = parseInt(location.hash.slice(1), 10);
  if (h > 1) { state.mountain = 'korber-kopf'; updateNav(); go(h); }
})();
