/** A request this server will not complete, with the status and the reason a visitor reads. */
export class Refusal extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
