import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { StatusCodes } from "http-status-codes";

const createClass = (className: string, properties: Record<string, any>) => {
    const { code, message, cause, errorCode } = properties;
    return class extends HTTPException {
        [key: string]: any;

        constructor (c: Context, options?: Record<string, any>) {
            super(code, { res: c.json({ message, cause, errorCode, ...options }, code), message, cause });
            // super(code, { res: new Response(errorCode, { status: code, statusText: message }), message, cause });
            this.errorCode = errorCode || "UNKNOWN_ERROR";
            this.options = options || {};
            this.name = className;
        }
    };
};

export const handlers = {
    APIKeyNotFound: {
        code: StatusCodes.UNAUTHORIZED,
        message: 'Unauthorized',
        cause: 'Unauthorized',
        errorCode: 'API_KEY_NOT_FOUND',
    },
    APISecretNotFound: {
        code: StatusCodes.UNAUTHORIZED,
        message: 'Unauthorized',
        cause: 'Unauthorized',
        errorCode: 'API_SECRET_NOT_FOUND',
    },
    APIKeyInvalid: {
        code: StatusCodes.UNAUTHORIZED,
        message: 'Unauthorized',
        cause: 'Unauthorized',
        errorCode: 'API_KEY_INVALID',
    },
    APISecretInvalid: {
        code: StatusCodes.UNAUTHORIZED,
        message: 'Unauthorized',
        cause: 'Unauthorized',
        errorCode: 'API_SECRET_INVALID',
    },
    PathNotFound: {
        code: StatusCodes.NOT_FOUND,
        message: 'Not Found',
        cause: 'Not Found',
        errorCode: 'PATH_NOT_FOUND',
    },
    ValidationError: {
        code: StatusCodes.UNPROCESSABLE_ENTITY,
        message: 'Validation error',
        cause: 'Validation error',
        errorCode: 'VALIDATION_ERROR',
    },
    InvalidIPAddress: {
        code: StatusCodes.BAD_REQUEST,
        message: 'Invalid IP address',
        cause: 'Invalid IP address format',
        errorCode: 'INVALID_IP_ADDRESS',
    },
    IPNotFound: {
        code: StatusCodes.NOT_FOUND,
        message: 'IP address not found',
        cause: 'No geolocation data available for this IP address',
        errorCode: 'IP_NOT_FOUND',
    },
} as Record<string, any>;

export const errorClasses = Object.keys(handlers);

Object.entries(handlers).forEach(([key, value]) => {
    const { code, message, cause, errorCode } = value;
    handlers[key] = createClass(key, { code, message, cause, errorCode });
});
