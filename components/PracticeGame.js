"use client";
// Passport Quest: a silent, arcade-style phrase game (no audio at all).
//   3 hearts, a countdown on every question, combo streaks and points.
//   Rounds: Warm-up (tap) -> Match-up -> Build it (assemble the phrase) -> Boss round (rapid fire, double points).
//   Today's newest phrase is featured; older ones come back for review.
//   Results are saved through /api/practice/complete ({score: questions right, total: questions}).
import { useEffect, useRef, useState } from "react";
import { streakFrom } from "@/lib/streak";

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const localToday = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in the player's timezone

// Rank grows as more phrases are unlocked (one new phrase per daily email)
const RANKS = [
  [0, "Tourist", "🎒"],
  [5, "Wanderer", "🧭"],
  [10, "Explorer", "🗺️"],
  [15, "Globetrotter", "✈️"],
  [20, "Insider", "🏛️"],
  [30, "Honorary Local", "👑"],
];
const rankFor = (n) => [...RANKS].reverse().find((r) => n >= r[0]);
const nextRank = (n) => RANKS.find((r) => r[0] > n);

const GOOD = ["Nice!", "Boom!", "Perfect!", "You're a natural!", "Smooth!", "Locals would be proud!"];
const BAD = ["Close one!", "Oops!", "Not this time!", "Shake it off!"];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function options(correct, pool, key) {
  const others = shuffle(pool.filter((p) => p.idx !== correct.idx && p[key] !== correct[key]));
  const seen = new Set([correct[key]]);
  const picks = [];
  for (const p of others) {
    if (picks.length >= 3) break;
    if (seen.has(p[key])) continue;
    seen.add(p[key]);
    picks.push(p);
  }
  return shuffle([correct, ...picks]);
}

// How a phrase can be assembled from tiles: whole words (2-7 words) or letters (3-12 characters)
function buildPlan(p, pool) {
  const words = p.phrase.replace(/\s*\/\s*/g, " / ").trim().split(/\s+/);
  if (words.length >= 2 && words.length <= 7) {
    const have = new Set(words.map((w) => w.toLowerCase()));
    const extra = [
      ...new Set(
        shuffle(pool.filter((o) => o.idx !== p.idx).flatMap((o) => o.phrase.trim().split(/\s+/)))
          .filter((w) => !have.has(w.toLowerCase()))
      ),
    ].slice(0, 2);
    return { mode: "words", parts: words, extra };
  }
  const chars = [...p.phrase.replace(/\s+/g, "")];
  if (chars.length >= 3 && chars.length <= 12) return { mode: "letters", parts: chars, extra: [] };
  return null;
}

// "obrigado / obrigada" style answers: the alternatives can be given in either order
const sameAnswer = (built, target) => {
  const norm = (t) => t.toLowerCase().split("/").map((x) => x.trim()).filter(Boolean).sort().join("|");
  return built.toLowerCase() === target.toLowerCase() || norm(built) === norm(target);
};

function buildRound(phrases) {
  const newest = phrases[phrases.length - 1];
  const older = phrases.slice(0, -1);
  const qs = [];
  qs.push({ type: "meaning", target: newest, opts: options(newest, phrases, "meaning"), limit: 15000, label: "Warm-up" });
  qs.push({ type: "phrase", target: newest, opts: options(newest, phrases, "phrase"), limit: 15000, label: "Warm-up" });
  if (phrases.length >= 3) qs.push({ type: "match", pairs: shuffle(phrases).slice(0, 4), label: "Match-up" });

  let built = 0;
  for (const p of [newest, ...shuffle(older)]) {
    if (built >= 2) break;
    const plan = buildPlan(p, phrases);
    if (!plan) continue;
    qs.push({ type: "build", target: p, plan, limit: 30000, label: "Build it" });
    built++;
  }

  const pool = shuffle(phrases);
  const bossTypes = ["phrase", "meaning", "phrase"];
  const bossCount = Math.min(3, Math.max(2, phrases.length));
  for (let k = 0; k < bossCount; k++) {
    const p = pool[k % pool.length];
    const type = bossTypes[k % bossTypes.length];
    qs.push({ type, target: p, opts: options(p, phrases, type), limit: 7000, label: "Boss round", boss: true });
  }
  return qs;
}

