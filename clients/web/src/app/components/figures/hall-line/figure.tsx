import { paint, projectionOf } from "@/lib/iso/scene";
import { HEIGHT, SCENE, STOPS, WIDTH, calloutPath, type Stop } from "./geometry";
import { HallLineLive } from "./live";
import styles from "./line.module.css";

const tenth = (value: number) => value.toFixed(1);

/**
 * One station's callouts, at that station's camera: a ringed dot on the
 * part, a rule that rises at the drawing's 30 degrees and runs along the
 * bottom of a cut-corner plate holding the number and label. The rule has
 * a unit path length so the stylesheet can draw it out from the part when
 * the camera arrives.
 */
function calloutsSvg(stop: Stop, index: number) {
  const P = projectionOf(stop.station);
  const notes = stop.callouts.map((callout, order) => {
    const { dot, elbow, end, plate, number, label, anchor } = calloutPath(callout, P);
    const at = ([x, y]: [number, number]) => `${tenth(x)} ${tenth(y)}`;
    return `<g class="${styles.callout}" data-order="${order}">`
      + `<path class="${styles.calloutPlate}" d="M${plate.map(at).join("L")}Z"/>`
      + `<circle class="${styles.calloutRing}" cx="${tenth(dot[0])}" cy="${tenth(dot[1])}" r="5.5"/>`
      + `<circle class="${styles.calloutDot}" cx="${tenth(dot[0])}" cy="${tenth(dot[1])}" r="2"/>`
      + `<path class="${styles.calloutRule}" pathLength="1" d="M${at(dot)}L${at(elbow)}L${at(end)}"/>`
      + `<text class="${styles.calloutNumber}" x="${tenth(number[0])}" y="${tenth(number[1])}" text-anchor="${anchor}">0${index + 1}</text>`
      + `<text class="${styles.calloutText}" x="${tenth(label[0])}" y="${tenth(label[1])}" text-anchor="${anchor}">${callout.text}</text>`
      + `</g>`;
  }).join("");
  return `<g data-stop="${index}"${index ? " data-hidden=\"\"" : ""}>${notes}</g>`;
}

const DESCRIPTION = "The Hall as an assay line on one bench. Each constituent's canister feeds a meter that takes the Formula's amount, a channel carries it through its issuer's gate to the press, the press strikes the share, and on a Melt the rack files a Claim per leg while the wallet tray takes back every leg its issuer lets through. One issuer has frozen its leg: the gate is down and padlocked, its Claim stays in the rack, and its lane in the tray is empty. The camera holds on the Formula, the issuer gates, the Strike and the Melt in turn.";

/** The landing hero: the Hall as an assay line, seen from four camera stations in turn. */
export function HallLine() {
  const machine = paint(SCENE, projectionOf(STOPS[0]!.station));
  const callouts = STOPS.map(calloutsSvg).join("");
  const notes = STOPS.map((stop, index) =>
    `<ol class="${styles.notes}" data-stop="${index}"${index ? " data-hidden=\"\"" : ""}>${stop.callouts.map((callout) => `<li><small>0${index + 1}</small>${callout.text}</li>`).join("")}</ol>`,
  ).join("");
  return (
    <figure className={styles.line} aria-label="The Hall's assay line">
      <HallLineLive
        width={WIDTH}
        height={HEIGHT}
        machine={machine}
        callouts={callouts}
        notes={notes}
        title="The Hall's assay line"
        description={DESCRIPTION}
      />
    </figure>
  );
}
