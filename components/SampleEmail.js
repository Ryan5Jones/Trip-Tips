// A preview of a real daily email, shown on the homepage so visitors see exactly what they'll get.
// Mirrors the style in lib/email.js (plain personal note). Static on purpose: fast and always works.
export default function SampleEmail() {
  return (
    <section className="sample" aria-labelledby="sample-title">
      <h2 id="sample-title">Here's what lands in your inbox</h2>
      <p className="sample-sub">One short email each morning, like this one for a trip to Lisbon:</p>
      <div className="mail" role="img" aria-label="Example daily email">
        <div className="mail-head">
          <div className="mail-row">
            <span className="mail-label">From</span>
            <span>Destinations Daily &lt;tips@destinationsdaily.com&gt;</span>
          </div>
          <div className="mail-row">
            <span className="mail-label">Subject</span>
            <strong>Something to know about Lisbon</strong>
          </div>
        </div>
        <div className="mail-body">
          <p>Hey Alex! 45 days until Lisbon.</p>
          <p>
            Today&apos;s tip: learn three words before you land. &ldquo;Bom dia&rdquo; (good morning),
            &ldquo;boa tarde&rdquo; (good afternoon), and &ldquo;obrigado&rdquo; for thank you, or
            &ldquo;obrigada&rdquo; if you&apos;re a woman, since it matches the speaker, not the listener. Greet
            staff first when you walk into a shop or caf&eacute;. It goes a long way, even if you switch to
            English right after.
          </p>
          <p>
            Fun fact: Portuguese is an official language in nine countries across four continents. Lisbon locals
            are known for swallowing their vowels, so don&apos;t worry if it sounds nothing like the Portuguese
            you&apos;ve heard before.
          </p>
          <p>What&apos;s on your Lisbon must-do list so far? Hit reply and let me know. It helps me make these tips better.</p>
          <p>Ryan</p>
        </div>
      </div>
      <a className="sample-cta" href="#signup">Get tips for my trip &uarr;</a>
    </section>
  );
}
