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

  const state = { step: 1, mountain: null, zone: null };
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
    // Wetter
    let wxSel = null;
    const showWx = async () => {
      $$('#wx-analyse button').forEach((x) => x.classList.toggle('active', x.dataset.wx === wxSel));
      if (!wxSel) return;
      let problems, weather;
      if (wxSel === 'jetzt') {
        $('#wx-card').innerHTML = '<span class="muted">Lade aktuelles Wetter …</span>';
        const n = await getLive();
        $('#wx-card').innerHTML = liveCard(n);
        problems = liveFocus(n);
        weather = n ? { wind: n.wind, windDir: n.windDir } : null;
      } else {
        const s = W.seasonFor(wxSel, $('#wx-period').value);
        $('#wx-card').innerHTML = seasonCard(s);
        problems = W.SEASON_FOCUS[wxSel].problems;
        weather = { wind: s.wind, windDir: s.windDir };
      }
      v.problems = new Set(problems);
      v.weather = weather;
      $$('#problems li').forEach((x) => x.classList.toggle('off', !v.problems.has(x.dataset.problem)));
      $('#problems-title').textContent = `Problemzonen · ${wxSel === 'jetzt' ? 'jetzt' : W.SEASONS[wxSel].name}`;
      $('#wx-card').insertAdjacentHTML('beforeend', `<button class="cta wx-show" id="wx-show">Problemzonen ${wxSel === 'jetzt' ? 'jetzt' : 'im ' + W.SEASONS[wxSel].name} anzeigen</button>`);
      $('#wx-show').addEventListener('click', () => { setMode('probleme'); v.invalidate(); });
      v.invalidate();
    };
    $$('#wx-analyse button').forEach((b) =>
      b.addEventListener('click', () => {
        wxSel = wxSel === b.dataset.wx ? null : b.dataset.wx;
        if (!wxSel) {
          v.weather = null;
          v.problems = new Set(Object.keys(T.PROBLEMS));
          $('#wx-card').innerHTML = '<span class="muted">Oben links eine Jahreszeit wählen oder „Jetzt“ – der Berg zeigt dann die Problemzonen dieser Jahreszeit.</span>';
          $$('#wx-analyse button').forEach((x) => x.classList.remove('active'));
          $$('#problems li').forEach((x) => x.classList.remove('off'));
          $('#problems-title').textContent = 'Problemzonen · ganzjährig';
          v.invalidate();
          return;
        }
        showWx();
      })
    );
    $('#wx-period').addEventListener('change', showWx);

    // Problemzonen
    const setMode = (m) => {
      v.mode = m;
      $$('.view-analyse [data-mode]').forEach((x) => x.classList.toggle('active', x.dataset.mode === m));
    };
    $('#problems').innerHTML = T.problemStats()
      .map(
        (p) => `<li data-problem="${p.key}">
          <span class="sw" style="background:${p.color}"></span>
          <span><span class="nm">${p.name}</span><br><span class="ds">${p.why}</span></span>
          <span class="pc">${Math.round(p.share * 100)} %<small>${p.ha.toFixed(1)} ha</small></span>
        </li>`
      )
      .join('');
    $$('#problems li').forEach((li) => {
      const key = li.dataset.problem;
      li.addEventListener('click', () => {
        if (v.mode !== 'probleme') setMode('probleme');
        else if (v.problems.has(key)) v.problems.delete(key);
        else v.problems.add(key);
        $$('#problems li').forEach((x) => x.classList.toggle('off', !v.problems.has(x.dataset.problem)));
        v.invalidate();
      });
      li.addEventListener('mouseenter', () => { if (v.mode === 'probleme') { v.problemHighlight = key; v.invalidate(); } });
      li.addEventListener('mouseleave', () => { v.problemHighlight = null; v.invalidate(); });
    });
    bindToggles('.view-analyse', v);
  }

  // ---------- Wetter ----------
  const W = WB.weather;
  let liveWx = null; // zuletzt geladenes Live-Wetter
  async function getLive() {
    if (!liveWx) liveWx = await W.fetchNow();
    return liveWx;
  }
  const f1 = (v) => (Math.round(v * 10) / 10).toString().replace('.', ',');
  function seasonCard(s) {
    const per = W.PERIODS[s.period];
    const focus = W.SEASON_FOCUS[s.key];
    return `<span class="big">${f1(s.t)} °C</span>
      <span class="muted">${s.name} · ${s.months} · ${per.name} (${per.note})</span>
      <dl>
        <dt>Tag / Nacht</dt><dd>${f1(s.tmax)} / ${f1(s.tmin)} °C</dd>
        <dt>Regen</dt><dd>${Math.round(s.regen)} mm</dd>
        <dt>Verdunstung</dt><dd>${s.verdunstung} mm</dd>
        <dt>Frosttage</dt><dd>${Math.round(s.frostTage)}</dd>
        <dt>Hitzetage (≥ 30 °C)</dt><dd>${f1(s.hitzeTage)}</dd>
        <dt>Sonne</dt><dd>${s.sonne} h</dd>
        <dt>Wind (Tagesspitze)</dt><dd>${f1(s.wind)} km/h aus ${W.dirName(s.windDir)}</dd>
      </dl>
      <div class="focus">${focus.text}</div>
      <span class="src">${W.SOURCE}</span>`;
  }
  function liveCard(n) {
    if (!n) return '<span class="muted">Live-Wetter konnte nicht geladen werden (keine Internetverbindung?).</span>';
    const t = new Date(n.time);
    return `<span class="big">${f1(n.t)} °C</span>
      <span class="muted">Jetzt am Korber Kopf · ${n.text} · ${t.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr</span>
      <dl>
        <dt>Niederschlag gerade</dt><dd>${f1(n.regen)} mm</dd>
        <dt>Regen letzte 7 Tage</dt><dd>${Math.round(n.regen7)} mm</dd>
        <dt>Luftfeuchte</dt><dd>${n.feuchte} %</dd>
        <dt>Wind</dt><dd>${f1(n.wind)} km/h aus ${W.dirName(n.windDir)} (Böen ${f1(n.boeen)})</dd>
        <dt>Boden (0–1 cm)</dt><dd>${f1(n.bodenT)} °C · ${Math.round(n.boden * 100)} % Wasser</dd>
      </dl>
      <div class="focus">${n.t <= 0 ? 'Frost: Kaltluft sammelt sich jetzt in den Senken.' : n.regen > 0 ? 'Es regnet gerade – Mulden füllen sich.' : n.regen7 < 5 ? 'Seit einer Woche kaum Regen: Boden trocknet aus.' : 'Ruhige Lage.'}</div>
      <span class="src">Open-Meteo Live (CC BY 4.0)</span>`;
  }
  // Problemzonen passend zum Wetter
  function liveFocus(n) {
    if (!n) return ['frost', 'trocken', 'feucht', 'wind'];
    const p = [];
    if (n.t <= 2) p.push('frost');
    if (n.regen7 < 5 && n.t > 10) p.push('trocken');
    if (n.regen > 0 || n.regen7 > 25) p.push('feucht');
    if (n.wind > 20 || n.boeen > 40) p.push('wind');
    return p.length ? p : ['wind'];
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
    let simWx = 'sommer';
    const applySimWx = async () => {
      $$('#wx-sim button').forEach((x) => x.classList.toggle('active', x.dataset.wx === simWx));
      const period = $('#period').value;
      const AVG = 214; // mittlerer Regen je Jahreszeit (mm)
      if (simWx === 'jetzt') {
        $('#wx-sim-line').textContent = 'Lade aktuelles Wetter …';
        const n = await getLive();
        if (!n) {
          $('#wx-sim-line').textContent = 'Live-Wetter nicht erreichbar – es wird ein typischer Starkregen gezeigt.';
          Object.assign(sim, { factor: 1, soakFactor: 1, snow: false, windX: 0, windY: 0 });
        } else {
          const k = W.PERIODS[period].k;
          // Regen gerade? dann nach Stärke, sonst ein typischer Schauer; trockener Boden nimmt schlechter auf
          sim.factor = n.regen > 0 ? Math.min(2.5, 0.6 + n.regen * 1.5) : 1;
          sim.soakFactor = (n.regen7 < 5 ? 1.35 : n.regen7 > 25 ? 1.2 : 1) * (1 + 0.08 * k);
          sim.snow = n.t <= 0;
          setWind(n.wind, n.windDir);
          $('#wx-sim-line').textContent = `Jetzt: ${f1(n.t)} °C, ${n.text}, Wind ${f1(n.wind)} km/h aus ${W.dirName(n.windDir)}. ` +
            (sim.snow ? 'Unter 0 °C – es fällt Schnee.' : n.regen > 0 ? `Es regnet (${f1(n.regen)} mm).` : 'Gerade kein Regen – „Regen starten“ zeigt einen typischen Schauer.');
        }
      } else {
        const s = W.seasonFor(simWx, period);
        sim.factor = s.regen / AVG;
        // Sommer: Verdunstung > Regen → harter, trockener Boden; Hitze verstärkt das
        sim.soakFactor = 1 + Math.max(0, (s.verdunstung - s.regen) / 400) + s.hitzeTage * 0.02;
        sim.snow = simWx === 'winter' && s.tmin <= 0;
        setWind(s.wind, s.windDir);
        $('#wx-sim-line').textContent = `${s.name} ${W.PERIODS[period].name}: ${Math.round(s.regen)} mm Regen, ${f1(s.t)} °C im Mittel, ` +
          `${Math.round(s.frostTage)} Frosttage, Wind aus ${W.dirName(s.windDir)}.` + (sim.snow ? ' Nachts unter 0 °C: ein Teil fällt als Schnee.' : '');
      }
      v.weather = { wind: simWx === 'jetzt' && liveWx ? liveWx.wind : W.SEASONS[simWx]?.wind || 0, windDir: simWx === 'jetzt' && liveWx ? liveWx.windDir : W.SEASONS[simWx]?.windDir || 0 };
      v.invalidate();
    };
    function setWind(kmh, dir) {
      const r = ((dir + 180) * Math.PI) / 180; // Wind weht dorthin
      const d = kmh * 1.5;
      sim.windX = Math.sin(r) * d;
      sim.windY = -Math.cos(r) * d;
    }
    $$('#wx-sim button').forEach((b) => b.addEventListener('click', () => { simWx = b.dataset.wx; applySimWx(); }));
    $('#period').addEventListener('change', applySimWx);
    applySimWx();
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
      ['In Mulden', pct(sim.stored()), 'läuft langsam zur Öffnung', '#9FE0FF', sim.stored() / r],
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
    initPlants(v);
    bindToggles('.view-reco', v);
    $('#zone-tabs').innerHTML = stats
      .map((z) => `<button data-zone="${z.key}"><i style="background:${z.color}"></i>${z.name}</button>`)
      .join('');
    $$('#zone-tabs button').forEach((b) => b.addEventListener('click', () => selectZone(b.dataset.zone)));
    if (state.zone) selectZone(state.zone);
    else $('#zone-detail').innerHTML = '<p class="eyebrow">04 · Bepflanzung</p><h2>Zone wählen</h2><p class="muted">Klicke oben eine Zone an oder direkt auf den Berg. Rechts erscheinen dann die Pflanzen dieser Zone – auswählen, und sie werden am Berg angezeigt.</p>';
  }
  // Pflanzen auswählen und am Berg zeigen
  const plantSel = new Set();
  let plantActive = null;
  let placed = [];
  function initPlants(v) {
    placed = WB.plants.placePlants(T, WB.content.plantList);
    v.onOverlay = (ctx, view) => WB.plants.drawPlants(ctx, view, placed, plantSel, plantActive);
  }
  function togglePlant(id) {
    if (plantSel.has(id) && plantActive === id) { plantSel.delete(id); plantActive = null; }
    else { plantSel.add(id); plantActive = id; }
    refreshPlants();
  }
  function refreshPlants() {
    $$('#zone-detail .pp-chip').forEach((b) => {
      const id = +b.dataset.plant;
      b.classList.toggle('on', plantSel.has(id) && plantActive !== id);
      b.classList.toggle('active', plantActive === id);
    });
    const p = placed.find((x) => x.id === plantActive);
    const info = $('#pp-info');
    if (info) info.innerHTML = p
      ? `<strong>${p.name}</strong> · ${p.info} · ${p.cells.length ? `${p.zones.join(', ')} · ${p.cells.length} Standorte` : 'kein passender Standort im Ausschnitt'}` +
        (p.avoided ? ` · ${p.avoided} Stellen ausgelassen (${(p.meide || []).map((m) => T.PROBLEMS[m].name).join(', ')})` : '')
      : plantSel.size
        ? `${plantSel.size} Pflanzen sichtbar. Klick auf eine Pflanze hebt sie gelb hervor, zweiter Klick blendet sie aus.`
        : 'Pflanze anklicken – sie erscheint am Berg. Zweiter Klick blendet sie aus.';
    // mit Pflanzen das Konzept-Gitter ausblenden, damit die Grundformen lesbar sind
    const v = views.reco;
    const conceptOn = plantSel.size === 0;
    if (v.showConcept !== conceptOn) { v.showConcept = conceptOn; v.invalidate(); }
    else v.draw();
  }

  function selectZone(key) {
    state.zone = key;
    const v = views.reco;
    v.highlight = key;
    v.invalidate();
    $$('#zone-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.zone === key));
    const z = stats.find((s) => s.key === key);
    const c = WB.content.zones[key] || WB.content.ortInfo;
    // Pflanzen, die in dieser Zone Standorte haben, nach Grundform gruppiert
    const here = placed.filter((p) => p.cells.some((k) => T.ZONE[k] === key));
    const groups = {};
    for (const p of here) (groups[p.form] ||= []).push(p);
    const list = Object.entries(WB.plants.FORMS)
      .filter(([f]) => groups[f])
      .map(([f, g]) => `<div class="pp-group"><span>${g.name}</span>${groups[f]
        .map((p) => `<button class="pp-chip" data-plant="${p.id}">${WB.plants.icon(p.form)}${p.name}</button>`)
        .join('')}</div>`)
      .join('');
    $('#zone-detail').innerHTML = `
      <p class="eyebrow">04 · Bepflanzung</p>
      <h2>${z.name}</h2>
      <p class="muted">${z.range} · ${Math.round(z.share * 100)} % der Fläche (${z.ha.toFixed(1)} ha)</p>
      <p class="zone-idea">${c.idea}</p>
      ${here.length ? `<div class="pp-head"><strong>Pflanzen hier</strong><span><button class="linkbtn" id="pp-zone-all">alle zeigen</button> · <button class="linkbtn" id="pp-none">keine</button></span></div>
      ${list}
      <p class="pp-info" id="pp-info"></p>
      <p class="legend-forms">○ Baum · ● Nutzbaum · ▲ Busch · ✕ Kraut/Gras · ▬ Rebe · □ Muldenrand</p>` : '<p class="muted">Hier wird nicht gepflanzt.</p>'}
      ${c.open ? `<div class="open">${c.open}</div>` : ''}`;
    $$('#zone-detail .pp-chip').forEach((b) => b.addEventListener('click', () => togglePlant(+b.dataset.plant)));
    const all = $('#pp-zone-all');
    if (all) all.addEventListener('click', () => { plantSel.clear(); here.forEach((p) => plantSel.add(p.id)); plantActive = null; refreshPlants(); });
    const none = $('#pp-none');
    if (none) none.addEventListener('click', () => { plantSel.clear(); plantActive = null; refreshPlants(); });
    refreshPlants();
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
