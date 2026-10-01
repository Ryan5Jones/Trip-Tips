#!/usr/bin/env bash
# Runs in GitHub Actions: asks the site for the next reel, turns its 4 slides into a ~16 second vertical video, uploads it,
# and asks the site to publish it (the site only posts when setting:reels_mode = "auto").
# Needs env: REELS_SECRET (from GitHub secrets), SITE (defaults to https://www.destinationsdaily.com), SLOT (morning|evening).
set -euo pipefail
SITE="${SITE:-https://www.destinationsdaily.com}"
SLOT="${SLOT:-morning}"
AUTH="Authorization: Bearer ${REELS_SECRET}"
WORK="$(mktemp -d)"

JOB="$(curl -fsS --max-time 150 -H "$AUTH" "$SITE/api/reels/job?slot=$SLOT${RERENDER:+&rerender=1}")"
echo "Job: $(echo "$JOB" | jq -c 'del(.slides)')"
ACTION="$(echo "$JOB" | jq -r .action)"
ID="$(echo "$JOB" | jq -r .id)"

if [ "$ACTION" = "render" ]; then
  i=1
  for url in $(echo "$JOB" | jq -r '.slides[]'); do
    curl -fsS --max-time 90 -o "$WORK/s$i.jpg" "$url"
    i=$((i+1))
  done
  # 4 slides, 4.5s each with 0.5s cross-fades and a slow zoom, plus a silent audio track (Instagram wants one)
  ffmpeg -hide_banner -loglevel error -y \
    -loop 1 -t 4.5 -i "$WORK/s1.jpg" -loop 1 -t 4.5 -i "$WORK/s2.jpg" -loop 1 -t 4.5 -i "$WORK/s3.jpg" -loop 1 -t 4.5 -i "$WORK/s4.jpg" \
    -f lavfi -t 16.5 -i anullsrc=channel_layout=stereo:sample_rate=44100 \
    -filter_complex "[0:v]scale=1080:1920,zoompan=z='min(zoom+0.0006,1.06)':d=135:s=1080x1920:fps=30,setsar=1[v0];\
[1:v]scale=1080:1920,zoompan=z='min(zoom+0.0006,1.06)':d=135:s=1080x1920:fps=30,setsar=1[v1];\
[2:v]scale=1080:1920,zoompan=z='min(zoom+0.0006,1.06)':d=135:s=1080x1920:fps=30,setsar=1[v2];\
[3:v]scale=1080:1920,zoompan=z='min(zoom+0.0006,1.06)':d=135:s=1080x1920:fps=30,setsar=1[v3];\
[v0][v1]xfade=transition=fade:duration=0.5:offset=4[x1];\
[x1][v2]xfade=transition=fade:duration=0.5:offset=8[x2];\
[x2][v3]xfade=transition=fade:duration=0.5:offset=12[vout]" \
    -map "[vout]" -map 4:a -c:v libx264 -preset medium -crf 28 -pix_fmt yuv420p -r 30 -c:a aac -b:a 64k -shortest -movflags +faststart "$WORK/reel.mp4"
  # the site accepts videos up to ~4.3 MB; squeeze harder if needed
  if [ "$(stat -c%s "$WORK/reel.mp4")" -gt 4200000 ]; then
    ffmpeg -hide_banner -loglevel error -y -i "$WORK/reel.mp4" -c:v libx264 -preset medium -crf 34 -pix_fmt yuv420p -c:a copy -movflags +faststart "$WORK/reel_small.mp4"
    mv "$WORK/reel_small.mp4" "$WORK/reel.mp4"
  fi
  ls -l "$WORK/reel.mp4"
  curl -fsS --max-time 120 -X POST -H "$AUTH" -H "Content-Type: video/mp4" --data-binary @"$WORK/reel.mp4" "$SITE/api/reels/upload?id=$ID"
  echo
  ACTION="publish"
fi

if [ "$ACTION" = "publish" ]; then
  curl -fsS --max-time 150 -X POST -H "$AUTH" "$SITE/api/reels/publish?id=$ID"
  echo
else
  echo "Nothing more to do (action: $ACTION)"
fi
