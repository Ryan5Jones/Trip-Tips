"use client";
import { useState } from "react";

export default function SignupForm() {
  const [state, setState] = useState({ status: "idle", message: "" });

  async function onSubmit(e) {
    e.preventDefault();
    setState({ status: "loading", message: "" });
    const f = new FormData(e.currentTarget);
    const res = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(f)),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setState({ status: "done", message: "" });
    else setState({ status: "error", message: data.error || "Something went wrong." });
  }

  if (state.status === "done")
    return <p className="banner" role="status">Check your inbox and confirm your email to start getting tips.</p>;

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  return (
    <form onSubmit={onSubmit} className="form">
      <label>Where are you going?
        <input name="destination" placeholder="Lisbon, Portugal" required maxLength={80} />
      </label>
      <div className="row">
        <label>Leaving on
          <input type="date" name="startDate" min={tomorrow} required />
        </label>
        <label>Coming back (optional)
          <input type="date" name="endDate" min={tomorrow} />
        </label>
      </div>
      <label>Your email
        <input type="email" name="email" placeholder="you@example.com" required />
      </label>
      {/* honeypot: hidden from people, filled by bots */}
      <input name="website" tabIndex={-1} autoComplete="off" className="hp" aria-hidden="true" />
      {state.status === "error" && <p className="error" role="alert">{state.message}</p>}
      <button disabled={state.status === "loading"}>
        {state.status === "loading" ? "Signing you up..." : "Start my daily tips"}
      </button>
    </form>
  );
}
