"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import styles from "./hallmark-relay.module.css";

export function HallmarkRelay() {
  const relay = useRef<SVGCircleElement>(null);

  useEffect(() => {
    if (!relay.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const motion = gsap.fromTo(relay.current, { x: 0, opacity: 0 }, {
      x: 248,
      opacity: 1,
      duration: 6,
      ease: "none",
      repeat: -1,
      repeatDelay: 1.4,
    });
    return () => {
      motion.kill();
    };
  }, []);

  return (
    <svg className={styles.field} aria-hidden="true" viewBox="0 0 320 112" preserveAspectRatio="xMidYMid meet">
      <path className={styles.rule} d="M36 56H284" />
      <path className={styles.trace} d="M36 56H284" />
      <circle ref={relay} className={styles.relay} cx="36" cy="56" r="3" />
      <path className={styles.punch} d="m36 31 18 10v30L36 81 18 71V41Z" />
      <circle className={styles.punch} cx="119" cy="56" r="20" />
      <path className={styles.punch} d="M182 36h30l12 12v28h-42Z" />
      <path className={styles.punch} d="M266 36h36v40h-36Z" />
      <path className={styles.registration} d="M12 20v-8h8M300 12h8v8M20 92h-8v8M308 92v8h-8" />
    </svg>
  );
}
