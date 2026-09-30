import SignupForm from "@/components/SignupForm";
import ShareTrip from "@/components/ShareTrip";
import SampleEmail from "@/components/SampleEmail";
import { parseSharedTrip } from "@/lib/share";

const MESSAGES = {
  confirmed: "You're in. Your first tip arrives tomorrow morning.",
  unsubscribed: "You've been unsubscribed. No more emails.",
  invalid: "That link didn't work. It may have expired, so try signing up again.",
};

export default async function Home({ searchParams }) {
  const params = await searchParams;
  const { status } = params;
  const trip = parseSharedTrip(params);
  const sharedByFriend = trip && params.via === "friend" && !status;
  return (
    <main className="wrap">
      {MESSAGES[status] && <p className="banner" role="status">{MESSAGES[status]}</p>}
      {status === "confirmed" && trip && <ShareTrip {...trip} />}
      {sharedByFriend && (
        <p className="banner" role="status">
          A friend shared their trip to {trip.destination}. Add your email below to get the same daily tips.
        </p>
      )}
      <h1>Know the place before you land.</h1>
      <p className="lede">
        Tell us where you're going and when. Every morning until you leave, we'll email one
        practical tip and one fun fact about the destination and its culture.
      </p>
      <div id="signup">
        <SignupForm initialTrip={sharedByFriend ? trip : null} />
      </div>
      <p className="fine">Free. One email a day. Unsubscribe in one click.</p>
      <SampleEmail />
    </main>
  );
}
