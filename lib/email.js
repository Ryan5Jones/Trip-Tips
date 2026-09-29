import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const SITE = process.env.NEXT_PUBLIC_SITE_URL;

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function send(message) {
  const { data, error } = await resend.emails.send({ from: process.env.EMAIL_FROM, ...message });
  if (error) throw new Error(`Resend error: ${error.message}`);
  return data?.id; // Resend's email ID, used to match opens/clicks later
}

function wrap(body, token) {
  const unsub = `${SITE}/unsubscribe?token=${token}`;
  return `<div style="font-family:Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0f2e2e;line-height:1.55">
${body}
<hr style="border:none;border-top:1px solid #d5dfde;margin:28px 0 12px">
<p style="font-size:12px;color:#5b7472">Facts and tips are for inspiration. Check official travel advisories before you go.<br>
<a href="${unsub}" style="color:#5b7472">Unsubscribe</a> &middot; ${esc(process.env.MAILING_ADDRESS || "")}</p></div>`;
}

export async function sendConfirmation({ email, destination, token }) {
  const link = `${SITE}/confirm?token=${token}`;
  await send({
    to: email,
    subject: `Confirm your ${destination} trip tips`,
    html: wrap(
      `<h2>One click to start</h2><p>Confirm your email and you'll get a daily tip and fun fact about ${esc(destination)} until you leave.</p>
<p><a href="${link}" style="background:#f2b705;color:#0f2e2e;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">Confirm my email</a></p>`,
      token
    ),
  });
}

export async function sendDaily({ email, destination, token, daysLeft, tipNumber, tip, fact }) {
  const when = daysLeft === 1 ? "1 day to go" : `${daysLeft} days to go`;
  return send({
    to: email,
    // Hidden labels (subscribers never see these)
    tags: [
      { name: "tip_number", value: String(tipNumber) },
      { name: "days_left", value: String(daysLeft) },
    ],
    subject: `${destination}: ${when}`,
    html: wrap(
      `<p style="color:#5b7472;margin-bottom:0">${when}</p><h2 style="margin-top:4px">${esc(destination)}</h2>
<h3>Today's tip</h3><p>${esc(tip)}</p>
<h3>Fun fact</h3><p>${esc(fact)}</p>`,
      token
    ),
  });
}
