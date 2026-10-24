/** A request this server will not complete, with the status and the reason a visitor reads. */
export class Refusal extends Error {
  constructor(
    readonly status: number,
    message: string,
    /**
     * notSent: the request certainly reached nothing on chain, so a client may
     * end the leg at once. technical: the raw text behind the plain reason.
     * unknownLeg: the request names no leg this server approved, so there is
     * no recorded leg to report it against.
     */
    readonly detail: { notSent?: boolean; technical?: string; unknownLeg?: boolean } = {},
  ) {
    super(message);
  }
}
