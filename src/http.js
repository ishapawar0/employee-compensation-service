// An error whose message is safe to return to the client with the given status code.
class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function jsonResponse(status, body) {
    return { status, jsonBody: body };
}

// Wraps a handler so expected errors become 4xx responses and anything else becomes a generic 500.
function withErrorHandling(handler) {
    return async (request, context) => {
        try {
            return await handler(request, context);
        } catch (err) {
            if (err instanceof HttpError) {
                return jsonResponse(err.status, { error: err.message });
            }
            context.error(`Unhandled error in ${context.functionName}:`, err);
            return jsonResponse(500, { error: 'An unexpected error occurred.' });
        }
    };
}

// Parses a positive integer identifier from a route or query string value.
function parseId(value, name) {
    if (!/^\d+$/.test(value ?? '') || Number(value) < 1 || Number(value) > 2147483647) {
        throw new HttpError(400, `${name} must be a positive integer.`);
    }
    return Number(value);
}

module.exports = { HttpError, jsonResponse, withErrorHandling, parseId };
