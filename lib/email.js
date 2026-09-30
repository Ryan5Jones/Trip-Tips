import { Resend } from "resend";
import { tripShareUrl } from "@/lib/share";

const resend = new Resend(process.env.RESEND_API_KEY);
const SITE = process.env.NEXT_PUBLIC_SITE_URL;

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Emails are deliberately written like a personal note (plain text + very light HTML, no buttons,
// no colored boxes). That makes Gmail more likely to put them in Primary instead of Promotions.
async function send({ html, text, unsubUrl, ...message }) {
  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM,
    ...(process.env.EMAIL_REPLY_TO ? { replyTo: process.env.EMAIL_REPLY_TO } : {}),
    headers: unsubUrl ? { "List-Unsubscribe": `<${unsubUrl}>` } : undefined,
    html,
    text,
    ...message,
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
  return data?.id; // Resend's email ID, used to match opens/clicks later
}

// Plain paragraphs -> minimal HTML (no styling beyond a readable font)
function toHtml(paragraphs) {
  const body = paragraphs
    .map((p) => `<p>${p}</p>`)
    .join("\n");
  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#222">\n${body}\n</div>`;
}

function footer(token) {
  const unsub = `${SITE}/unsubscribe?token=${token}`;
  const address = process.env.MAILING_ADDRESS || "";
  return {
    unsub,
    html: `<p style="font-size:12px;color:#777">Tips and facts are for inspiration; check official travel advisories before you go.<br>` +
      `Don't want these anymore? <a href="${unsub}">Unsubscribe</a>. ${esc(address)}</p>`,
    text: `--\nTips and facts are for inspiration; check official travel advisories before you go.\n` +
      `Unsubscribe: ${unsub}\n${address}`,
  };
}

const PRIMARY_NOTE_HTML =
  "P.S. Using Gmail? Drag this email into your <b>Primary</b> tab so tomorrow's tip doesn't get lost in Promotions.";
const PRIMARY_NOTE_TEXT =
  "P.S. Using Gmail? Drag this email into your Primary tab so tomorrow's tip doesn't get lost in Promotions.";

export async function sendConfirmation({ email, destination, token }) {
  const link = `${SITE}/confirm?token=${token}`;
  const d = esc(destination);
  const f = footer(token);
  await send({
    to: email,
    subject: `Confirm your ${destination} trip tips`,
    unsubUrl: f.unsub,
    html:
      toHtml([
        "Hi there,",
        `Thanks for signing up! Confirm your email and I'll send you one tip and one fun fact about ${d} every morning until you leave:`,
        `<a href="${link}">${link}</a>`,
        `Quick question while you're here: what are you most excited about for ${d}? Just hit reply, I read every one.`,
        "Ryan<br>Destinations Daily",
        PRIMARY_NOTE_HTML,
      ]) + f.html,
    text: [
      "Hi there,",
      `Thanks for signing up! Confirm your email and I'll send you one tip and one fun fact about ${destination} every morning until you leave:`,
      link,
      `Quick question while you're here: what are you most excited about for ${destination}? Just hit reply, I read every one.`,
      "Ryan\nDestinations Daily",
      PRIMARY_NOTE_TEXT,
      f.text,
    ].join("\n\n"),
  });
}

export async function sendDaily({ email, destination, token, daysLeft, tipNumber, tip, fact, startDate, endDate }) {
  const when = daysLeft === 1 ? "1 day to go" : `${daysLeft} days to go`;
  const shareLink = tripShareUrl({ destination, startDate, endDate, base: SITE });
  const f = footer(token);
  const first = tipNumber === 1;

  const htmlParas = [
    `<b>${esc(destination)}: ${when}</b>`,
    `<b>Today's tip:</b> ${esc(tip)}`,
    `<b>Fun fact:</b> ${esc(fact)}`,
    `Traveling with friends? Forward them this link so they get the same tips: <a href="${esc(shareLink)}">${esc(shareLink)}</a>`,
    ...(first ? [`Hit reply and tell me what you're most looking forward to. I read every one.`] : []),
    "Ryan<br>Destinations Daily",
    ...(first ? [PRIMARY_NOTE_HTML] : []),
  ];
  const textParas = [
    `${destination}: ${when}`,
    `Today's tip: ${tip}`,
    `Fun fact: ${fact}`,
    `Traveling with friends? Forward them this link so they get the same tips: ${shareLink}`,
    ...(first ? ["Hit reply and tell me what you're most looking forward to. I read every one."] : []),
    "Ryan\nDestinations Daily",
    ...(first ? [PRIMARY_NOTE_TEXT] : []),
    f.text,
  ];

  return send({
    to: email,
    // Hidden labels (subscribers never see these)
    tags: [
      { name: "tip_number", value: String(tipNumber) },
      { name: "days_left", value: String(daysLeft) },
    ],
    subject: `${destination}: ${when}`,
    unsubUrl: f.unsub,
    html: toHtml(htmlParas) + f.html,
    text: textParas.join("\n\n"),
  });
}
