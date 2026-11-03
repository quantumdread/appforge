/** Errors shared by the local evidence and bounded-edit boundaries. */
export class VerificationEditError extends Error {
  constructor(code, message, report) {
    super(message);
    this.name = 'VerificationEditError';
    this.code = code;
    if (report !== undefined) this.report = report;
  }
}
