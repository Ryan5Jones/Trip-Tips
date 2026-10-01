// Food to try: a checklist of local foods and drinks for the subscriber's destination.
// Opened from the daily email with the subscriber's private token (same style as the practice game).
import { db } from "@/lib/db";
import { getFoodList } from "@/lib/food";
import FoodList from "@/components/FoodList";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // the first visit for a new destination writes the list
export const metadata = {
  title: "Food to try · Destinations Daily",
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

export default async function FoodPage({ params }) {
  const { token } = await params;
  if (!UUID.test(token || "")) return <Message>That link doesn&apos;t look right.</Message>;

  const { data: sub } = await db.from("subscribers").select("id, destination").eq("token", token).maybeSingle();
  if (!sub) return <Message>We couldn&apos;t find your trip. Try the link in your latest email.</Message>;

  let list = null;
  try {
    list = await getFoodList(sub.destination);
  } catch (e) {
    console.error("FOOD_LIST failed:", e);
  }
  if (!list) return <Message>Your food list is almost ready. Please check back in a minute.</Message>;

  const { data: tried } = await db.from("food_tried").select("dish_key").eq("subscriber_id", sub.id);
  const place = sub.destination.split(",")[0].trim();

  return (
    <main className="wrap food-wrap">
      <FoodList token={token} place={place} cuisine={list.cuisine} items={list.items} triedKeys={(tried || []).map((t) => t.dish_key)} />
    </main>
  );
}
