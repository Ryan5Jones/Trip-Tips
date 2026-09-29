"use client";
import { useState } from "react";

// "Share this trip" button: uses the phone's share sheet when available, otherwise copies the link.
export default function ShareTrip({ destination, startDate, endDate }) {
  const [copied, setCopied] = useState(false);

  function buildUrl() {
    const params = new URLSearchParams({ trip: destination, leave: startDate });
    if (endDate) params.set("return", endDate);
    params.set("via", "friend");
    return `${window.location.origin}/?${params.toString()}`;
  }

  async function onShare() {
    const url = buildUrl();
    const text = `I'm getting a daily tip and fun fact about ${destination} before our trip. Sign up for the same ones:`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `Trip tips: ${destination}`, text, url });
        return;
      } catch {
        // User closed the share sheet, or it failed; fall through to copying
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copy this link and send it to your travel buddies:", url);
    }
  }

  return (
    <div className="share">
      <p className="share-title">Traveling with friends or a group?</p>
      <p className="share-text">Send them this trip so they get the same daily tips for {destination}.</p>
      <button type="button" className="share-btn" onClick={onShare}>
        {copied ? "Link copied!" : "Share this trip"}
      </button>
    </div>
  );
}
