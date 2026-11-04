export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new HttpError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Not signed in.') => new HttpError(401, 'unauthorized', message);
export const forbidden = (message = 'Not allowed.') => new HttpError(403, 'forbidden', message);
export const notFound = (message = 'Not found.') => new HttpError(404, 'not_found', message);
export const conflict = (message) => new HttpError(409, 'conflict', message);
export const tooLarge = (message = 'File is too large.') => new HttpError(413, 'too_large', message);
export const tooMany = (message = 'Too many attempts. Try again later.') => new HttpError(429, 'rate_limited', message);
