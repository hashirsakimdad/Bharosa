# Bharosa explainer video

`bharosa-video.mp4`: 86 seconds, 1920×1080, 30 fps, H.264, no audio. Ready to upload to YouTube.

`video.html` is the source. Every frame is drawn by `render(t)`, so it's deterministic.
Open it in a browser and run `render(20)` in the console to preview any moment.
Timings, captions and chat text are at the top of the script (`CAPS`, `BLOCKS`, `S1TEXT`).

To re-render: load the page in Playwright, call `render(i / 30)` for every frame,
screenshot each one, and pipe the JPEGs into
`ffmpeg -f image2pipe -framerate 30 -c:v mjpeg -i - -c:v libx264 -crf 18 -pix_fmt yuv420p out.mp4`.
