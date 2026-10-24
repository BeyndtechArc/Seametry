import type { Photo } from "@/lib/photos";
import styles from "./landing.module.css";

/** components.md, Photo frame: a stock photograph in the house duotone, captioned as illustrative and credited. */
export function PhotoFrame({ photo, caption, className }: { photo: Photo; caption: string; className?: string }) {
  return (
    <figure className={className ? `${styles.photo} ${className}` : styles.photo}>
      <span className={styles.photoGround}>
        {/* eslint-disable-next-line @next/next/no-img-element -- next/image writes an inline style attribute, which this site's CSP refuses, and its transformations count against the hosting plan; the file is already sized. */}
        <img src={photo.src} width={photo.width} height={photo.height} alt={photo.alt} loading="lazy" decoding="async" />
      </span>
      <figcaption>
        <span>{caption}</span>
        <a href={photo.source} rel="noreferrer">Photo: {photo.photographer}, Unsplash</a>
      </figcaption>
    </figure>
  );
}
