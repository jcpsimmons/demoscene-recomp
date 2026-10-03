# demoscene-recomp

Classic PC demoscene productions running natively in the browser.

**Play them: https://treylorswift.github.io/demoscene-recomp/**

| Demo | Group | Year |
|---|---|---|
| [Unreal](https://treylorswift.github.io/demoscene-recomp/web/unreal/) (v1.0) | Future Crew | 1992 |
| [Second Reality](https://treylorswift.github.io/demoscene-recomp/web/second/) | Future Crew | 1993 |
| [Crystal Dream 2](https://treylorswift.github.io/demoscene-recomp/web/cd2/) | Triton | 1993 |

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
1992 and 1993; only the hardware is modelled.

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
- **Site style** (the menu at the top right) - Retro or Modern.

## Credits

Unreal and Second Reality are by [Future Crew](https://en.wikipedia.org/wiki/Future_Crew),
Crystal Dream 2 is by [Triton](https://en.wikipedia.org/wiki/Triton_(demogroup));
all were released as freeware. The original release files are served
unmodified, as the demos read them at run time.

The site's text font is IBM VGA 8x16 by VileR, int10h.org (CC BY-SA 4.0).
