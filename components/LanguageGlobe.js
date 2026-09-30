"use client";
// A little spinning globe for the Passport Quest results screen: it turns to the player's destination
// country and fills it in. The fill grows with the number of phrases unlocked (out of 30).
// The map libraries load in the browser from a CDN; if that fails, a simple flag card shows instead.
import { useEffect, useRef, useState } from "react";

const D3 = "https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js";
const TOPO = "https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js";
const ATLAS = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// Names that differ between the browser's country names and the map's
const ALIASES = {
  "united states": "united states of america",
  "bosnia & herzegovina": "bosnia and herz.",
  "bosnia and herzegovina": "bosnia and herz.",
  "dominican republic": "dominican rep.",
  "myanmar (burma)": "myanmar",
  "türkiye": "turkey",
  "south sudan": "s. sudan",
  "central african republic": "central african rep.",
  "congo - kinshasa": "dem. rep. congo",
  "congo - brazzaville": "congo",
  "czech republic": "czechia",
  "swaziland": "eswatini",
  "uk": "united kingdom",
  "england": "united kingdom",
  "scotland": "united kingdom",
  "usa": "united states of america",
  "uae": "united arab emirates",
  "holland": "netherlands",
  "macedonia": "north macedonia",
};
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z]/g, "");

function loadScript(src) {
  window.__pgScripts = window.__pgScripts || {};
  if (!window.__pgScripts[src]) {
    window.__pgScripts[src] = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => { delete window.__pgScripts[src]; reject(new Error(`Could not load ${src}`)); };
      document.head.appendChild(s);
    });
  }
  return window.__pgScripts[src];
}

const flagOf = (cc) =>
  /^[A-Z]{2}$/.test(cc || "") ? String.fromCodePoint(...[...cc].map((c) => 127397 + c.charCodeAt(0))) : "🌍";

// Work out which country the trip is to: the end of "City, Country" if it is one, else the language code's region
function countryGuess(destination, langCode) {
  const region = String(langCode || "").split("-")[1]?.toUpperCase() || "";
  let regionName = "";
  try { regionName = region ? new Intl.DisplayNames(["en"], { type: "region" }).of(region) : ""; } catch { /* ignore */ }
  const parts = String(destination || "").split(",").map((x) => x.trim()).filter(Boolean);
  const fromDest = parts.length > 1 ? parts[parts.length - 1] : "";
  return { region, regionName, fromDest };
}

function findFeature(features, names) {
  for (const n of names.filter(Boolean)) {
    const key = ALIASES[n.toLowerCase()] || n;
    const hit = features.find((f) => norm(f.properties.name) === norm(key));
    if (hit) return hit;
  }
  return null;
}

export default function LanguageGlobe({ destination, langCode, language, place, count }) {
  const [status, setStatus] = useState("loading"); // loading | spinning | arrived | failed
  const [label, setLabel] = useState({ country: "", flag: "🌍" });
  const [ring, setRing] = useState(null);
  const gratRef = useRef(null);
  const landRef = useRef(null);
  const countryRef = useRef(null);

  const guess = countryGuess(destination, langCode);
  const fillOpacity = Math.min(1, 0.45 + 0.55 * (Math.min(count, 30) / 30));

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    setLabel({ country: guess.fromDest || guess.regionName, flag: flagOf(guess.region) });

    (async () => {
      try {
        await Promise.all([loadScript(D3), loadScript(TOPO)]);
        const topo = await (await fetch(ATLAS)).json();
        if (cancelled) return;
        const { d3, topojson } = window;
        const features = topojson.feature(topo, topo.objects.countries).features;
        const feat = findFeature(features, [guess.fromDest, guess.regionName]);
        if (!feat) { setStatus("failed"); return; }
        setLabel((l) => ({ ...l, country: feat.properties.name === "United States of America" ? "United States" : (guess.fromDest || guess.regionName || feat.properties.name) }));

        const projection = d3.geoOrthographic().scale(130).translate([150, 150]).clipAngle(90);
        const path = d3.geoPath(projection);
        const graticule = d3.geoGraticule10();
        const all = { type: "FeatureCollection", features };
        const [lon, lat] = d3.geoCentroid(feat);
        const target = [-lon, -lat];

        const draw = (rot) => {
          projection.rotate(rot);
          gratRef.current?.setAttribute("d", path(graticule) || "");
          landRef.current?.setAttribute("d", path(all) || "");
          countryRef.current?.setAttribute("d", path(feat) || "");
        };
        const markSpot = () => {
          const xy = projection([lon, lat]);
          if (xy) setRing({ x: xy[0], y: xy[1] });
        };

        const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        if (reduce) {
          draw(target);
          markSpot();
          setStatus("arrived");
          return;
        }

        const from = [target[0] + 150, -10];
        const ms = 2600;
        const began = performance.now();
        setStatus("spinning");
        const tick = (now) => {
          if (cancelled) return;
          const t = Math.min(1, (now - began) / ms);
          const e = 1 - Math.pow(1 - t, 3); // ease out
          draw([from[0] + (target[0] - from[0]) * e, from[1] + (target[1] - from[1]) * e]);
          if (t < 1) raf = requestAnimationFrame(tick);
          else { markSpot(); setStatus("arrived"); }
        };
        raf = requestAnimationFrame(tick);
      } catch {
        if (!cancelled) setStatus("failed");
      }
    })();

    return () => { cancelled = true; cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination, langCode]);

  const countryName = label.country || place;
  const arrived = status === "arrived";

  if (status === "failed") {
    return (
      <div className="pg-globe-card">
        <p className="pg-label">Language unlocked</p>
        <p className="pg-globe-flag" aria-hidden="true">{label.flag}</p>
        <p className="pg-globe-caption"><b>{language}</b> · {countryName}</p>
        <p className="pg-fine">{count} of 30 phrases unlocked</p>
      </div>
    );
  }

  return (
    <div className="pg-globe-card">
      <p className="pg-label">Language unlocked</p>
      <svg viewBox="0 0 300 300" className="pg-globe" role="img" aria-label={`Globe with ${countryName} highlighted`}>
        <defs>
          <radialGradient id="pgOcean" cx="35%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#2f6f73" />
            <stop offset="100%" stopColor="#0f2e2e" />
          </radialGradient>
        </defs>
        <circle cx="150" cy="150" r="130" fill="url(#pgOcean)" />
        <path ref={gratRef} className="pg-grat" />
        <path ref={landRef} className="pg-land" />
        <path ref={countryRef} className="pg-country" style={{ opacity: arrived ? fillOpacity : 0 }} />
        {arrived && ring && <circle className="pg-ring" cx={ring.x} cy={ring.y} r="6" />}
        <circle cx="150" cy="150" r="130" fill="none" stroke="#0f2e2e" strokeWidth="2" />
      </svg>
      <p className="pg-globe-caption">
        <span aria-hidden="true">{label.flag}</span> <b>{language}</b> · {countryName}
      </p>
      <div className="pg-bar" aria-label={`${count} of 30 phrases unlocked`}>
        <span style={{ width: `${Math.min(100, (count / 30) * 100)}%` }} />
      </div>
      <p className="pg-fine">
        {arrived ? `${countryName} is filling in: ${count} of 30 phrases unlocked.` : "Flying there…"}
      </p>
    </div>
  );
}
