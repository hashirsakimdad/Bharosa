#!/usr/bin/env bash
# Mixes the narration lines and music onto the silent explainer video.
#
#   ./mix.sh <audio-folder> [video] [output]
#
# <audio-folder> holds line1.mp3 ... line8.mp3 and music.mp3 (ElevenLabs downloads, renamed).
# Each line starts exactly when its scene starts; music fades in/out and ducks under the voice;
# the result is loudness-normalised to -14 LUFS (YouTube's target).
set -euo pipefail
A="${1:?usage: mix.sh <audio-folder> [video] [output]}"
V="${2:-$(dirname "$0")/bharosa-video.mp4}"
OUT="${3:-$(dirname "$0")/bharosa-video-narrated.mp4}"
DUR=86

# scene start (seconds) and speed-up for each narration line
STARTS=(0.3 8.4 14.4 31.8 42.8 53.0 65.0 78.0)
TEMPO=(1.08 1.00 1.04 1.00 1.00 1.00 1.00 1.00)

inputs=(-i "$V")
for i in 1 2 3 4 5 6 7 8; do inputs+=(-i "$A/line$i.mp3"); done
inputs+=(-stream_loop -1 -i "$A/music.mp3")

f=""
for i in 0 1 2 3 4 5 6 7; do
  ms=$(awk "BEGIN{printf \"%d\", ${STARTS[$i]}*1000}")
  f+="[$((i+1)):a]aresample=48000,atempo=${TEMPO[$i]},adelay=${ms}|${ms},apad[v$i];"
done
f+="[v0][v1][v2][v3][v4][v5][v6][v7]amix=inputs=8:normalize=0:duration=longest,atrim=0:${DUR},volume=1.6[voice];"
f+="[voice]asplit=2[vo][sc];"
f+="[9:a]aresample=48000,atrim=0:${DUR},afade=t=in:d=1.5,afade=t=out:st=$((DUR-4)):d=4,volume=0.55[mus];"
f+="[mus][sc]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[duck];"
f+="[vo][duck]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[out]"

ffmpeg -hide_banner -loglevel error -y "${inputs[@]}" -filter_complex "$f" \
  -map 0:v -map "[out]" -c:v copy -c:a aac -b:a 192k -ar 48000 -t "$DUR" -movflags +faststart "$OUT"
echo "wrote $OUT"
