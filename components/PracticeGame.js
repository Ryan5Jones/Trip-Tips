"use client";
// Phrase Practice game: ~2 minutes, Duolingo-style. Question types:
//   meaning: see the phrase, pick what it means
//   phrase:  see the meaning, pick the phrase
//   listen:  hear the phrase (device voice), pick what it means
//   match:   tap phrase/meaning pairs
// Today's newest phrase is featured; older ones come back for review.
import { useEffect, useMemo, useState } from "react";
import { streakFrom } from "@/lib/streak";

const LANG_CODES = {
  french: "fr-FR", japanese: "ja-JP", portuguese: "pt-PT", spanish: "es-ES", italian: "it-IT",
  german: "de-DE", greek: "el-GR", mandarin: "zh-CN", chinese: "zh-CN", cantonese: "zh-HK",
  korean: "ko-KR", thai: "th-TH", vietnamese: "vi-VN", turkish: "tr-TR", dutch: "nl-NL",
  arabic: "ar-SA", czech: "cs-CZ", hungarian: "hu-HU", danish: "da-DK", icelandic: "is-IS",
  indonesian: "id-ID", hebrew: "he-IL", russian: "ru-RU", polish: "pl-PL", swedish: "sv-SE",
  norwegian: "nb-NO", finnish: "fi-FI", hindi: "hi-IN", swahili: "sw-KE", croatian: "hr-HR",
  "mandarin chinese": "zh-CN", "brazilian portuguese": "pt-BR", "european portuguese": "pt-PT",
};

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const localToday = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in the player's timezone
const langCode = (p) => p.lang_code || LANG_CODES[String(p.language || "").toLowerCase()] || "";

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

function buildRound(phrases, canListen) {
  const newest = phrases[phrases.length - 1];
  const older = phrases.slice(0, -1);
  const qs = [];
  qs.push({ type: "meaning", target: newest, opts: options(newest, phrases, "meaning") });
  qs.push(canListen
    ? { type: "listen", target: newest, opts: options(newest, phrases, "meaning") }
    : { type: "phrase", target: newest, opts: options(newest, phrases, "phrase") });
  const review = shuffle(older).slice(0, 4);
  review.forEach((p, i) => {
    const types = ["phrase", canListen ? "listen" : "meaning", "meaning"];
    const type = types[i % types.length];
    qs.push({ type, target: p, opts: options(p, phrases, type === "phrase" ? "phrase" : "meaning") });
  });
  if (phrases.length >= 3) {
    const pairs = shuffle(phrases).slice(0, 4);
    qs.splice(Math.min(3, qs.length), 0, { type: "match", pairs });
  }
  return qs;
}

function PhraseText({ p, big }) {
  return (
    <div className={big ? "pg-phrase pg-phrase-big" : "pg-phrase"}>
      {p.native ? <span className="pg-native" lang={langCode(p) || undefined}>{p.native}</span> : null}
      <span className="pg-roman">{p.phrase}</span>
      <span className="pg-say">say it: {p.pronunciation}</span>
    </div>
  );
}

