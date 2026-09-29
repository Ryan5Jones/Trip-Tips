import SignupForm from "@/components/SignupForm";

const MESSAGES = {
  confirmed: "You're in. Your first tip arrives tomorrow morning.",
  unsubscribed: "You've been unsubscribed. No more emails.",
  invalid: "That link didn't work. It may have expired, so try signing up again.",
};

export default async function Home({ searchParams }) {
  const { status } = await searchParams;
  return (
    <main className="wrap">
      {MESSAGES[status] && <p className="banner" role="status">{MESSAGES[status]}</p>}
      <h1>Know the place before you land.</h1>
      <p className="lede">
        Tell us where you're going and when. Every morning until you leave, we'll email one
        practical tip and one fun fact about the destination and its culture.
      </p>
      <SignupForm />
      <p className="fine">Free. One email a day. Unsubscribe in one click.</p>
    </main>
  );
}
