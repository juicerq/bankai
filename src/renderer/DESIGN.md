---
version: alpha
name: Bankai
description: A matte instrument panel for a terminal workspace. Sharp corners, one amber accent, monospace throughout.
colors:
  primary: "#e7e7e4"
  secondary: "#858581"
  tertiary: "#c9954a"
  surface-sunken: "#080808"
  surface: "#0b0b0b"
  surface-raised: "#111111"
  surface-hover: "#181818"
  surface-active: "#202020"
  outline: "#292929"
  outline-strong: "#444444"
  added: "#a6bca8"
  removed: "#c09a9a"
  terminal-black: "#232322"
  terminal-blue: "#6f86a8"
  terminal-magenta: "#ab85ad"
  terminal-cyan: "#8ab5b2"
  terminal-white: "#b9b9b4"
  terminal-bright-black: "#5c5c58"
  terminal-bright-red: "#d5b3b2"
  terminal-bright-green: "#bed2bf"
  terminal-bright-yellow: "#e0ae6d"
  terminal-bright-blue: "#93a8c6"
  terminal-bright-magenta: "#c4a3c6"
  terminal-bright-cyan: "#a8cecb"
  terminal-selection: "#33332f99"
typography:
  title:
    fontFamily: Maple Mono NF
    fontSize: 17px
    fontWeight: 500
    lineHeight: 1.4
  subtitle:
    fontFamily: Maple Mono NF
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.4
  terminal:
    fontFamily: Maple Mono NF
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.35
  body:
    fontFamily: Maple Mono NF
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.4
  support:
    fontFamily: Maple Mono NF
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.55
  code:
    fontFamily: Maple Mono NF
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: Maple Mono NF
    fontSize: 10px
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: 0.12em
  data:
    fontFamily: Maple Mono NF
    fontSize: 10px
    fontWeight: 400
    lineHeight: 1.4
rounded:
  none: 0px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
  2xl: 24px
  rail: 244px
  header: 40px
components:
  terminal:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.primary}"
    typography: "{typography.terminal}"
    cursor: "{colors.tertiary}"
  rail-item:
    backgroundColor: transparent
    textColor: "{colors.primary}"
    typography: "{typography.body}"
    padding: "{spacing.md}"
  rail-item-hover:
    backgroundColor: "{colors.surface-hover}"
  rail-item-active:
    backgroundColor: "{colors.surface-active}"
    marker: "{colors.tertiary}"
  tab:
    height: "{spacing.header}"
    textColor: "{colors.secondary}"
    typography: "{typography.body}"
  tab-hover:
    backgroundColor: "{colors.surface-hover}"
  tab-active:
    backgroundColor: "{colors.surface-active}"
    textColor: "{colors.primary}"
    marker: "{colors.tertiary}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    padding: "{spacing.md}"
  button-primary-disabled:
    backgroundColor: "{colors.surface-active}"
    textColor: "{colors.secondary}"
  button-icon:
    backgroundColor: transparent
    textColor: "{colors.secondary}"
    size: "{spacing.header}"
  button-icon-hover:
    textColor: "{colors.primary}"
  button-icon-active:
    textColor: "{colors.tertiary}"
  diff-line-add:
    textColor: "{colors.added}"
    typography: "{typography.code}"
  diff-line-remove:
    textColor: "{colors.removed}"
    typography: "{typography.code}"
---

# Bankai

## Overview

Bankai is a bench instrument for driving coding agents. Its world is the
brushed-metal chassis of an 80s hardware console read by amber phosphor: every
region is a panel bolted into a frame, every edge is a machined line, and the
only light in the enclosure is the amber that marks what is running right now.

The product is a window onto a terminal. That subordinates every decision — the
chrome exists to frame someone else's output, never to compete with it. The
interface is quiet by construction so that the shell, the diff, and the agent's
work are the only things with voice.

The signature is the amber: it never decorates, it only reports life. A session
that is running, a project that is mounted, a cursor waiting for a keystroke.
Everything the amber touches is a fact about the present moment.

## Colors

The palette is a near-black tonal ramp carrying warm paper ink, with a single
amber accent borrowed from amber-phosphor CRTs.

