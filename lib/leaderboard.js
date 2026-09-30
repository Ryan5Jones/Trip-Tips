// Friends leaderboard for Passport Quest. A "group" is everyone who signed up through the same shared-trip link
// chain (subscribers.group_code, or the sharer's own share_code for the person who started it).
// Only first names, points and streaks ever leave the server: never emails, tokens or dates.
import { db } from "@/lib/db";
import { firstNameFor } from "@/lib/names";
import { streakFrom } from "@/lib/streak";

export async function getLeaderboard(sub, today = new Date().toISOString().slice(0, 10)) {
  const code = sub.group_code || sub.share_code;
  if (!code) return [];

  const { data: found } = await db
    .from("subscribers")
    .select("id, email, first_name, group_code, share_code, confirmed, unsubscribed")
    .or(`group_code.eq.${code},share_code.eq.${code}`)
    .limit(60);
  const members = (found || []).filter(
    (m) => (m.group_code || m.share_code) === code && ((m.confirmed && !m.unsubscribed) || m.id === sub.id)
  );
  if (!members.length) return [];

  const { data: rows } = await db
    .from("practice_progress")
    .select("subscriber_id, day, points")
    .in("subscriber_id", members.map((m) => m.id));

  const weekStart = new Date(`${today}T00:00:00Z`);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  const weekFrom = weekStart.toISOString().slice(0, 10);

  const seen = {};
  return members.map((m) => {
    const mine = (rows || []).filter((r) => r.subscriber_id === m.id);
    const base = firstNameFor(m) || "Traveler";
    seen[base] = (seen[base] || 0) + 1;
    return {
      name: seen[base] > 1 ? `${base} ${seen[base]}` : base,
      me: m.id === sub.id,
      total: mine.reduce((n, r) => n + (r.points || 0), 0),
      week: mine.filter((r) => r.day >= weekFrom).reduce((n, r) => n + (r.points || 0), 0),
      streak: streakFrom(mine.map((r) => r.day), today),
    };
  });
}
