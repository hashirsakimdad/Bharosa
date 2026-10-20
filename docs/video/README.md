# Bharosa explainer video

`bharosa-video.mp4`: 86 seconds, 1920×1080, 30 fps, H.264, no audio. Ready to upload to YouTube.

`video.html` is the source. Every frame is drawn by `render(t)`, so it's deterministic.
Open it in a browser and run `render(20)` in the console to preview any moment.
Timings, captions and chat text are at the top of the script (`CAPS`, `BLOCKS`, `S1TEXT`).

To re-render: load the page in Playwright, call `render(i / 30)` for every frame,
screenshot each one, and pipe the JPEGs into
`ffmpeg -f image2pipe -framerate 30 -c:v mjpeg -i - -c:v libx264 -crf 18 -pix_fmt yuv420p out.mp4`.

## Narration + music

`mix.sh <audio-folder>` adds the ElevenLabs narration (line1.mp3 to line8.mp3) and music (music.mp3)
onto the video: each line starts on its scene, music fades in/out and ducks under the voice,
loudness is normalised to -14 LUFS for YouTube. Output: `bharosa-video-narrated.mp4`.

| File | Starts at | Line |
|---|---|---|
| line1 | 0:00.3 | Most online shopping here happens in DMs... |
| line2 | 0:08.4 | This is Bharosa. It means trust. Check before you pay. |
| line3 | 0:14.4 | Just forward the seller's message... |
| line4 | 0:31.8 | Write in Roman Urdu, Urdu, Arabic or English... |
| line5 | 0:42.8 | Reply REPORT, and the next buyer... |
| line6 | 0:53.0 | When a deal looks safe, you pay through PayPal... |
| line7 | 1:05.0 | Every check is chained to the one before it... |
| line8 | 1:18.0 | Bharosa. Forward it before you pay. |
