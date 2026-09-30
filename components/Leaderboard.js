"use client";
// Friends leaderboard card: this week / all time, plus an invite button when you're playing solo.
import { useState } from "react";

const MEDALS = ["🥇", "🥈", "🥉"];

export default function Leaderboard({ board, inviteUrl, place, token, groupCode, onJoined }) {
  const [tab, setTab] = useState("week");
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [entry, setEntry] = useState("");
  const [join, setJoin] = useState({ busy: false, error: "" });

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(groupCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      window.prompt("Your friend code:", groupCode);
    }
  }

  async function joinGroup(e) {
    e.preventDefault();
    setJoin({ busy: true, error: "" });
    try {
      const res = await fetch("/api/practice/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, code: entry }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setJoin({ busy: false, error: data.error || "Something went wrong. Try again." }); return; }
      setEntry("");
      setJoin({ busy: false, error: "" });
      onJoined?.(data);
    } catch {
      setJoin({ busy: false, error: "Couldn't connect. Try again." });
    }
  }

  async function invite() {
    const text = `Let's learn a few phrases before our ${place} trip. Play Passport Quest and compete with me:`;
    if (navigator.share) {
      try { await navigator.share({ title: "Passport Quest", text, url: inviteUrl }); return; } catch { /* closed */ }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${inviteUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copy this link and send it to your travel buddies:", inviteUrl);
    }
  }

  const rows = [...(board || [])].sort(
    (a, b) => b[tab === "week" ? "week" : "total"] - a[tab === "week" ? "week" : "total"] || b.streak - a.streak
  );
  const solo = rows.length <= 1;

  return (
    <div className="pg-board">
      <p className="pg-label">Friends leaderboard</p>
      {solo ? (
        <p className="pg-fine">
          It&apos;s just you so far. Invite the people you&apos;re traveling with: when they sign up from your link,
          you&apos;ll all show up here.
        </p>
      ) : (
        <>
          <div className="pg-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "week"} className={tab === "week" ? "on" : ""} onClick={() => setTab("week")}>This week</button>
            <button type="button" role="tab" aria-selected={tab === "all"} className={tab === "all" ? "on" : ""} onClick={() => setTab("all")}>All time</button>
          </div>
          <ol className="pg-rows">
            {rows.map((r, n) => (
              <li key={`${r.name}-${n}`} className={r.me ? "me" : ""}>
                <span className="pg-pos">{MEDALS[n] || n + 1}</span>
                <span className="pg-who">{r.me ? `${r.name} (you)` : r.name}{r.streak > 0 ? ` 🔥${r.streak}` : ""}</span>
                <span className="pg-pts">{tab === "week" ? r.week : r.total} pts</span>
              </li>
            ))}
          </ol>
        </>
      )}
      <button type="button" className="pg-secondary" onClick={invite}>{copied ? "Link copied!" : "Invite a friend"}</button>
      {groupCode && (
        <div className="pg-code">
          <span className="pg-fine">Your friend code (friends can paste it to join you):</span>
          <span className="pg-code-row">
            <code>{groupCode.toUpperCase()}</code>
            <button type="button" className="pg-mini" onClick={copyCode}>{codeCopied ? "Copied!" : "Copy"}</button>
          </span>
        </div>
      )}
      {solo && token && (
        <form className="pg-join" onSubmit={joinGroup}>
          <label>
            Have a friend&apos;s code?
            <input
              value={entry}
              onChange={(e) => setEntry(e.target.value)}
              placeholder="Paste it here"
              maxLength={20}
              autoCapitalize="characters"
              autoComplete="off"
            />
          </label>
          {join.error && <p className="error" role="alert">{join.error}</p>}
          <button type="submit" disabled={join.busy || entry.trim().length < 6}>{join.busy ? "Joining..." : "Join their group"}</button>
        </form>
      )}
    </div>
  );
}