- **Primary (#e7e7e4):** Warm paper. Carries all reading text, and inverts into
  the surface of the one committing action per screen.
- **Secondary (#858581):** The utilitarian slate. Paths, timestamps, counters,
  captions — everything that answers a question the eye did not ask.
- **Tertiary (#c9954a):** Amber phosphor. The only chromatic accent in the
  product, reserved for live state.
- **Surfaces (#080808 → #202020):** Five deliberate steps. `surface-sunken` is
  the terminal, the deepest plane because it holds the real work. `surface` is
  the frame. `surface-raised` carries the rail, header, and review panel.
  `surface-hover` and `surface-active` are interaction states, never regions.
- **Outlines (#292929, #444444):** Machined edges. `outline` divides regions;
  `outline-strong` marks a control that accepts a click.
- **Added / Removed (#a6bca8, #c09a9a):** Desaturated green and red. These are
  not diff colors *resembling* the terminal's — they are the same two tokens the
  terminal renders for ANSI green and red.

### The terminal obeys the same system

The terminal is not an unstyled viewport embedded in a styled app. Its sixteen
ANSI colors are design tokens like any other, and three of them are shared
outright: ANSI green is `added`, ANSI red is `removed`, ANSI yellow is
`tertiary`. A `git diff` rendered by the shell and a diff rendered by the review
panel are the same colors by construction, not by coincidence.

The remaining hues are pulled down to the chroma of `added` and `removed` so
nothing in the enclosure is more saturated than anything else. Because six
near-neutral hues would be six indistinguishable grays, **lightness carries the
separation**: blue sits darkest, cyan above it, white above that. Hue is the
secondary channel, which keeps the output legible without relying on color
vision.

The terminal theme is not written twice. It reads these tokens from CSS at
session start — see `-utils/terminal-style.ts`. Hand-copied hex is how the app
and the terminal drifted into two different grays in the first place.

## Typography

One typeface: **Maple Mono NF**. Not a mono for code and a sans for chrome — a
monospace for everything, because in an instrument every character sits on a
grid whether it is output or label.

- **Title and subtitle** are the only levels above the reading size, and they
  appear once per region at most.
- **Body** carries names and reading text. **Support** carries prose that runs
  more than a line, at a looser line height.
- **Code** is the diff, at the loosest line height in the system, because dense
  code needs the vertical air the surrounding chrome does not.
- **Label** is the region marker — always uppercase, always letterspaced. It
  names a panel; it never carries content.
- **Data** is the machine's voice: paths, timestamps, counters, status.

Nothing renders below 10px. Weights are 400, 500, 600 and 700 — all four exist
as real cuts in Maple Mono NF, and `font-synthesis` is off, so any weight
outside this set silently renders as something else.

## Layout

The composition is a three-column chassis: a 244px rail, a fluid center, and a
review panel that slides in from the right at 380px by default. Vertically, there
is one 40px course running across the entire top edge — rail brand and shell tabs
sit in it — so the top of the application reads as a single machined line the
full width of the window.

The review panel's width is the one adjustable dimension. The 1px divider between
the terminal and the panel is a drag handle: pulling it trades width between the
two, clamped so the terminal never drops below a usable column. Nothing else in
the chassis reflows — this is a desktop window, not a responsive page.

Padding and gaps are strictly 4, 8, 12, 16, 20, 24 — Tailwind's `1`–`6`. The
default density is tight: 12px is the standard padding, and anything looser has
to earn it. This is a tool for people who keep it open all day; air spent on
chrome is air taken from output.

Structural dimensions are tokens — `rail` and `header`. Anything else that
occupies space stays on the same 4px grid. The sole exception is the 1–2px
hairline: rules and markers live below the grid because they draw an edge rather
than occupy space.

The terminal owns everything under the top course. No status bar, no footer, no
chrome below the output — the pane runs to the bottom edge of the window.

## Elevation & Depth

Nothing casts a shadow. Depth is conveyed two ways at once, and both are
required for a region to read as separate:

1. **A machined edge.** Every region boundary is a 1px `outline` rule. The
   border is what says where one panel ends and the next begins.
2. **A tonal step.** Regions sit on `surface-raised` above the `surface` frame;
   the terminal drops to `surface-sunken` below it. The content plane is the
   *lowest* plane in the enclosure, not the highest — the work sits recessed in
   the chassis.

Interaction states use tone alone (`surface-hover`, `surface-active`) and never
add or remove a border. A control that changes its own outline on hover reads as
a panel coming loose.

## Shapes

Every corner in the product is square. `border-radius: 0` is not a default here,
it is the shape language: a chassis is milled, not molded. The single exception
is the status dot, which is a circle because it is an indicator lamp, not a
container.

Radius utilities are removed from the theme entirely, so a rounded corner is not
something a contributor can reach for by accident.

## Components

**Rail item.** A project. Square glyph, name, path. Separated from its neighbor
by a top rule, not a gap. The active project carries a 2px amber marker on its
left edge and lifts to `surface-active` — the marker says mounted, the tone says
selected.

**Shell tab.** Fills the top course, divided from its neighbor by a vertical
rule. Tabs are part of the chassis, not chips resting on it. The active tab lifts
to `surface-active` and carries a 2px amber rule along its bottom edge, breaking
the course's baseline exactly where the session lives. A status dot precedes the
label: amber when the session is live, `outline-strong` when idle.

**Icon button.** A square the full height of the top course, transparent,
`secondary` ink, brightening to `primary` on hover, divided from its neighbor by
a rule on its leading edge. When it toggles a region open, the active state is
amber — it is reporting a live panel, not a pressed key. Icon glyphs are 16px.
Icon-only controls always carry an `aria-label`.

**Primary action.** The one inverted surface in the product: paper ground, frame
ink. There is at most one per region, and its inversion is the accent that
amber is deliberately not spending. Disabled, it collapses to `surface-active`
with `secondary` ink.

**Diff line.** Number gutter in `outline-strong`, code in `added` or `removed`,
context in `primary`. No background fill — the ink carries the meaning, matching
how the terminal renders the same diff a few hundred pixels to the left.

**Empty state.** Centered, one mark in `secondary`, a title, a line of support
prose, and a single primary action. It occupies the plane it replaces rather
than floating in a card.

## Do's and Don'ts

- Do reserve amber for live state — a running session, a mounted project, the
  cursor. If it isn't a fact about right now, it isn't amber.
- Don't introduce a second chromatic accent. Green and red already mean added
  and removed, in the panel and in the terminal alike.
- Do keep every corner square. There is no radius token to reach for except
  `full`, and that belongs to status dots.
- Don't write an arbitrary value — `p-[13px]`, `bg-[#0e0e0e]`, `text-[9px]`. A
  bracket in a class name means the design system was missing something; fix the
  token instead.
- Do let borders and tone separate regions together. Neither alone is enough.
- Don't add a shadow, a blur, or a gradient. The enclosure is matte.
- Do keep type at 10px and above, in weights 400/500/600/700 only.
- Don't set a font family in a component. There is one typeface.
- Do read terminal colors from the tokens. A hex literal in the terminal theme
  is a second source of truth waiting to drift.
- Don't spend vertical space on chrome. 12px is the default padding; looser
  needs a reason.
