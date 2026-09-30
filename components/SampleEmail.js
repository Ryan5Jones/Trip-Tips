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
          <p>
            Hey Alex! 45 days until Tokyo. Here&apos;s today&apos;s tip: don&apos;t tip in Tokyo restaurants.
            Good service is simply expected, and leaving cash on the table can cause confusion. Instead, say
            &ldquo;itadakimasu&rdquo; before you eat and &ldquo;gochisousama deshita&rdquo; (thank you for the
            meal) when you leave.
          </p>
          <p>
            And a fun fact you can bust out at dinner: Japanese convenience stores, called konbini, are famous
            for genuinely great food, like fluffy egg sandwiches (tamago sando) and onigiri rice balls.
          </p>
          <p>What&apos;s the one food you have to try in Tokyo? Hit reply and let me know.</p>
          <p>Ryan</p>
        </div>
      </div>
      <a className="sample-cta" href="#signup">Get tips for my trip &uarr;</a>
    </section>
  );
}
