export class ApiError extends Error {
  constructor(status, code, message, fieldErrors = undefined) {
    super(message); this.status = status; this.code = code; this.fieldErrors = fieldErrors;
  }
}
export function validate(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(422, 'validation', 'The subscription configuration is invalid.',
      Object.fromEntries(result.error.issues.map(issue=>[issue.path.join('.'),issue.message])));
  }
  return result.data;
}
