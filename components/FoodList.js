"use client";
// The "Food to try" checklist. Ticks are saved as you go.
import { useState } from "react";

const KIND = { dish: "Dish", snack: "Snack", dessert: "Dessert", drink: "Drink" };

export default function FoodList({ token, place, cuisine, items, triedKeys }) {
  const [tried, setTried] = useState(() => new Set(triedKeys));
  const [error, setError] = useState("");

  async function toggle(key) {
    const now = !tried.has(key);
    const next = new Set(tried);
    if (now) next.add(key); else next.delete(key);
    setTried(next); // instant feedback
    setError("");
    try {
      const res = await fetch("/api/food/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, key, tried: now }),
      });
      if (!res.ok) throw new Error("save failed");
    } catch {
      setTried(tried); // put it back
      setError("Couldn't save that one. Check your connection and try again.");
    }
  }

  const count = items.filter((x) => tried.has(x.key)).length;

  return (
    <div className="food">
      <p className="pg-kicker">Food to try · {place}</p>
      <h1 className="pg-title">{cuisine ? `${cuisine} favorites` : `Eat like a local`}</h1>
      <p className="pg-sub">Tap the ones you&apos;ve tried. Bring an appetite.</p>
      <div className="food-progress" aria-label={`${count} of ${items.length} tried`}>
        <span style={{ width: `${(count / items.length) * 100}%` }} />
      </div>
      <p className="pg-fine">{count} of {items.length} tried{count === items.length ? ". You did it! 🎉" : ""}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <ul className="food-list">
        {items.map((x) => {
          const done = tried.has(x.key);
          return (
            <li key={x.key} className={`food-item ${done ? "is-done" : ""}`}>
              {x.photo ? (
                <figure className="food-photo">
                  <img src={x.photo.url} alt={x.name} loading="lazy" width="120" height="120" />
                  <figcaption>
                    <a href={x.photo.page} target="_blank" rel="noopener noreferrer">Photo: Wikipedia</a>
                  </figcaption>
                </figure>
              ) : null}
              <div className="food-body">
                <p className="food-name">
                  {x.name} <span className="food-kind">{KIND[x.kind] || "Dish"}</span>
                </p>
                {x.local_name && x.local_name !== x.name ? <p className="food-local">{x.local_name}</p> : null}
                <p>{x.what}</p>
                <p className="food-how">{x.how}</p>
                <button type="button" className={done ? "food-btn is-done" : "food-btn"} aria-pressed={done} onClick={() => toggle(x.key)}>
                  {done ? "✓ Tried it" : "I tried it"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
