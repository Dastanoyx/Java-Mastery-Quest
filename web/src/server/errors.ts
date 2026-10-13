// Typed errors mapped to HTTP status codes by the API layer (src/server/http.ts).
export class NotFound extends Error { status = 404; }
export class BadRequest extends Error { status = 400; }
export class Conflict extends Error { status = 409; }
export class Unavailable extends Error { status = 503; }
