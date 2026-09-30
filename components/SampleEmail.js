// A preview of a real daily email, shown on the homepage so visitors see exactly what they'll get.
// Mirrors the style in lib/email.js (plain personal note). Static on purpose: fast and always works.
export default function SampleEmail() {
  return (
    <section className="sample" aria-labelledby="sample-title">
      <h2 id="sample-title">Here's what lands in your inbox</h2>
      <p className="sample-sub">One short email each morning, like this one for a trip to Tokyo:</p>
      <div className="mail" role="img" aria-label="Example daily email">
        <div className="mail-head">
          <div className="mail-row">
            <span className="mail-label">From</span>
            <span>Destinations Daily &lt;tips@destinationsdaily.com&gt;</span>
          </div>
          <div className="mail-row">
            <span className="mail-label">Subject</span>
            <strong>Something to know about Tokyo</strong>
          </div>
        </div>
        <div className="mail-body">
          <p>Hey Alex! 45 days until Tokyo.</p>
          <p>
            Today&apos;s tip: don&apos;t tip. Seriously. Great service is the default in Japan, and leaving extra
            cash might send your waiter jogging down the street to give it back. Instead, say
            &ldquo;itadakimasu&rdquo; before you eat and &ldquo;gochisousama deshita&rdquo; (thanks for the meal)
            on your way out. Instant local points.
          </p>
          <p>
            Fun fact: Japanese convenience stores, called konbini, are low-key food heaven. Their fluffy egg
            sandwiches have fans who swear they&apos;re worth the flight. No pressure, but you have 45 days to
            make room.
          </p>
          <p>What&apos;s the one food you have to try in Tokyo? Hit reply and let me know. It helps me make these tips better.</p>
          <p>Ryan</p>
        </div>
      </div>
      <a className="sample-cta" href="#signup">Get tips for my trip &uarr;</a>
    </section>
  );
}
