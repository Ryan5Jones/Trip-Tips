// Renders one 1080x1920 JPEG slide (TikTok carousel + Instagram Reels). `row` needs destination, hook, tip, fact, photo_url.
import { ImageResponse } from "next/og";
import sharp from "sharp";

const W = 1080;
const H = 1920;
export const SLIDE_COUNT = 4;

function slideContent(row, n) {
  const place = String(row.destination || "").split(",")[0].trim();
  if (n === 1) return { label: place.toUpperCase(), text: row.hook, size: 92 };
  if (n === 2) return { label: "TRAVEL TIP", text: row.tip, size: 66 };
  if (n === 3) return { label: "FUN FACT", text: row.fact, size: 66 };
  return { label: "HEADING SOMEWHERE?", text: "Get a free tip every day until you go.", size: 80, footer: "Link in bio" };
}

export async function renderSlideJpeg(row, n) {
  const c = slideContent(row, n);
  const img = new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", position: "relative", background: "#0b1d2a" }}>
        {row.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.photo_url} width={W} height={H} style={{ position: "absolute", top: 0, left: 0, width: W, height: H, objectFit: "cover" }} />
        ) : null}
        <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex", background: "linear-gradient(180deg, rgba(5,15,25,0.55) 0%, rgba(5,15,25,0.72) 100%)" }} />
        <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 90px" }}>
          <div style={{ display: "flex", fontSize: 42, letterSpacing: 8, color: "#ffd166", fontWeight: 700, marginBottom: 40 }}>{c.label}</div>
          <div style={{ display: "flex", fontSize: c.size, lineHeight: 1.18, color: "#ffffff", fontWeight: 800 }}>{c.text}</div>
          {c.footer ? <div style={{ display: "flex", fontSize: 44, color: "#ffd166", marginTop: 60, fontWeight: 700 }}>{c.footer}</div> : null}
        </div>
        <div style={{ position: "absolute", bottom: 330, left: 0, width: W, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 58, color: "#ffd166", fontWeight: 800 }}>destinationsdaily.com</div>
          <div style={{ display: "flex", fontSize: 30, color: "rgba(255,255,255,0.8)", letterSpacing: 4, marginTop: 12 }}>{`${n}/${SLIDE_COUNT}`}</div>
        </div>
      </div>
    ),
    { width: W, height: H }
  );
  const png = Buffer.from(await img.arrayBuffer());
  const jpg = await sharp(png).jpeg({ quality: 88 }).toBuffer();
  return jpg;
}
