# demoscene-recomp

Classic PC demoscene productions running natively in the browser.

**Play them: https://treylorswift.github.io/demoscene-recomp/**

| Demo | Group | Year |
|---|---|---|
| [Unreal](https://treylorswift.github.io/demoscene-recomp/web/unreal/) (v1.0) | Future Crew | 1992 |
| [Second Reality](https://treylorswift.github.io/demoscene-recomp/web/second/) | Future Crew | 1993 |
| [Crystal Dream 2](https://treylorswift.github.io/demoscene-recomp/web/cd2/) | Triton | 1993 |
| [Stars: Wonders of the World](https://treylorswift.github.io/demoscene-recomp/web/stars/) | NoooN | 1995 |

## Bumpers and intros (this fork)

This fork adds a fifth item to the BBS menu: openers, sponsor slates, stings
and stream loops for the Dr. J Show, Meridian Strategic Systems and Plausible
Deniability Labs, in [web/bumpers/](web/bumpers/).

Nothing in them is recompiled. They're new, written the way the demos above
were: every frame drawn in software into one 480x270 buffer (16:9, so it
scales by whole numbers to 1080p and 4K), text in the site's VGA font, and
every sound built from oscillators and noise in WebAudio. The Janus bust is
software-rasterised with a z-buffer and Bayer-dithered to one bit.

| Bumper | Kind | Length |
|---|---|---|
| Meridian Strategic Systems presents | Opener | 8 s |
| A Meridian Strategic Systems production | End card | 5 s |
| Meridian globe (ticker text editable) | Loop, silent | 20 s |
| The Dr. J Show (wall text editable) | Show bumper | 4 s |
| Be right back / Starting soon (title and scroller editable) | Loop | 16 s |
| Dr. J on fire | Loop, silent | 10 s |
| Plausible Deniability Labs | Opener | 8 s |
| [REDACTED] | Sting | 2.5 s |
| Janus spin | Loop, silent | 12 s |
| Sponsored by (name, tagline, address editable) | Sponsor | 6 s |
| And now, back to the show | Sponsor | 3 s |

**In the browser:** `web/bumpers/` plays them; Space plays, F goes
fullscreen, Record saves one pass as a 1080p video file. Add `?obs=1` to a
player URL for an OBS browser source that starts by itself and repeats.

**For an edit:** `tools/render.mjs` renders a master with exact frames and the
sound, 4K ProRes 422 HQ by default, leveled to -18 LUFS with peaks held at
-1 dBTP so a timeline limiter has room.

```sh
cd tools && npm install && cd ..
node tools/render.mjs --list
node tools/render.mjs drj-show
node tools/render.mjs sponsor --name "ACME" --tag "WE MAKE ANVILS" --url acme.com --mp4
node tools/render.mjs --all --size 1080 --mp4
```

Each render also writes `renders/checks/<name>_sheet.jpg`, eight frames
across its length.

Bust: Double headed herm, The Fitzwilliam Museum, Cambridge (GR.20.1850),
CC BY 4.0. Put that line in the description of any video that uses the
Plausible Deniability Labs pieces. `tools/janus-mesh.mjs` rebuilds
`web/bumpers/janus-mesh.js` from the scan.

The fork's pages don't report to the original site's visitor counter.

## What this is

Each demo's original DOS code, recompiled instruction for instruction, runs
in your browser:

1. The demo is run on an x86 emulator that records every block of code the
   CPU actually executes, over the whole demo.
2. That recording is translated into C - the original instructions, one for
   one, with the exact cycle timing of the emulated machine.
3. The C is compiled to WebAssembly, together with software models of the
   hardware the demo talks to: the timer, the VGA card and the Sound Blaster.
4. The result is checked against the emulator event for event: every
   interrupt, port access and frame at the same moment of emulated time.

The demos' own loaders, music players and effects all run as they did in
1992 to 1995; only the hardware is modelled.

The demos ran on VGA at 70 Hz, so they look smoothest on a display running
at 70 Hz, or at 140 Hz or higher.

## Options on the demo pages

- **Section** - start from one of the demo's own start points.
- **Smooth City** (Second Reality) - an optional enhancement of the city
  flythrough: the camera animation interpolated to 70 frames per second,
  with sub-pixel polygon edges. Off by default; off is the original.
- **Fullscreen** - shown at 4:3, as a VGA monitor displayed it.
- **CRT Scanlines** - dark scanlines and a slight softening on the picture.
  Off is the original picture.
- **The end menu** (Crystal Dream 2) is interactive: arrow keys and Enter.
- **Pause** - tap or click the picture; while paused, the camera button saves
  the frame as a PNG at the demo's own resolution.
- **Site style** (the menu at the top right) - Retro or Modern.

## Credits

Unreal and Second Reality are by [Future Crew](https://en.wikipedia.org/wiki/Future_Crew),
Crystal Dream 2 is by [Triton](https://en.wikipedia.org/wiki/Triton_(demogroup)),
Stars: Wonders of the World is by NoooN; all were released free to the demoscene. The original release files are served
unmodified, as the demos read them at run time.

The site's text font is IBM VGA 8x16 by VileR, int10h.org (CC BY-SA 4.0).
