// The "Food to try" list: local foods and drinks with a photo and a high-rated place to try each one.
const KIND = { dish: "Dish", snack: "Snack", dessert: "Dessert", drink: "Drink" };

export default function FoodList({ place, cuisine, items, places = {} }) {
  const culture = cuisine ? cuisine.replace(/\s*\(.*?\)\s*/g, " ").trim() : place;
  return (
    <div className="food">
      <p className="pg-kicker">Food to try · {place}</p>
      <h1 className="pg-title">{cuisine ? `${culture} favorites` : "Eat like a local"}</h1>
      <p className="pg-sub">Foods and drinks that are specific to {culture} culture, each with a high-rated place to try it.</p>
      <ul className="food-list">
        {items.map((x) => (
          <li key={x.key} className="food-item">
            {x.photo ? (
              <figure className="food-photo">
                <img src={x.photo.url} alt={x.name} loading="lazy" width="120" height="120" />
                <figcaption>
                  <a href={x.photo.page} target="_blank" rel="noopener noreferrer">Photo: Wikipedia</a>
                </figcaption>
              </figure>
            ) : null}
            <div className="food-body">
              <p className="food-name">
                {x.name} <span className="food-kind">{KIND[x.kind] || "Dish"}</span>
              </p>
              {x.local_name && x.local_name !== x.name ? <p className="food-local">{x.local_name}</p> : null}
              <p>{x.what}</p>
              <p className="food-how">{x.how}</p>
              {places[x.key] ? (
                <p className="food-place">
                  📍 Try it at <b>{places[x.key].name}</b> · ★ {places[x.key].rating.toFixed(1)}
                  {places[x.key].count ? ` (${places[x.key].count.toLocaleString("en-US")} reviews)` : ""} ·{" "}
                  <a href={places[x.key].url} target="_blank" rel="noopener noreferrer">Google Maps</a>
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
