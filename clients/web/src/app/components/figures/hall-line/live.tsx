"use client";

import { useEffect, useRef } from "react";
import { blend, paint, projectionOf } from "@/lib/iso/scene";
import { HOLD_MS, MOVE_MS, SCENE, STOPS } from "./geometry";
import styles from "./line.module.css";

/** Eased in and out, so the camera leaves a station and lands on the next softly. */
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Holds each station, then turns and reframes the machine to the next,
 * one composition at a time. The machine is redrawn only while the camera
 * moves; a held station is the picture the server drew for it. Offscreen
 * the tour waits where it is, and under reduced motion it never leaves the
 * first station.
 */
export function HallLineLive({ width, height, machine, callouts, notes: list, title, description }: {
  width: number;
  height: number;
  machine: string;
  callouts: string;
  /** The same callouts as text, one list per station, read below the drawing on a phone. */
  notes: string;
  title: string;
  description: string;
}) {
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = stage.current;
    const body = node?.querySelector<SVGGElement>("[data-machine]");
    const incoming = node?.querySelector<SVGGElement>("[data-incoming]");
    const notes = node ? [...node.querySelectorAll<SVGGElement>("[data-stop]")] : [];
    if (!node || !body || !incoming || !notes.length) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let stop = 0;
    let visible = false;
    let alive = true;
    let timer = 0;
    let frame = 0;
    let moveStarted = 0;
    // A turn redraws the whole machine every frame. Where one frame costs
    // more than about two at 60 fps (a phone measured 117 ms at 4x CPU on 23
    // October 2026), the rest of the visit crossfades from one station's
    // picture to the next instead: one drawing per move, not sixty.
    let frameCost = 0;
    const probe = performance.now();
    paint(SCENE, projectionOf(STOPS[1]!.station), { marks: false });
    // The drawing alone, before the browser parses it; a desktop measured
    // about 11 ms, so 25 ms marks a device that cannot also parse in time.
    let crossfade = performance.now() - probe > 25;

    const show = (index: number) => notes.forEach((group) => group.toggleAttribute("data-hidden", group.getAttribute("data-stop") !== String(index)));

    const land = (next: number) => {
      stop = next;
      moveStarted = 0;
      node.setAttribute("data-station", STOPS[stop]!.name);
      show(stop);
      hold();
    };

    const turn = (now: number) => {
      if (!alive) return;
      moveStarted ||= now;
      const t = Math.min(1, (now - moveStarted) / MOVE_MS);
      const next = (stop + 1) % STOPS.length;
      const began = performance.now();
      body.innerHTML = paint(SCENE, projectionOf(blend(STOPS[stop]!.station, STOPS[next]!.station, ease(t))), { marks: t >= 1 });
      frameCost = frameCost ? frameCost * 0.7 + (performance.now() - began) * 0.3 : performance.now() - began;
      if (t >= 1) {
        crossfade ||= frameCost > 30;
        land(next);
        return;
      }
      frame = requestAnimationFrame(turn);
    };

    const fade = () => {
      const next = (stop + 1) % STOPS.length;
      incoming.innerHTML = paint(SCENE, projectionOf(STOPS[next]!.station));
      node.setAttribute("data-fading", "");
      timer = window.setTimeout(() => {
        if (!alive) return;
        // Both layers now hold the same picture; swapping them with their
        // transitions running would dim it for a moment.
        node.setAttribute("data-swapping", "");
        body.innerHTML = incoming.innerHTML;
        node.removeAttribute("data-fading");
        incoming.innerHTML = "";
        node.getBoundingClientRect();
        node.removeAttribute("data-swapping");
        land(next);
      }, MOVE_MS);
    };

    const hold = () => {
      timer = window.setTimeout(() => {
        if (!visible) {
          hold();
          return;
        }
        show(-1);
        if (crossfade) fade();
        else frame = requestAnimationFrame(turn);
      }, HOLD_MS);
    };

    const observer = new IntersectionObserver(([entry]) => { visible = entry?.isIntersecting ?? false; });
    observer.observe(node);
    hold();
    return () => {
      alive = false;
      observer.disconnect();
      window.clearTimeout(timer);
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
