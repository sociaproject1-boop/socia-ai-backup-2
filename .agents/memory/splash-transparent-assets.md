---
name: Splash transparent assets & screenshot timing
description: Why logo splash assets must be true-transparent, and how to verify delayed CSS animations with the screenshot tool.
---

The launch SplashScreen and the AI generation overlay must render the SOCIA logo
from genuinely transparent assets cut from `attached_assets/socia-ai-logo-clean.png`
(e.g. `attached_assets/splash2/mark.png`, `wordmark.png`).

**Why:** the original splash/overlay crops had the dark rounded-square app-icon
tile baked into the PNG. On a pure-black screen `mixBlendMode:"screen"` cannot
remove it because the tile is not pure #000 — it renders as a visible dark square.
The user repeatedly rejected overlay/mask band-aids and demanded the asset itself
be transparent. Glow must come from `filter: drop-shadow(...)` on the logo's own
alpha shape, never from a halo `<div>`/panel behind it.

**How to apply:** verify a crop is clean by compositing it on a bright color
(`magick -size WxH xc:red asset.png -gravity center -composite out.png`) — any
square/tile/edge becomes obvious.

**Screenshot verification gotcha:** the `screenshot` tool reloads the page on
capture, which resets all CSS animation timers to 0. Any animation with a delay
> ~1s (the wordmark wipe starts at 1100ms) will NOT appear in the screenshot even
if you `sleep` first. To verify a delayed animation's END state, temporarily set
its delay to 0 (and shorten its duration), screenshot, then restore the real
timing. Same trick (freeze EXIT/UNMOUNT timers to huge values) is needed because
the splash auto-dismisses at ~3.85s.
