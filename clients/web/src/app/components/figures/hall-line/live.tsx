"use client";

import { useEffect, useRef } from "react";
import { blend, canvasPainter, paint, painter, projectionOf, type Palette, type Poses } from "@/lib/iso/scene";
import { HEIGHT, MOVE, SCENE, STILL, STOPS, WIDTH, calloutPath, movingPoses, type Stop } from "./geometry";
import styles from "./line.module.css";

/** Eased in and out, so the camera leaves a station and lands on the next softly. */
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

const tenth = (value: number) => value.toFixed(1);
const hidden = (stop: number) => (stop ? " data-hidden=\"\"" : "");

/**
 * One station's callouts, at that station's camera: a ringed dot on the
 * part, a rule that rises at the drawing's 30 degrees and runs level to a
 * cut-corner plate docked at the figure's side, holding the number and
 * label. The rule has a unit path length so the stylesheet can draw it out
 * from the part when the event it names happens. Each is marked
 * `stop-order` so the client can show it at its moment; without script the
 * first station's show.
 */
function calloutsSvg(stop: Stop, index: number) {
  const P = projectionOf(stop.station);
  return stop.callouts.map((callout, order) => {
    const { dot, elbow, end, plate, number, label, anchor } = calloutPath(callout, P);
    const at = ([x, y]: [number, number]) => `${tenth(x)} ${tenth(y)}`;
    return `<g class="${styles.callout}" data-callout="${index}-${order}"${hidden(index)}>`
      + `<path class="${styles.calloutPlate}" d="M${plate.map(at).join("L")}Z"/>`
      + `<circle class="${styles.calloutRing}" cx="${tenth(dot[0])}" cy="${tenth(dot[1])}" r="5.5"/>`
      + `<circle class="${styles.calloutDot}" cx="${tenth(dot[0])}" cy="${tenth(dot[1])}" r="2"/>`
      + `<path class="${styles.calloutRule}" pathLength="1" d="M${at(dot)}L${at(elbow)}L${at(end)}"/>`
      + `<text class="${styles.calloutNumber}" x="${tenth(number[0])}" y="${tenth(number[1])}" text-anchor="${anchor}">0${index + 1}</text>`
      + `<text class="${styles.calloutText}" x="${tenth(label[0])}" y="${tenth(label[1])}" text-anchor="${anchor}">${callout.text}</text>`
      + `</g>`;
  }).join("");
}

const DESCRIPTION = "The Hall as an assay line on one bench: the Hall's vault of one canister per constituent, a meter for each that takes the Formula's amount, each constituent's channel through its issuer's gate to the press, the Claims rack and the holder's wallet tray. A Strike takes one of each constituent from the wallet through the gates into the vault and strikes a share. An issuer freezes its leg, lowering and padlocking its gate. A Melt returns the share and records a Claim on every leg; every leg its issuer lets through is delivered to the wallet, and the frozen leg stays a Claim until the freeze lifts and it is delivered. The camera holds on the Formula, the Strike, the issuer gates and the Melt in turn.";

/**
 * The first frame, built once per runtime rather than per request, and
 * here rather than passed in from the server: a string prop is sent twice,
 * in the HTML and again in the payload React hydrates from. As a prop it
 * made the landing 575,527 bytes and 58 ms to render on the server, against
 * about 15 ms for the docs (production build, 23 October 2026).
 */
const STAGE = `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="line-title line-desc" xmlns="http://www.w3.org/2000/svg"><title id="line-title">The Hall's assay line</title><desc id="line-desc">${DESCRIPTION}</desc><g data-machine="">${paint(SCENE, projectionOf(STOPS[0]!.station), STOPS[0]!.poses(0))}</g>${STOPS.map(calloutsSvg).join("")}</svg>`
  + `<ol class="${styles.notes}">${STOPS.flatMap((stop, index) => stop.callouts.map((callout, order) => `<li data-callout="${index}-${order}"${hidden(index)}><small>0${index + 1}</small>${callout.text}</li>`)).join("")}</ol>`;

/**
 * Plays the Hall's story one station at a time: the camera holds while
 * that station's part plays and its callouts appear as their events
 * happen, then turns and reframes to the next. The machine is redrawn only
 * when the camera or a part has moved. Offscreen the story waits where it
 * is; under reduced motion it is one still picture of the Melt delivered
 * around the frozen leg.
 */
