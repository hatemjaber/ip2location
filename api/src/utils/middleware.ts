import { Context, Next } from "hono";
import { handlers } from "./exceptions.js";
import { env } from "./env.js";

export const extractAPIKeyAndSecret = async (c: Context, next: Next) => {
    const apiKey = c.req.header('X-API-Key') || undefined;
    const apiSecret = c.req.header('X-API-Secret') || undefined;
    c.req.apiKey = apiKey;
    c.req.apiSecret = apiSecret;
    await next();
};

export const validateAPICredentials = async (c: Context, next: Next) => {
    if (!c.req.apiKey) {
        throw new handlers.APIKeyNotFound(c);
    }
    if (!c.req.apiSecret) {
        throw new handlers.APISecretNotFound(c);
    }
    if (c.req.apiKey !== env.API_KEY) {
        throw new handlers.APIKeyInvalid(c);
    }
    if (c.req.apiSecret !== env.API_SECRET) {
        throw new handlers.APISecretInvalid(c);
    }
    await next();
};