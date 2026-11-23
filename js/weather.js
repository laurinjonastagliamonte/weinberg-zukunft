/*
 * Wetter am Korber Kopf
 * ---------------------
 * Jahreszeiten: Mittel 1995–2024 aus dem Open-Meteo-Archiv (ERA5-Reanalyse) für den Gipfel
 *   (48,8538 N / 9,3672 E, Rasterzelle ca. 470 m). Abgerufen am 24.11.2026.
 * 2050: Änderung 2041–2050 gegenüber 1995–2014, Mittel aus zwei Klimamodellen
 *   (EC_Earth3P_HR, MPI_ESM1_2_XR) über die Open-Meteo Climate API.
 * 2075 / 2125: Trend aus 2050 fortgeschrieben – ANNAHME, keine Modelldaten.
 * Jetzt: live aus der Open-Meteo Forecast API (CC BY 4.0, open-meteo.com).
 */
(function () {
  const WB = (window.WB = window.WB || {});

  const LAT = 48.8538, LON = 9.3672;
  const SOURCE = 'Open-Meteo (ERA5 1995–2024, CC BY 4.0)';

  // je Jahreszeit (Summen = Mittel pro Jahreszeit und Jahr)
  const SEASONS = {
    fruehling: { key: 'fruehling', name: 'Frühling', months: 'März–Mai', t: 8.4, tmin: 3.4, tmax: 13.2, regen: 216, frostTage: 23, hitzeTage: 0, sonne: 852, verdunstung: 223, wind: 14.9, windDir: 251 },
    sommer: { key: 'sommer', name: 'Sommer', months: 'Juni–August', t: 17.5, tmin: 12.4, tmax: 22.1, regen: 234, frostTage: 0, hitzeTage: 4.2, sonne: 1048, verdunstung: 337, wind: 13.1, windDir: 259 },
    herbst: { key: 'herbst', name: 'Herbst', months: 'Sept.–Nov.', t: 9.2, tmin: 5.4, tmax: 13.2, regen: 203, frostTage: 13, hitzeTage: 0, sonne: 605, verdunstung: 128, wind: 13.7, windDir: 191 },
    winter: { key: 'winter', name: 'Winter', months: 'Dez.–Feb.', t: 0.7, tmin: -2.5, tmax: 4.0, regen: 204, frostTage: 63, hitzeTage: 0, sonne: 420, verdunstung: 56, wind: 16.0, windDir: 203 },
  };
  // Was die Jahreszeit für den Weinberg bedeutet (Problemzonen, die hervorgehoben werden)
  const SEASON_FOCUS = {
    fruehling: { problems: ['frost', 'wind'], text: 'Spätfrost in Senken trifft den Austrieb. Westwind am Rücken.' },
    sommer: { problems: ['trocken'], text: 'Verdunstung höher als der Regen: Süd- und Westhänge trocknen aus.' },
    herbst: { problems: ['feucht', 'frost'], text: 'Weniger Verdunstung, Wasser bleibt stehen. Erste Fröste in Senken.' },
    winter: { problems: ['frost', 'wind'], text: 'Viele Frosttage, Kaltluft sammelt sich in Senken. Stärkster Wind.' },
  };
  // Klimamodelle bis 2050 (Änderung gegenüber 1995–2014), danach fortgeschrieben
  const D2050 = {
    fruehling: { dT: 0.67, regen: 0.96, dHitze: -0.1, dFrost: -6.1 },
    sommer: { dT: 1.16, regen: 0.83, dHitze: 5.0, dFrost: 0 },
    herbst: { dT: 1.31, regen: 0.89, dHitze: 1.7, dFrost: -6.0 },
    winter: { dT: 1.69, regen: 0.89, dHitze: 0, dFrost: -14.1 },
  };
  const PERIODS = {
    heute: { name: 'heute', k: 0, note: 'Mittel 1995–2024' },
    2050: { name: '2050', k: 1, note: 'Klimamodelle (2 Modelle gemittelt)' },
    2075: { name: '2075', k: 1.8, note: 'Trend fortgeschrieben (Annahme)' },
    2125: { name: '2125', k: 3.4, note: 'Trend fortgeschrieben (Annahme)' },
  };

  function seasonFor(key, period = 'heute') {
    const s = SEASONS[key];
    const d = D2050[key];
    const k = PERIODS[period].k;
    return {
      ...s,
      t: s.t + d.dT * k,
      tmin: s.tmin + d.dT * k,
      tmax: s.tmax + d.dT * k,
      regen: s.regen * Math.pow(d.regen, k),
      frostTage: Math.max(0, s.frostTage + d.dFrost * k),
      hitzeTage: Math.max(0, s.hitzeTage + d.dHitze * k),
      period,
    };
  }

  const WMO = {
    0: 'klar', 1: 'überwiegend klar', 2: 'teils bewölkt', 3: 'bedeckt', 45: 'Nebel', 48: 'Reifnebel',
    51: 'Nieselregen', 53: 'Nieselregen', 55: 'starker Niesel', 56: 'gefrierender Niesel', 57: 'gefrierender Niesel',
    61: 'leichter Regen', 63: 'Regen', 65: 'starker Regen', 66: 'gefrierender Regen', 67: 'gefrierender Regen',
    71: 'leichter Schnee', 73: 'Schnee', 75: 'starker Schnee', 77: 'Schneegriesel',
    80: 'Schauer', 81: 'Schauer', 82: 'heftige Schauer', 85: 'Schneeschauer', 86: 'Schneeschauer',
    95: 'Gewitter', 96: 'Gewitter mit Hagel', 99: 'Gewitter mit Hagel',
  };

  // Live-Wetter (braucht Internet; bei Fehler kommt null zurück)
  async function fetchNow() {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
      '&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,soil_moisture_0_to_1cm,soil_temperature_0cm' +
      '&daily=precipitation_sum,temperature_2m_min,temperature_2m_max&past_days=7&forecast_days=1&timezone=Europe%2FBerlin';
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      const d = await r.json();
      const c = d.current;
      const regen7 = (d.daily?.precipitation_sum || []).reduce((a, b) => a + (b || 0), 0);
      return {
        time: c.time,
        t: c.temperature_2m,
        feuchte: c.relative_humidity_2m,
        regen: c.precipitation,
        regen7,
        code: c.weather_code,
        text: WMO[c.weather_code] || '–',
        wind: c.wind_speed_10m,
        windDir: c.wind_direction_10m,
        boeen: c.wind_gusts_10m,
        boden: c.soil_moisture_0_to_1cm,
        bodenT: c.soil_temperature_0cm,
      };
    } catch (e) {
      return null;
    }
  }

  const DIRS = ['Nord', 'Nordost', 'Ost', 'Südost', 'Süd', 'Südwest', 'West', 'Nordwest'];
  const dirName = (deg) => DIRS[Math.round(deg / 45) % 8];

  WB.weather = { LAT, LON, SOURCE, SEASONS, SEASON_FOCUS, PERIODS, seasonFor, fetchNow, dirName };
})();