export function HallLineLive() {
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = stage.current;
    const root = node?.querySelector<SVGGElement>("[data-machine]");
    if (!node || !root) return;
    const marked = [...node.querySelectorAll<Element>("[data-callout]")].map((element) => {
      const [stop, order] = (element.getAttribute("data-callout") ?? "").split("-").map(Number);
      return { element, stop: stop!, from: STOPS[stop!]?.callouts[order!]?.from ?? 0 };
    });
    const showCallouts = (stop: number, t: number | null) => {
      for (const { element, stop: at, from } of marked) element.toggleAttribute("data-hidden", t === null || at !== stop || t < from);
    };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      painter(root, SCENE)(projectionOf(STOPS[STILL.stop]!.station), STILL.poses);
      node.setAttribute("data-station", STOPS[STILL.stop]!.name);
      showCallouts(STILL.stop, Infinity);
      return;
    }

    // The moving machine is drawn on a canvas under the SVG, which keeps
    // the callouts and the title and description; the server's SVG drawing
    // stays until the canvas has drawn its first frame.
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    node.prepend(canvas);
    // The canvas is 1.5 figures wide (line.module.css), so it spans 1.5 times the viewBox's units.
    const paintCanvas = canvasPainter(canvas, SCENE, WIDTH * 1.5);
    // A custom property's computed value has its var() references resolved,
    // so the stage reads each token as the theme now sets it.
    const resolve = (token: string) => getComputedStyle(node).getPropertyValue(token).trim();
    const paletteOf = (): Palette => ({
      paper: resolve("--line-paper"),
      top: resolve("--line-top"),
      shades: [resolve("--line-shade-0"), resolve("--line-shade-1"), resolve("--line-shade-2"), resolve("--line-shade-3")],
      hi: resolve("--line-hi"),
      mid: resolve("--line-mid"),
      lo: resolve("--line-lo"),
      faint: resolve("--line-faint"),
      lit: resolve("--line-lit"),
      litShade: resolve("--line-lit-shade"),
      litEdge: resolve("--sm-text-onTouch"),
      frozen: resolve("--line-frozen"),
      frozenInk: resolve("--line-frozen-ink"),
    });
    let palette = paletteOf();

    let stop = 0;
    let moving = false;
    let started = performance.now();
    let last = started;
    let visible = false;
    let alive = true;
    let frame = 0;
    let drawn = "";
    // A device that cannot draw a frame in 16.7 ms draws every second or
    // third frame instead, the anatomy kit's half-rate lever: the motion is
    // timed, so the camera still travels the same path at the same speed,
    // in fewer steps. A crossfade between stations was tried first and
    // removed, since a turn that fades reads as the drawing being replaced
    // (Storm, 23 October 2026).
    let cost = 0;
    let skip = 0;

    const render = (camera: Parameters<typeof projectionOf>[0], poses: Poses) => {
      const key = JSON.stringify([camera, poses]);
      if (key === drawn) return;
      const began = performance.now();
      paintCanvas(projectionOf(camera), poses, palette);
      if (!drawn) root.setAttribute("data-hidden", "");
      drawn = key;
      const spent = performance.now() - began;
      cost = cost ? cost * 0.8 + spent * 0.2 : spent;
    };

    // A theme change or a resize needs the frame drawn again as it stands.
    const redraw = () => { drawn = drawn && " "; };
    const themes = new MutationObserver(() => { palette = paletteOf(); redraw(); });
    themes.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    const resized = new ResizeObserver(redraw);
    resized.observe(canvas);

    const tick = (now: number) => {
      if (!alive) return;
      frame = requestAnimationFrame(tick);
      if (skip > 0) {
        skip--;
        return;
      }
      // Time stands still offscreen, so the story resumes where it was left.
      if (!visible) {
        started += now - last;
        last = now;
        return;
      }
      last = now;
      let t = (now - started) / 1000;
      const here = STOPS[stop]!;
      const next = (stop + 1) % STOPS.length;
      if (!moving && t >= here.hold) {
        moving = true;
        started = now;
        t = 0;
        showCallouts(stop, null);
      }
      if (moving && t >= MOVE) {
        moving = false;
        stop = next;
        started = now;
        t = 0;
        node.setAttribute("data-station", STOPS[stop]!.name);
      }
      if (moving) render(blend(here.station, STOPS[next]!.station, ease(t / MOVE)), movingPoses(stop, t));
      else render(STOPS[stop]!.station, STOPS[stop]!.poses(t));
      if (!moving) showCallouts(stop, t);
      // Frames the last drawing overran are given back before the next one.
      skip = Math.min(3, Math.floor(cost / 16.7));
    };

    const observer = new IntersectionObserver(([entry]) => { visible = entry?.isIntersecting ?? false; });
    observer.observe(node);
    frame = requestAnimationFrame(tick);
    return () => {
      alive = false;
      observer.disconnect();
      themes.disconnect();
      resized.disconnect();
      cancelAnimationFrame(frame);
      canvas.remove();
      root.removeAttribute("data-hidden");
    };
  }, []);

  return (
    <div
      className={styles.stage}
      ref={stage}
      data-station={STOPS[0]!.name}
      dangerouslySetInnerHTML={{ __html: STAGE }}
    />
  );
}
