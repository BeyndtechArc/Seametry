"use client";

import { useEffect, useRef } from "react";
import { blend, paint, painter, projectionOf, type Poses } from "@/lib/iso/scene";
import { MOVE, SCENE, STILL, STOPS, movingPoses } from "./geometry";
import styles from "./line.module.css";

/** Eased in and out, so the camera leaves a station and lands on the next softly. */
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Plays the Hall's story one station at a time: the camera holds while
 * that station's part plays and its callouts appear as their events
 * happen, then turns and reframes to the next. The machine is redrawn only
 * when the camera or a part has moved. Offscreen the story waits where it
 * is; under reduced motion it is one still picture of the Melt delivered
 * around the frozen leg.
 */
export function HallLineLive({ width, height, machine, callouts, notes: list, title, description }: {
  width: number;
  height: number;
  machine: string;
  callouts: string;
  /** The same callouts as text, read below the drawing on a phone. */
  notes: string;
  title: string;
  description: string;
}) {
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = stage.current;
    const root = node?.querySelector<SVGGElement>("[data-machine]");
    const incoming = node?.querySelector<SVGGElement>("[data-incoming]");
    if (!node || !root || !incoming) return;
    const marked = [...node.querySelectorAll<Element>("[data-callout]")].map((element) => {
      const [stop, order] = (element.getAttribute("data-callout") ?? "").split("-").map(Number);
      return { element, stop: stop!, from: STOPS[stop!]?.callouts[order!]?.from ?? 0 };
    });
    const showCallouts = (stop: number, t: number | null) => {
      for (const { element, stop: at, from } of marked) element.toggleAttribute("data-hidden", t === null || at !== stop || t < from);
    };
    const draw = painter(root, SCENE);

    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      draw(projectionOf(STOPS[STILL.stop]!.station), STILL.poses);
      node.setAttribute("data-station", STOPS[STILL.stop]!.name);
      showCallouts(STILL.stop, Infinity);
      return;
    }

    let stop = 0;
    let moving = false;
    let started = performance.now();
    let last = started;
    let visible = false;
    let alive = true;
    let frame = 0;
    let drawn = "";
    // A turn redraws every part every frame. Where that costs more than
    // about two frames at 60 fps (a phone at 4x CPU measured 117 ms on 23
    // October 2026), the camera crossfades between stations instead. It is
    // judged on the middle of a real move's first frames, skipping the very
    // first: at load, or on a move's first frame, the code is still cold and
    // a fast machine measures slow.
    let costs: number[] = [];
    let crossfade = false;
    let fading = false;

    const fadeTo = (next: number) => {
      incoming.innerHTML = paint(SCENE, projectionOf(STOPS[next]!.station), movingPoses(stop, MOVE));
      node.setAttribute("data-fading", "");
      fading = true;
    };

    const render = (camera: Parameters<typeof projectionOf>[0], poses: Poses) => {
      const key = JSON.stringify([camera, poses]);
      if (key === drawn) return;
      const began = performance.now();
      draw(projectionOf(camera), poses);
      drawn = key;
      if (moving) costs.push(performance.now() - began);
    };

    const tick = (now: number) => {
      if (!alive) return;
      frame = requestAnimationFrame(tick);
      // Set on the frame a crossfade's layers were swapped; a frame later the transitions may run again.
      node.removeAttribute("data-swapping");
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
        if (crossfade) fadeTo(next);
      }
      if (moving && t >= MOVE) {
        if (fading) {
          // Both layers now show the same picture; swapping them with their
          // transitions running would dim it for a moment.
          node.setAttribute("data-swapping", "");
          node.removeAttribute("data-fading");
          incoming.innerHTML = "";
          fading = false;
        }
        moving = false;
        costs = [];
        stop = next;
        started = now;
        t = 0;
        node.setAttribute("data-station", STOPS[stop]!.name);
      }
      if (moving && fading) return;
      if (moving) {
        render(blend(here.station, STOPS[next]!.station, ease(t / MOVE)), movingPoses(stop, t));
        // A few frames are enough to tell; the rest of this move, and every
        // move after it, fades instead of stuttering through the turn.
        const settled = costs.slice(1, 5).sort((a, b) => a - b);
        if (settled.length === 4 && (settled[1]! + settled[2]!) / 2 > 30) {
          crossfade = true;
          fadeTo(next);
        }
      } else render(STOPS[stop]!.station, STOPS[stop]!.poses(t));
      if (!moving) showCallouts(stop, t);
    };

    const observer = new IntersectionObserver(([entry]) => { visible = entry?.isIntersecting ?? false; });
    observer.observe(node);
    frame = requestAnimationFrame(tick);
    return () => {
      alive = false;
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      className={styles.stage}
      ref={stage}
      data-station={STOPS[0]!.name}
      dangerouslySetInnerHTML={{
        __html: `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="line-title line-desc" xmlns="http://www.w3.org/2000/svg"><title id="line-title">${title}</title><desc id="line-desc">${description}</desc><g data-machine="">${machine}</g><g data-incoming=""></g>${callouts}</svg>${list}`,
      }}
    />
  );
}
