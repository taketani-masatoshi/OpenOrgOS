export class CorrespondenceApprovalGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CorrespondenceApprovalGateError";
  }
}
