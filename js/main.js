/*
 * Ablauf der Seite nach dem Flowchart:
 * 01 Berg wählen → 02 Analyse → 03 Simulation → 04 Empfehlung
 */
(function () {
  const WB = window.WB;
  const T = WB.terrain;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  const state = { step: 1, mountain: null };
  let mountain3d = null;
  let sim = null;
  let simView = null;

  // ---------- Navigation ----------
  function go(step) {
    if (step > 1 && !state.mountain) return;
    state.step = step;
    $$('.view').forEach((v) => v.classList.toggle('active', +v.dataset.view === step));
    $$('.steps button').forEach((b) => b.classList.toggle('active', +b.dataset.step === step));
    $('.topbar').classList.toggle('on-dark', step === 2 || step === 3);
    requestAnimationFrame(() => {
      if (step === 1) WB.drawDotMap($('#dotmap'), T, { gap: 10, marker: !!state.mountain });
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
    $$('.sugg[data-mountain]').forEach((li) => {
      const hit = !q || li.textContent.toLowerCase().includes(q);
      li.classList.toggle('hidden', !hit);
    });
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = $$('.sugg[data-mountain]').find((li) => !li.classList.contains('hidden'));
      if (first) choose(first.dataset.mountain);
    }
  });
  $$('.sugg[data-mountain]').forEach((li) => li.addEventListener('click', () => choose(li.dataset.mountain)));
  function choose(id) {
    state.mountain = id;
    updateNav();
    go(2);
  }

  // ---------- 02 Analyse ----------
  function initAnalyse() {
    $('#mountain-name').textContent = T.name;
    $('#mountain-place').textContent = `${T.place} · Gipfel ${Math.round(T.TOP)} m · Ausschnitt 1 × 1 km`;
    if (!mountain3d) {
      mountain3d = new WB.Mountain3D($('#mountain'), T);
      const stats = T.zoneStats();
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
        li.addEventListener('mouseenter', () => { mountain3d.highlight = li.dataset.zone; mountain3d.draw(); });
        li.addEventListener('mouseleave', () => { mountain3d.highlight = null; mountain3d.draw(); });
      });
      $$('.toolbar [data-mode]').forEach((b) =>
        b.addEventListener('click', () => {
          $$('.toolbar [data-mode]').forEach((x) => x.classList.toggle('active', x === b));
          mountain3d.mode = b.dataset.mode;
          mountain3d.draw();
        })
      );
      $$('.toolbar [data-view3d]').forEach((b) => b.addEventListener('click', () => mountain3d.setView(b.dataset.view3d)));
    } else {
      mountain3d.resize();
    }
  }

  // ---------- 03 Simulation ----------
  let raf = null;
  let last = 0;
  function initSim() {
    if (!sim) {
      sim = new WB.WaterModel(T.profile(1));
      simView = new WB.WaterView($('#profile'), sim, T);
      $$('#variant button').forEach((b) =>
        b.addEventListener('click', () => {
          $$('#variant button').forEach((x) => x.classList.toggle('active', x === b));
          sim.setVariant(b.dataset.variant);
          $('#break').disabled = sim.variant !== 'konzept';
          refresh();
        })
      );
      $('#period').addEventListener('change', (e) => (sim.factor = WB.content.rainFactor[e.target.value]));
      $('#rain').addEventListener('click', () => { sim.startRain(); loop(); });
      $('#break').addEventListener('click', () => { if (sim.breakWall()) loop(); refresh(); });
      $('#reset').addEventListener('click', () => { sim.reset(); refresh(); });
    } else {
      simView.resize();
    }
    refresh();
  }
  function loop() {
    if (raf) return;
    last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      sim.step(dt * 1.6);
      refresh();
      if (sim.done() && sim.stored() < 0.01) { raf = null; return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
  function refresh() {
    simView.draw();
    const s = sim.stats;
    const r = Math.max(1, s.regen);
    const pct = (v) => (s.regen ? Math.round((v / r) * 100) + ' %' : '–');
    const items = [
      ['Regen', s.regen ? s.regen : '–', 'Wasserpakete', '#4C7DFF', 1],
      ['Versickert', pct(s.versickert), 'im Boden gespeichert', '#5BC07A', s.versickert / r],
      ['In Mulden', pct(sim.stored()), 'versickert gerade', '#2433F0', sim.stored() / r],
      ['Geleitet', pct(s.geleitet), 'über Rinnen zur Muldenlinie', '#3FD0E0', s.geleitet / r],
      ['Abgeflossen', pct(s.abgeflossen), 'unten aus dem Hang', '#E5402A', s.abgeflossen / r],
    ];
    $('#stats').innerHTML = items
      .map(([k, v, d, c, f]) => `<div class="stat"><span>${k}</span><b>${v}</b><span>${d}</span><div class="bar" style="background:${c};width:${Math.round(Math.min(1, f) * 100)}%"></div></div>`)
      .join('');
  }

  // ---------- 04 Empfehlung ----------
  let recoDone = false;
  function initReco() {
    if (recoDone) return;
    recoDone = true;
    const stats = T.zoneStats();
    $('#reco').innerHTML = stats
      .map((z) => {
        const c = WB.content.zones[z.key];
        const groups = Object.entries(c.plants)
          .map(([g, list]) => `<div class="group">${g}</div><div class="chips">${list.map((p) => `<span class="chip">${p}</span>`).join('')}</div>`)
          .join('');
        return `<article class="zcard">
          <div class="head"><span class="sw" style="background:${z.color}"></span><h4>${z.name}</h4></div>
          <div class="tag">${z.range} · ${z.water} · ${Math.round(z.share * 100)} % der Fläche</div>
          <p>${c.idea}</p>
          <ul>${c.measures.map((m) => `<li>${m}</li>`).join('')}</ul>
          ${groups}
          ${c.open ? `<div class="open">${c.open}</div>` : ''}
        </article>`;
      })
      .join('');
    $('#toolkit').innerHTML = WB.content.toolkit.map(([a, b]) => `<li><strong>${a}</strong> – ${b}</li>`).join('');
    const total = stats.reduce((a, z) => a + z.ha, 0);
    const vers = stats.filter((z) => z.key === 'mittel' || z.key === 'auslauf').reduce((a, z) => a + z.ha, 0);
    $('#facts').innerHTML = [
      ['Berg', T.name],
      ['Gipfel', `${Math.round(T.TOP)} m`],
      ['Fläche Ausschnitt', `${total.toFixed(0)} ha`],
      ['Fläche zum Versickern', `${vers.toFixed(0)} ha`],
      ['Grenze Leiten / Versickern', '30 %'],
      ['Datenbasis', 'Beispielgelände'],
    ]
      .map(([a, b]) => `<li><span>${a}</span><strong>${b}</strong></li>`)
      .join('');
  }

  // ---------- Start ----------
  window.addEventListener('resize', () => {
    if (state.step === 1) WB.drawDotMap($('#dotmap'), T, { gap: 10, marker: !!state.mountain });
    if (state.step === 2 && mountain3d) mountain3d.resize();
    if (state.step === 3 && simView) simView.resize();
  });
  updateNav();
  go(1);

  // für Tests: #2, #3, #4 in der URL springt direkt zum Schritt
  const h = parseInt(location.hash.slice(1), 10);
  if (h > 1) { state.mountain = 'korber-kopf'; updateNav(); go(h); }
})();