function PhraseText({ p, big }) {
  return (
    <div className={big ? "pg-phrase pg-phrase-big" : "pg-phrase"}>
      {p.native ? <span className="pg-native" lang={p.lang_code || undefined}>{p.native}</span> : null}
      <span className="pg-roman">{p.phrase}</span>
      <span className="pg-say">say it: {p.pronunciation}</span>
    </div>
  );
}

const phraseLabel = (p) => (p.native ? `${p.native} (${p.phrase})` : p.phrase);

function Choice({ q, result, onPick }) {
  const [chosen, setChosen] = useState(null);
  return (
    <div>
      {q.type === "meaning" ? (
        <>
          <p className="pg-prompt">What does this mean?</p>
          <PhraseText p={q.target} big />
        </>
      ) : (
        <>
          <p className="pg-prompt">How do you say&hellip;</p>
          <p className="pg-meaning pg-meaning-big">&ldquo;{q.target.meaning}&rdquo;</p>
        </>
      )}
      <div className="pg-options">
        {q.opts.map((o) => {
          const isCorrect = o.idx === q.target.idx;
          const state = result ? (isCorrect ? "is-right" : chosen === o.idx ? "is-wrong" : "") : "";
          return (
            <button
              key={o.idx}
              type="button"
              className={`pg-option ${state}`}
              disabled={Boolean(result)}
              onClick={() => { setChosen(o.idx); onPick(isCorrect); }}
            >
              {q.type === "phrase" ? phraseLabel(o) : o.meaning}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Build({ q, result, onCheck }) {
  const sep = q.plan.mode === "words" ? " " : "";
  const [tiles] = useState(() => {
    const all = [...q.plan.parts, ...q.plan.extra].map((text, id) => ({ id, text }));
    let s = shuffle(all);
    if (!q.plan.extra.length && s.map((t) => t.text).join(sep) === q.plan.parts.join(sep)) s = shuffle(all);
    return s;
  });
  const [placed, setPlaced] = useState([]);
  const byId = (id) => tiles.find((t) => t.id === id);
  const built = placed.map((id) => byId(id).text).join(sep);
  const right = sameAnswer(built, q.plan.parts.join(sep));
  const locked = Boolean(result);

  return (
    <div>
      <p className="pg-prompt">Build it: how do you say&hellip;</p>
      <p className="pg-meaning pg-meaning-big">&ldquo;{q.target.meaning}&rdquo;</p>
      {q.target.native ? <p className="pg-fine" lang={q.target.lang_code || undefined}>Hint: {q.target.native}</p> : null}
      <div className={`pg-tray ${locked ? (result.correct ? "is-right" : "is-wrong") : ""}`} aria-label="Your answer">
        {placed.length === 0 && <span className="pg-tray-empty">Tap the pieces below</span>}
        {placed.map((id) => (
          <button
            key={id}
            type="button"
            className="pg-chip"
            disabled={locked}
            onClick={() => setPlaced((pl) => pl.filter((x) => x !== id))}
          >
            {byId(id).text}
          </button>
        ))}
      </div>
      <div className="pg-bank">
        {tiles.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`pg-chip ${placed.includes(t.id) ? "is-used" : ""}`}
            disabled={locked || placed.includes(t.id)}
            onClick={() => setPlaced((pl) => [...pl, t.id])}
          >
            {t.text}
          </button>
        ))}
      </div>
      {!locked && (
        <div className="pg-build-actions">
          <button type="button" className="pg-secondary" disabled={!placed.length} onClick={() => setPlaced([])}>Clear</button>
          <button type="button" className="pg-go" disabled={!placed.length} onClick={() => onCheck(right)}>Check</button>
        </div>
      )}
    </div>
  );
}

function MatchQuestion({ pairs, onDone }) {
  const [left] = useState(() => shuffle(pairs));
  const [right] = useState(() => shuffle(pairs));
  const [picked, setPicked] = useState(null);
  const [done, setDone] = useState([]);
  const [wrong, setWrong] = useState(null);
  const [mistakes, setMistakes] = useState(0);

  function chooseRight(p) {
    if (!picked || done.includes(p.idx)) return;
    if (p.idx === picked.idx) {
      const next = [...done, p.idx];
      setDone(next);
      setPicked(null);
      if (next.length === pairs.length) setTimeout(() => onDone(mistakes <= 1), 350);
    } else {
      setWrong(p.idx);
      setMistakes((m) => m + 1);
      setTimeout(() => setWrong(null), 450);
    }
  }

  return (
    <div>
      <p className="pg-prompt">Match each phrase to its meaning</p>
      <p className="pg-fine">More than one slip costs a heart.{mistakes ? ` Slips: ${mistakes}` : ""}</p>
      <div className="pg-match">
        <div className="pg-col">
          {left.map((p) => (
            <button
              key={`l${p.idx}`}
              type="button"
              className={`pg-tile ${done.includes(p.idx) ? "is-done" : ""} ${picked?.idx === p.idx ? "is-picked" : ""}`}
              disabled={done.includes(p.idx)}
              onClick={() => setPicked(p)}
            >
              {p.native || p.phrase}
            </button>
          ))}
        </div>
        <div className="pg-col">
          {right.map((p) => (
            <button
              key={`r${p.idx}`}
              type="button"
              className={`pg-tile ${done.includes(p.idx) ? "is-done" : ""} ${wrong === p.idx ? "is-wrong" : ""}`}
              disabled={done.includes(p.idx)}
              onClick={() => chooseRight(p)}
            >
              {p.meaning}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function PracticeGame({ token, place, firstName, phrases, playedDays }) {
  const language = phrases[0]?.language || "local";
  const newest = phrases[phrases.length - 1];
  const rank = rankFor(phrases.length);
  const upNext = nextRank(phrases.length);

  const [stage, setStage] = useState("intro");
  const [qs, setQs] = useState([]);
  const [i, setI] = useState(0);
  const [lives, setLives] = useState(3);
  const [points, setPoints] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [rightCount, setRightCount] = useState(0);
  const [result, setResult] = useState(null); // { correct, gain, timedOut }
  const [timeLeft, setTimeLeft] = useState(1); // fraction 0..1
  const [streak, setStreak] = useState(() => streakFrom(playedDays, localToday()));
  const [copied, setCopied] = useState(false);
  const timeRef = useRef(1);
  const resolvedRef = useRef(false);

  const q = qs[i];

  function start() {
    setQs(buildRound(phrases));
    setI(0);
    setLives(3);
    setPoints(0);
    setCombo(0);
    setBestCombo(0);
    setRightCount(0);
    setResult(null);
    resolvedRef.current = false;
    timeRef.current = 1;
    setTimeLeft(1);
    setStage("play");
  }

  // Score one question. Speed and combos add bonus points; boss questions count double.
  function resolve(correct, { timedOut = false } = {}) {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    const flat = q.type === "match";
    const base = q.type === "match" || q.type === "build" ? 150 : 100;
    const speed = flat ? 0 : Math.round(timeRef.current * 50);
    const comboBonus = Math.min(combo, 5) * 10;
    const gain = correct ? (base + speed + comboBonus) * (q.boss ? 2 : 1) : 0;
    setPoints((p) => p + gain);
    if (correct) {
      setRightCount((n) => n + 1);
      setCombo(combo + 1);
      setBestCombo((b) => Math.max(b, combo + 1));
    } else {
      setCombo(0);
      setLives((l) => l - 1);
    }
    setResult({ correct, gain, timedOut, msg: timedOut ? "Time's up!" : correct ? pick(GOOD) : pick(BAD) });
  }

  // Countdown for timed questions
  useEffect(() => {
    if (stage !== "play" || !q || !q.limit || result) return;
    const began = Date.now();
    timeRef.current = 1;
    setTimeLeft(1);
    const id = setInterval(() => {
      const f = 1 - (Date.now() - began) / q.limit;
      if (f <= 0) {
        clearInterval(id);
        timeRef.current = 0;
        setTimeLeft(0);
        resolve(false, { timedOut: true });
      } else {
        timeRef.current = f;
        setTimeLeft(f);
      }
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, i, result === null]);

  async function finish() {
    setStage("done");
    try {
      const res = await fetch("/api/practice/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, score: rightCount, total: qs.length, localDate: localToday() }),
      });
      const data = await res.json();
      if (typeof data.streak === "number") setStreak(data.streak);
    } catch {
      // Offline or blocked: the round still counts on screen
    }
  }

  function next() {
    if (lives <= 0 || i + 1 >= qs.length) {
      finish();
      return;
    }
    resolvedRef.current = false;
    setResult(null);
    setI(i + 1);
  }

  async function share() {
    const text = `I scored ${points} points in Passport Quest and learned ${phrases.length} ${language} phrases before my trip to ${place}! Get free daily tips for your trip:`;
    const url = "https://www.destinationsdaily.com";
    if (navigator.share) {
      try { await navigator.share({ text, url }); return; } catch { /* closed */ }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* ignore */ }
  }

  if (stage === "intro") {
    return (
      <div className="pg">
        <p className="pg-kicker">Passport Quest · {place}</p>
        <h1 className="pg-title">{firstName ? `Ready, ${firstName}?` : "Ready?"}</h1>
        <p className="pg-sub">
          Beat the clock in {language}. You&apos;ve unlocked <b>{phrases.length}</b> phrase{phrases.length === 1 ? "" : "s"} so far.
        </p>
        <div className="pg-rank">
          <span className="pg-rank-icon" aria-hidden="true">{rank[2]}</span>
          <span>
            <b>Rank: {rank[1]}</b>
            <span className="pg-fine">
              {upNext ? `${upNext[0] - phrases.length} more phrase${upNext[0] - phrases.length === 1 ? "" : "s"} to ${upNext[1]}` : "Top rank reached!"}
            </span>
          </span>
        </div>
        {streak > 0 && <p className="pg-streak">🔥 {streak}-day streak. Keep it going!</p>}
        <ul className="pg-rules">
          <li>❤️ 3 hearts. Wrong answers and timeouts cost one.</li>
          <li>⏱️ Answer fast for bonus points.</li>
          <li>🔥 Chain right answers for a combo bonus.</li>
          <li>👹 Survive the boss round for double points.</li>
        </ul>
        <div className="pg-card">
          <p className="pg-label">Today&apos;s new phrase. Study it first!</p>
          <PhraseText p={newest} big />
          <p className="pg-meaning">&ldquo;{newest.meaning}&rdquo;</p>
        </div>
        <button type="button" className="pg-go" onClick={start}>Start quest</button>
      </div>
    );
  }

  if (stage === "done") {
    const pct = qs.length ? rightCount / qs.length : 0;
    const stars = pct >= 0.85 ? 3 : pct >= 0.6 ? 2 : 1;
    const out = lives <= 0;
    const stampDate = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    return (
      <div className="pg">
        <p className="pg-kicker">Passport Quest · {place}</p>
        <h1 className="pg-title">{out ? "Out of hearts! 💔" : pct >= 0.85 ? "Quest complete! 🎉" : "Quest complete! 👏"}</h1>
        <div className="pg-stars" aria-label={`${stars} of 3 stars`}>
          {[1, 2, 3].map((n) => <span key={n} className={n <= stars ? "on" : ""}>★</span>)}
        </div>
        <p className="pg-sub">
          <b>{points} points</b> · {rightCount} of {qs.length} right{bestCombo > 1 ? ` · best combo x${bestCombo}` : ""}
        </p>
        {out && <p className="pg-fine">Every trip has a few bumps. Give it another go!</p>}
        <div className="pg-stamp" aria-label="Passport stamp">
          <span className="pg-stamp-top">{language.toUpperCase()}</span>
          <span className="pg-stamp-mid">{place.toUpperCase()}</span>
          <span className="pg-stamp-bot">{stampDate}</span>
        </div>
        <p className="pg-streak">🔥 {Math.max(streak, 1)}-day streak</p>
        <div className="pg-bar" aria-label={`${phrases.length} of 30 travel phrases unlocked`}>
          <span style={{ width: `${Math.min(100, (phrases.length / 30) * 100)}%` }} />
        </div>
        <p className="pg-fine">
          {rank[2]} {rank[1]} · {phrases.length} of 30 travel phrases unlocked. A new one arrives with each daily email.
        </p>
        <div className="pg-actions">
          <button type="button" className="pg-go" onClick={start}>Play again</button>
          <button type="button" className="pg-secondary" onClick={share}>{copied ? "Copied!" : "Share my score"}</button>
        </div>
        <h2 className="pg-h2">Your phrases</h2>
        <ul className="pg-list">
          {[...phrases].reverse().map((p) => (
            <li key={p.idx}>
              <PhraseText p={p} />
              <span className="pg-list-meaning">{p.meaning}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Playing
  return (
    <div className="pg">
      <div className="pg-hud">
        <span className="pg-hearts" aria-label={`${Math.max(lives, 0)} hearts left`}>
          {[0, 1, 2].map((n) => <span key={n} className={n < lives ? "" : "lost"}>{n < lives ? "❤️" : "🖤"}</span>)}
        </span>
        <span className="pg-points">{points} pts</span>
        {combo > 1 && <span className="pg-combo">🔥 x{combo}</span>}
      </div>
      <div className="pg-progress" aria-label={`Question ${i + 1} of ${qs.length}`}>
        <span style={{ width: `${(i / qs.length) * 100}%` }} />
      </div>
      <p className={`pg-stage ${q.boss ? "is-boss" : ""}`}>
        {q.boss ? "👹 " : ""}{q.label} · {i + 1}/{qs.length}{q.boss ? " · double points!" : ""}
      </p>
      {q.limit ? (
        <div className="pg-timer" aria-hidden="true">
          <span className={timeLeft < 0.3 ? "low" : ""} style={{ width: `${timeLeft * 100}%` }} />
        </div>
      ) : null}

      <div key={i} className={result && !result.correct ? "pg-shake" : ""}>
        {q.type === "match" && <MatchQuestion pairs={q.pairs} onDone={(ok) => resolve(ok)} />}
        {q.type === "build" && <Build q={q} result={result} onCheck={(ok) => resolve(ok)} />}
        {(q.type === "meaning" || q.type === "phrase") && <Choice q={q} result={result} onPick={(ok) => resolve(ok)} />}
      </div>

      {result && (
        <div className={`pg-feedback ${result.correct ? "ok" : "no"}`} role="status">
          <p className="pg-feedback-head">
            {result.msg}
            {result.correct && <span className="pg-gain"> +{result.gain}</span>}
          </p>
          {q.type === "match" ? (
            <p>{result.correct ? "Every phrase paired up." : "A few slips there. They'll come back around in the next round."}</p>
          ) : (
            <p>
              <b>{phraseLabel(q.target)}</b> means &ldquo;{q.target.meaning}&rdquo;. Say it: {q.target.pronunciation}
            </p>
          )}
          <button type="button" className="pg-go" onClick={next}>
            {lives <= 0 ? "See results" : i + 1 >= qs.length ? "Finish quest" : "Continue"}
          </button>
        </div>
      )}
    </div>
  );
}
