export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  template: string;
  /** Inline images referenced from the HTML as cid:<cid> (the logo). */
  attachments?: { filename: string; content: Buffer; cid: string; contentType: string }[];
  idempotencyKey?: string;
}
export interface MailTransport {
  send(message: MailMessage): Promise<{ id?: string }>;
}
export class MailDeliveryError extends Error {
  constructor(
    public readonly temporary: boolean,
    public readonly code: string,
  ) {
    super("No se pudo entregar el correo: " + code);
    this.name = "MailDeliveryError";
  }
}
