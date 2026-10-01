// Passport Quest (phrase practice): a 2-minute daily game using the phrases each subscriber has unlocked so far.
// Linked from the daily email. The token is the subscriber's private token (same as in unsubscribe links).
import { db } from "@/lib/db";
import { destinationKey } from "@/lib/content";
import PracticeGame from "@/components/PracticeGame";
import { firstNameFor } from "@/lib/names";
import { getLeaderboard } from "@/lib/leaderboard";
import { tripShareUrl } from "@/lib/share";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Passport Quest · Destinations Daily",
  robots: { index: false, follow: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Message({ children }) {
  return (
    <main className="wrap">
      <p className="lede">{children}</p>
      <a href="/">Back to Destinations Daily</a>
    </main>
  );
}

export default async function PracticePage({ params }) {
  const { token } = await params;
  if (!UUID.test(token || "")) return <Message>That practice link doesn&apos;t look right.</Message>;

  const { data: sub } = await db
    .from("subscribers")
    .select("id, email, first_name, destination, start_date, end_date, emails_sent, group_code, share_code")
    .eq("token", token)
    .maybeSingle();
  if (!sub) return <Message>We couldn&apos;t find your trip. Try the link in your latest email.</Message>;

  // Unlocked = every phrase up to today's (at least the 3-phrase starter pack)
  const unlocked = Math.max(3, sub.emails_sent || 0);
  const { data: rows } = await db
    .from("phrase_cache")
    .select("idx, skip, language, lang_code, phrase, native, pronunciation, meaning")
    .eq("destination_key", destinationKey(sub.destination))
    .lt("idx", unlocked)
    .order("idx");

  if ((rows || []).some((r) => r.skip)) {
    return <Message>Good news: they speak English where you&apos;re headed, so there&apos;s no phrase practice for this trip.</Message>;
  }
  const phrases = (rows || []).filter((r) => r.phrase && r.meaning);
  if (phrases.length < 2) {
    return <Message>Your first phrases arrive with your next daily email. Check back tomorrow!</Message>;
  }

  const { data: days } = await db
    .from("practice_progress")
    .select("day")
    .eq("subscriber_id", sub.id)
    .order("day", { ascending: false })
    .limit(60);

  const place = sub.destination.split(",")[0].trim().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  const board = await getLeaderboard(sub).catch(() => []);
  const inviteUrl = tripShareUrl({
    destination: sub.destination,
    startDate: sub.start_date,
    endDate: sub.end_date,
    group: sub.group_code || sub.share_code,
    base: process.env.NEXT_PUBLIC_SITE_URL,
  });
  return (
    <main className="wrap practice-wrap">
      <PracticeGame
        token={token}
        place={place}
        destination={sub.destination}
        board={board}
        inviteUrl={inviteUrl}
        groupCode={sub.group_code || sub.share_code}
        firstName={firstNameFor(sub)}
        phrases={phrases}
        playedDays={(days || []).map((d) => d.day)}
      />
    </main>
  );
}
