"use client";
import { useState } from "react";
import ShareTrip from "@/components/ShareTrip";

export default function SignupForm({ initialTrip = null }) {
  const [state, setState] = useState({ status: "idle", message: "" });
  const [trip, setTrip] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setState({ status: "loading", message: "" });
    const f = new FormData(e.currentTarget);
    const submitted = Object.fromEntries(f);
    const res = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(submitted),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setTrip({ destination: submitted.destination, startDate: submitted.startDate, endDate: submitted.endDate });
      setState({ status: "done", message: "" });
    }
    else setState({ status: "error", message: data.error || "Something went wrong." });
  }

  if (state.status === "done")
    return (
      <>
        <p className="banner" role="status">Check your inbox and confirm your email to start getting tips.</p>
        {trip && <ShareTrip {...trip} />}
      </>
    );

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  return (
    <form onSubmit={onSubmit} className="form">
      <label>Where are you going?
        <input name="destination" placeholder="Lisbon, Portugal" required maxLength={80} defaultValue={initialTrip?.destination} />
      </label>
      <div className="row">
        <label>Leaving on
          <input type="date" name="startDate" min={tomorrow} required defaultValue={initialTrip?.startDate} />
        </label>
        <label>Coming back (optional)
          <input type="date" name="endDate" min={tomorrow} defaultValue={initialTrip?.endDate} />
        </label>
      </div>
      <div className="row">
        <label>First name (optional)
          <input name="firstName" placeholder="Alex" maxLength={40} autoComplete="given-name" />
        </label>
        <label>Your email
          <input type="email" name="email" placeholder="you@example.com" required autoComplete="email" />
        </label>
      </div>
      {state.status === "error" && <p className="error" role="alert">{state.message}</p>}
      <button disabled={state.status === "loading"}>
        {state.status === "loading" ? "Signing you up..." : "Start my daily tips"}
      </button>
    </form>
  );
}
