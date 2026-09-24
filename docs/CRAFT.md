> **Living document. Owns:** library choices, signature interaction moments, animation and performance budgets.
> **Does not own:** product scope or engineering rules. Its Explorer and mobile guidance holds; Terminal craft guidance is not yet written.

# Seametry: Craft Map

Libraries, techniques and signature moments. Revision 4.

---

## 1. The rule

Award-winning sites win on one idea executed without compromise, not on the number of effects. For a product whose promise is honesty about numbers, every effect must either carry information or stay out of the way. Decoration that competes with data is a defect.

So each surface gets **one signature moment**, and everything else is quiet, fast and precise.

| Surface | Signature moment |
|---|---|
| Mobile | The Touchstone streak |
| Explorer | Verification you watch your own browser perform |
| Both | The Strike |

---

## 2. Libraries, judged

### Adopt

**GSAP, web only.** Now 100% free including every former Club plugin (SplitText, MorphSVG, Flip, and the rest), licensed for commercial use. Use it for the Explorer's timelines: the Strike, the serial typing on with SplitText, and Flip for the Melt, where an alloy's rows separate into constituents with a frozen leg holding still. GreenSock publishes official agent skills; install them so agents write idiomatic GSAP instead of guessing: `npx skills add https://github.com/greensock/gsap-skills`.

**React Native Skia, mobile.** The workhorse. Runtime shaders for the touchstone grain, the punch deboss, the streak, and the charts, all native. Already in the stack; this map just gives it its best job.

**Reanimated and Gesture Handler, mobile.** Springs, the Melt, gesture-driven shaders. Already in the stack.

**expo-haptics.** The heavy impacts of the Strike. Haptics are half of what makes a mobile interaction feel expensive.

### Adopt, narrowly

**ThreeUI, Explorer landing only.** Meng To's open-source library of procedural three.js components, MIT licensed, installable as `@designcodeio/threeui`. Its workflow suits yours exactly: copy a component's source or prompt, hand it to an agent, re-theme it.

Two cautions. Components run 100 to 200 KB each, and some render full HTML documents whose runtime files must be copied into your public directory. So: at most one, lazy-loaded after first paint, paused off-screen, replaced by a still frame under reduced motion.

Which ones fit the world:
- **Halftone Flow.** Halftone is how engraving and certificates are printed. Re-themed in ink on touchstone, it becomes the stone's surface. Best fit.
- **Liquid Form Background** or **Fluid Field Background.** Molten metal, for the Hall's page. Use only if it reads as metal, not as generic blobs.
- **Particle Wordmark.** The Seametry wordmark assembling itself. Tempting, but it competes with the Strike. Choose one.

Which ones don't: Constellation Field (the star metaphor was retired), Glassmorphism CTA (conflicts with the tray button and the no-shadow rule), anything neon.

### Evaluate later

**Rive, mobile.** The strongest tool for state-machine micro-interactions, with an active React Native runtime. But open issues in 2026 include a native crash when binding view models whose state machines contain value-change actions, and Android scroll jank on certain native runtime versions. Not for a deadline. Revisit for the Strike after launch.

### Decline

**Smooth-scroll hijacking** (Lenis and similar). Common on award sites, wrong for an evidence explorer. A precision instrument does not add momentum to your hand.

**Two animation libraries on one surface.** GSAP for signature timelines on web, CSS transitions for everything else. Not GSAP plus Motion plus a third.

**Generic 3D hero blobs.** The default of this era. A real incident timeline is more arresting than any procedural sphere.

---

## 3. The signature moments

### The Touchstone streak, mobile

A real assayer draws metal across a black stone and reads the streak. On a constituent page, the user drags a finger across the stone. A streak renders along the path, a Skia runtime shader with noise-edged strokes, and as it extends it reveals the constituent's evidence in bands: grade, then prerogatives, then the state of each source. Lift the finger and the streak stays, a record of what you just read.

It is literal to the world, carries real information, and takes one gesture. It replaces the earlier Sightline and keeps what was good about it: reading evidence by touch.

Constraints: 60fps on a mid-range Android device; bands drawn from server data only; the full evidence remains available as plain rows for anyone who never drags.

### Verification as ritual, Explorer

A visitor pastes a serial. Then they watch their own machine do the work, in sequence:

1. The public body's digest computes, via the browser's own Web Crypto, characters resolving from noise.
2. The Merkle path climbs, one level lighting at a time, each interior hash visibly computed from its children.
3. The path lands on the sealed root, then on the on-chain memo transaction, linked to the explorer.

The closing line: *Your browser just verified this. We didn't.*

This is the most honest possible version of the product's promise, and it is spectacle made entirely of real computation. GSAP timeline, SplitText for the hashes, no 3D required.

### The Strike, both surfaces

Four punches land in sequence and the serial types on after the last. Mobile adds a heavy haptic per punch. Web uses GSAP. Reduced motion collapses it to a single instant. The ceremony is named in the world document and its durations are tokens; it is listed here because it is the one moment both surfaces share.

### The landing is the incident

The Explorer's first screen is the UNHx replay itself: the scheduled corporate action, the issuer halt, the missing issuer quote, the oracle observations and the still-executable route, on one scrubbable timeline. Halftone Flow sits behind it as texture, never in front. The product's argument arrives before the visitor reads a word.

---

## 4. Budgets

- Explorer Largest Contentful Paint under 2.5 seconds on a mid-range Android phone over throttled 4G.
- Initial Explorer JavaScript kept lean; the ThreeUI component and GSAP plugins load after first paint.
- Every animation respects `prefers-reduced-motion`.
- Mobile holds 60fps during the streak and the Strike on a mid-range Android device, measured, not assumed.

---

## 5. Fonts on the web

Sentient and Switzer come from Fontshare. Self-host them on the Explorer rather than loading from a third-party CDN, both for speed and so a strict content security policy does not block them. Confirm the Fontshare licence covers web embedding and app bundling before shipping.