function MatchQuestion({ pairs, onDone, speak }) {
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
      <div className="pg-match">
        <div className="pg-col">
          {left.map((p) => (
            <button
              key={`l${p.idx}`}
              type="button"
              className={`pg-tile ${done.includes(p.idx) ? "is-done" : ""} ${picked?.idx === p.idx ? "is-picked" : ""}`}
              disabled={done.includes(p.idx)}
              onClick={() => { setPicked(p); speak(p); }}
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
  const [voices, setVoices] = useState([]);
  const [stage, setStage] = useState("intro");
  const [qs, setQs] = useState([]);
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [answer, setAnswer] = useState(null); // { correct: bool, chosen }
  const [streak, setStreak] = useState(() => streakFrom(playedDays, localToday()));
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  const code = langCode(newest);
  const voice = useMemo(() => {
    if (!code) return null;
    const exact = voices.find((v) => v.lang.toLowerCase() === code.toLowerCase());
    return exact || voices.find((v) => v.lang.toLowerCase().startsWith(code.slice(0, 2).toLowerCase())) || null;
  }, [voices, code]);
  const canListen = Boolean(voice);

  function speak(p) {
    if (!voice || typeof window === "undefined") return;
    const u = new SpeechSynthesisUtterance(p.native || p.phrase);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = 0.85;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  function start() {
    setQs(buildRound(phrases, canListen));
    setI(0);
    setScore(0);
    setAnswer(null);
    setStage("play");
  }

  async function finish(finalScore) {
    setStage("done");
    try {
      const res = await fetch("/api/practice/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, score: finalScore, total: qs.length, localDate: localToday() }),
      });
      const data = await res.json();
      if (typeof data.streak === "number") setStreak(data.streak);
    } catch {
      // Offline or blocked: the round still counts on screen
    }
  }

  function next(correct) {
    const newScore = score + (correct ? 1 : 0);
    setScore(newScore);
    setAnswer(null);
    if (i + 1 >= qs.length) finish(newScore);
    else setI(i + 1);
  }

  const q = qs[i];

  useEffect(() => {
    if (stage === "play" && q?.type === "listen") speak(q.target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, i]);

  async function share() {
    const text = `I've learned ${phrases.length} ${language} phrases before my trip to ${place}! Get free daily tips for your trip:`;
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
        <p className="pg-kicker">Phrase Practice · {place}</p>
        <h1 className="pg-title">{firstName ? `Ready, ${firstName}?` : "Ready?"}</h1>
        <p className="pg-sub">
          2 minutes of {language}. You&apos;ve unlocked <b>{phrases.length}</b> phrase{phrases.length === 1 ? "" : "s"} so far.
        </p>
        {streak > 0 && <p className="pg-streak">🔥 {streak}-day streak. Keep it going!</p>}
        <div className="pg-card">
          <p className="pg-label">Today&apos;s new phrase</p>
          <PhraseText p={newest} big />
          <p className="pg-meaning">&ldquo;{newest.meaning}&rdquo;</p>
          {canListen && (
            <button type="button" className="pg-listen" onClick={() => speak(newest)}>🔊 Hear it</button>
          )}
        </div>
        <button type="button" className="pg-go" onClick={start}>Start practice</button>
      </div>
    );
  }

  if (stage === "done") {
    const pct = Math.round((score / qs.length) * 100);
    return (
      <div className="pg">
        <p className="pg-kicker">Phrase Practice · {place}</p>
        <h1 className="pg-title">{pct >= 80 ? "Nailed it! 🎉" : pct >= 50 ? "Nice work! 👏" : "Good practice! 💪"}</h1>
        <p className="pg-sub">You got <b>{score} of {qs.length}</b> right.</p>
        <p className="pg-streak">🔥 {Math.max(streak, 1)}-day streak</p>
        <div className="pg-bar" aria-label={`${phrases.length} of 30 travel phrases unlocked`}>
          <span style={{ width: `${Math.min(100, (phrases.length / 30) * 100)}%` }} />
        </div>
        <p className="pg-fine">{phrases.length} of 30 travel phrases unlocked. A new one arrives with each daily email.</p>
        <div className="pg-actions">
          <button type="button" className="pg-go" onClick={start}>Play again</button>
          <button type="button" className="pg-secondary" onClick={share}>{copied ? "Copied!" : "Share my progress"}</button>
        </div>
        <h2 className="pg-h2">Your phrases</h2>
        <ul className="pg-list">
          {[...phrases].reverse().map((p) => (
            <li key={p.idx}>
              <PhraseText p={p} />
              <span className="pg-list-meaning">{p.meaning}</span>
              {canListen && (
                <button type="button" className="pg-mini" onClick={() => speak(p)} aria-label={`Hear ${p.phrase}`}>🔊</button>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Playing
  return (
    <div className="pg">
      <div className="pg-progress" aria-label={`Question ${i + 1} of ${qs.length}`}>
        <span style={{ width: `${(i / qs.length) * 100}%` }} />
      </div>

      {q.type === "match" ? (
        <MatchQuestion key={i} pairs={q.pairs} speak={speak} onDone={(ok) => next(ok)} />
      ) : (
        <div>
          {q.type === "meaning" && (
            <>
              <p className="pg-prompt">What does this mean?</p>
              <PhraseText p={q.target} big />
              {canListen && <button type="button" className="pg-listen" onClick={() => speak(q.target)}>🔊 Hear it</button>}
            </>
          )}
          {q.type === "listen" && (
            <>
              <p className="pg-prompt">Listen. What did you hear?</p>
              <button type="button" className="pg-listen pg-listen-big" onClick={() => speak(q.target)}>🔊 Play again</button>
            </>
          )}
          {q.type === "phrase" && (
            <>
              <p className="pg-prompt">How do you say&hellip;</p>
              <p className="pg-meaning pg-meaning-big">&ldquo;{q.target.meaning}&rdquo;</p>
            </>
          )}

          <div className="pg-options">
            {q.opts.map((o) => {
              const isCorrect = o.idx === q.target.idx;
              const state = answer ? (isCorrect ? "is-right" : answer.chosen === o.idx ? "is-wrong" : "") : "";
              return (
                <button
                  key={o.idx}
                  type="button"
                  className={`pg-option ${state}`}
                  disabled={Boolean(answer)}
                  onClick={() => {
                    setAnswer({ correct: isCorrect, chosen: o.idx });
                    speak(q.target);
                  }}
                >
                  {q.type === "phrase" ? (o.native ? `${o.native} (${o.phrase})` : o.phrase) : o.meaning}
                </button>
              );
            })}
          </div>

          {answer && (
            <div className={`pg-feedback ${answer.correct ? "ok" : "no"}`} role="status">
              <p>
                {answer.correct ? "Correct! " : "Not quite. "}
                <b>{q.target.native ? `${q.target.native} (${q.target.phrase})` : q.target.phrase}</b> means
                &ldquo;{q.target.meaning}&rdquo;. Say it: {q.target.pronunciation}
              </p>
              <button type="button" className="pg-go" onClick={() => next(answer.correct)}>Continue</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
