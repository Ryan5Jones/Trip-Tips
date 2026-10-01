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
    // List-Unsubscribe header intentionally omitted (may nudge Gmail toward Promotions; not required
    // under ~5,000 Gmail recipients/day). The visible unsubscribe link in the footer stays.
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

// What we say when asking people to reply. Once replies really shape tips ("setting:replies_live"), we say so.
const ASK_OLD = "Hit reply and let me know. It helps me make these tips better.";
const ASK_LIVE = "Hit reply and tell me. I use your answers to tailor your future tips.";
const ask = (live) => (live ? ASK_LIVE : ASK_OLD);

const PRIMARY_NOTE_HTML =
  "P.S. Using Gmail? Drag this email into your <b>Primary</b> tab so tomorrow's tip doesn't get lost in Promotions.";
const PRIMARY_NOTE_TEXT =
  "P.S. Using Gmail? Drag this email into your Primary tab so tomorrow's tip doesn't get lost in Promotions.";

export async function sendConfirmation({ email, destination, token, subjectPrefix = "", firstName = null, replyLive = false }) {
  const link = `${SITE}/confirm?token=${token}`;
  const d = esc(destination);
  const f = footer(token);
  await send({
    to: email,
    subject: `${subjectPrefix}Confirm your ${destination} trip tips`,
    unsubUrl: f.unsub,
    html:
      toHtml([
        firstName ? `Hi ${esc(firstName)},` : "Hi there,",
        `Thanks for signing up! Confirm your email and I'll send you one tip and one fun fact about ${d} every morning until you leave:`,
        `<a href="${link}">${link}</a>`,
        `Quick question while you're here: what are you most excited about for ${d}? ${ask(replyLive)}`,
        "Ryan<br>Destinations Daily",
        PRIMARY_NOTE_HTML,
      ]) + f.html,
    text: [
      firstName ? `Hi ${firstName},` : "Hi there,",
      `Thanks for signing up! Confirm your email and I'll send you one tip and one fun fact about ${destination} every morning until you leave:`,
      link,
      `Quick question while you're here: what are you most excited about for ${destination}? ${ask(replyLive)}`,
      "Ryan\nDestinations Daily",
      PRIMARY_NOTE_TEXT,
      f.text,
    ].join("\n\n"),
  });
}

// A short personal question for regular days (tip #2+). Replies are the strongest
// "real contact" signal for Gmail. Rotates so it doesn't read copy-pasted.
function personalQuestion(place, tipNumber, live = false) {
  const qs = [
    "Have you booked anything yet?",
    `What's the one food you have to try in ${place}?`,
    "Traveling solo or with a crew?",
    `What's on your ${place} must-do list so far?`,
    "Anything you're unsure about for the trip?",
    `Is this your first time in ${place}?`,
  ];
  return `${qs[(tipNumber - 2 + qs.length) % qs.length]} ${ask(live)}`;
}

// Conversational subject lines that change daily (a fixed "X: N days to go" pattern reads like a newsletter)
function dailySubject(place, daysLeft, tipNumber) {
  const days = daysLeft === 1 ? "1 day" : `${daysLeft} days`;
  const options = [
    `A ${place} tip before you go`,
    `${days} until ${place}!`,
    `Something to know about ${place}`,
    `Quick one for your ${place} trip`,
    `Your ${place} tip for today`,
    `Did you know this about ${place}?`,
  ];
  return options[(tipNumber - 1) % options.length];
}

export async function sendDaily({ email, destination, token, daysLeft, tipNumber, tip, fact, startDate, endDate, subjectPrefix = "", personalLine = false, photo = null, firstName = null, phrase = null, groupCode = "", replyLive = false }) {
  const place = destination.split(",")[0].trim();
  const days = daysLeft === 1 ? "Just 1 day" : `${daysLeft} days`;
  const shareLink = tripShareUrl({ destination, startDate, endDate, group: groupCode, base: SITE });
  const f = footer(token);
  const first = tipNumber === 1;
  const hey = firstName ? `Hey ${firstName}!` : "Hey!";
  const opener = daysLeft === 1 ? `${esc(hey)} Just 1 day until ${esc(place)}.` : `${esc(hey)} ${days} until ${esc(place)}.`;
  const openerText = daysLeft === 1 ? `${hey} Just 1 day until ${place}.` : `${hey} ${days} until ${place}.`;

  // Optional photo, placed right under the paragraph it illustrates (tip or fun fact)
  const photoHtml = photo?.url
    ? `<img src="${esc(photo.url)}" alt="${esc(photo.alt || place)}" width="${photo.width || 480}" ` +
      `style="display:block;width:100%;max-width:${photo.width || 480}px;height:auto;border:0;border-radius:4px">` +
      `<span style="font-size:11px;color:#888">${esc(photo.credit || "")}</span>`
    : null;
  // Optional daily language lesson (lib/phrases.js)
  const phraseLead = phrase
    ? `Today's ${phrase.language} phrase: ` +
      (phrase.native ? `${phrase.native} (${phrase.phrase})` : `"${phrase.phrase}"`) +
      `, pronounced ${phrase.pronunciation}, means "${phrase.meaning}".` +
      (phrase.usage ? ` ${phrase.usage}` : "")
    : null;
  const practiceLink = `${SITE}/practice/${token}`;
  const tipPara = `${opener} Here's today's tip: ${esc(tip)}`;
  const factPara = `And a fun fact you can bust out at dinner: ${esc(fact)}`;

  const htmlParas = [
    tipPara,
    ...(photoHtml && photo.about === "tip" ? [photoHtml] : []),
    factPara,
    ...(photoHtml && photo.about !== "tip" ? [photoHtml] : []),
    ...(phraseLead ? [esc(phraseLead)] : []),
    ...(phraseLead ? [`Practice it (2-minute game): <a href="${esc(practiceLink)}">${esc(practiceLink)}</a>`] : []),
    `Traveling with friends? Send them this so they get the same tips: <a href="${esc(shareLink)}">${esc(shareLink)}</a>`,
    ...(first ? [`What are you most looking forward to? ${ask(replyLive)}`] : []),
    ...(!first && personalLine ? [esc(personalQuestion(place, tipNumber, replyLive))] : []),
    "Ryan",
    ...(first ? [PRIMARY_NOTE_HTML] : []),
  ];
  const textParas = [
    `${openerText} Here's today's tip: ${tip}`,
    `And a fun fact you can bust out at dinner: ${fact}`,
    ...(phraseLead ? [phraseLead] : []),
    ...(phraseLead ? [`Practice it (2-minute game): ${practiceLink}`] : []),
    `Traveling with friends? Send them this so they get the same tips: ${shareLink}`,
    ...(first ? [`What are you most looking forward to? ${ask(replyLive)}`] : []),
    ...(!first && personalLine ? [personalQuestion(place, tipNumber, replyLive)] : []),
    "Ryan",
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
    subject: `${subjectPrefix}${dailySubject(place, daysLeft, tipNumber)}`,
    unsubUrl: f.unsub,
    html: toHtml(htmlParas) + f.html,
    text: textParas.join("\n\n"),
  });
}
