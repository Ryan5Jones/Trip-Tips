"use client";
import { useState } from "react";

// "Share this trip" button: uses the phone's share sheet when available, otherwise copies the link.
export default function ShareTrip({ destination, startDate, endDate, group = "" }) {
  const [copied, setCopied] = useState(false);

  function buildUrl() {
    const params = new URLSearchParams({ trip: destination, leave: startDate });
    if (endDate) params.set("return", endDate);
    params.set("via", "friend");
    if (group) params.set("g", group);
    return `${window.location.origin}/?${params.toString()}`;
  }

  const shareText = `I'm getting a daily tip and fun fact about ${destination} before our trip. Sign up for the same ones:`;

  // Opens the viewer's email app with a ready-to-send message
  function onEmail() {
    const subject = `Daily tips for our ${destination} trip`;
    const body = `${shareText}\n\n${buildUrl()}`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  async function onShare() {
    const url = buildUrl();
    const text = shareText;
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
      <p className="share-text">Send them this trip so they get the same daily tips for {destination}, and you can all compete on the Passport Quest leaderboard.</p>
      <div className="share-actions">
        <button type="button" className="share-btn" onClick={onShare}>
          {copied ? "Link copied!" : "Share this trip"}
        </button>
        <button type="button" className="share-btn share-btn-alt" onClick={onEmail}>
          Email it
        </button>
      </div>
    </div>
  );
}
