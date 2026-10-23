import { paint, projectionOf } from "@/lib/iso/scene";
import { HEIGHT, SCENE, STOPS, WIDTH, calloutPath, type Stop } from "./geometry";
import { HallLineLive } from "./live";
import styles from "./line.module.css";

const tenth = (value: number) => value.toFixed(1);
const hidden = (stop: number) => (stop ? " data-hidden=\"\"" : "");

/**
 * One station's callouts, at that station's camera: a ringed dot on the
 * part, a rule that rises at the drawing's 30 degrees and runs along the
 * bottom of a cut-corner plate holding the number and label. The rule has
 * a unit path length so the stylesheet can draw it out from the part when
 * the event it names happens. Each is marked `stop-order` so the client
 * can show it at its moment; without script the first station's show.
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

/** The landing hero: the Hall as an assay line, its story told from four camera stations in turn. */
export function HallLine() {
  const machine = paint(SCENE, projectionOf(STOPS[0]!.station), STOPS[0]!.poses(0));
  const callouts = STOPS.map(calloutsSvg).join("");
  const notes = `<ol class="${styles.notes}">${STOPS.flatMap((stop, index) =>
    stop.callouts.map((callout, order) => `<li data-callout="${index}-${order}"${hidden(index)}><small>0${index + 1}</small>${callout.text}</li>`),
  ).join("")}</ol>`;
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
