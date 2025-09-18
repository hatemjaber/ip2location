import { Context } from "hono";
import { buildHonoServer } from "./lib/build-server.js";
import { env } from "./utils/env.js";
import { logger } from "./utils/logger.js";
import { StatusCodes } from "http-status-codes";
import { errorClasses, handlers } from "./utils/exceptions.js";
import { extractAPIKeyAndSecret, validateAPICredentials } from "./utils/middleware.js";
import { lookupIP, lookupIPs, getDatabase, type IPGeolocationResult } from "./lib/database.js";
import { HTTPException } from "hono/http-exception";

const server = buildHonoServer("development", env.PORT, env.HOST, logger);

server.onError((err: Error, c: Context) => {
    // Log the error with request context
    logger?.error({
        error: err.message,
        stack: err.stack,
        requestId: c.get('requestId'),
        url: c.req.url,
        method: c.req.method
    });

    console.log(errorClasses, err.name);
    // If it's already an HTTPException, let it handle itself
    if (err.name && errorClasses.includes(err.name) && err instanceof HTTPException) {
        return err.getResponse();
    }

    // For unknown errors, return a generic error
    return c.json({
        message: 'Internal Server Error',
        cause: 'An unexpected error occurred',
        errorCode: 'INTERNAL_ERROR'
    }, StatusCodes.INTERNAL_SERVER_ERROR);
});

server.notFound((c: Context) => {
    throw new handlers.PathNotFound(c, { url: c.req.url, path: c.req.path });
});

// define the base path
export const app = server.basePath("/api");

// Security headers and request logging
app.use('*', async (c, next) => {
    const start = Date.now();
    const requestId = c.get('requestId');

    // Security headers
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('X-XSS-Protection', '1; mode=block');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');

    await next();

    const duration = Date.now() - start;
    logger?.info({
        requestId,
        method: c.req.method,
        url: c.req.url,
        status: c.res.status,
        duration: `${ duration }ms`,
        userAgent: c.req.header('User-Agent')
    }, 'Request completed');
});

// app.use(httpLogger(customLogger));
app.use(extractAPIKeyAndSecret);

app.get('/docs', (c: Context) => {
    return c.json({
        name: 'IP Geolocation API',
        version: '1.0.0',
        description: 'High-performance IP geolocation API using IP2Location database',
        endpoints: {
            health: {
                method: 'GET',
                path: '/health',
                description: 'Health check endpoint',
                auth: false
            },
            singleIP: {
                method: 'GET',
                path: '/ip/{ip}',
                description: 'Lookup single IP address',
                auth: true,
                example: '/ip/8.8.8.8'
            },
            queryIP: {
                method: 'GET',
                path: '/lookup?ip={ip}',
                description: 'Lookup IP using query parameter',
                auth: true,
                example: '/lookup?ip=1.1.1.1'
            },
            batchIP: {
                method: 'POST',
                path: '/ip/batch',
                description: 'Lookup multiple IP addresses',
                auth: true,
                body: { ips: ['8.8.8.8', '1.1.1.1'] }
            }
        },
        authentication: {
            type: 'API Key + Secret',
            headers: {
                'X-API-Key': 'Your API key',
                'X-API-Secret': 'Your API secret'
            }
        }
    });
});

app.get('/health', async (c: Context) => {
    try {
        // Test database connection
        const db = getDatabase();
        await db.execute('SELECT 1 as test');

        logger.info('Health check - OK');
        return c.json({
            message: 'OK',
            status: 'healthy',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger?.error({ error }, 'Health check failed - database connection error');
        return c.json({
            message: 'Service Unavailable',
            status: 'unhealthy',
            error: 'Database connection failed',
            timestamp: new Date().toISOString()
        }, 503);
    }
});

// anything after this point requires API key and secret
app.use("*", validateAPICredentials);

// IP Geolocation endpoints
app.get('/ip/:ip', async (c: Context) => {
    const ip = c.req.param('ip');

    if (!ip || ip.trim() === '') {
        throw new handlers.InvalidIPAddress(c, { ip, message: 'IP address is required' });
    }

    // Basic IP validation
    const trimmedIP = ip.trim();
    if (trimmedIP.length > 45) { // Max length for IPv6
        throw new handlers.InvalidIPAddress(c, { ip: trimmedIP, message: 'IP address too long' });
    }

    try {
        const result = await lookupIP(trimmedIP);

        if (!result) {
            throw new handlers.IPNotFound(c, { ip: trimmedIP });
        }

        logger?.info({ ip: trimmedIP, result }, 'IP geolocation lookup successful');
        return c.json({
            success: true,
            data: {
                ip: trimmedIP,
                geolocation: result
            }
        });
    } catch (error) {
        if (error instanceof Error && error.message.includes('Invalid IP address')) {
            throw new handlers.InvalidIPAddress(c, { ip: trimmedIP, error: error.message });
        }
        throw error;
    }
});

// Batch IP lookup endpoint
app.post('/ip/batch', async (c: Context) => {
    try {
        const body = await c.req.json();
        const { ips } = body;

        if (!Array.isArray(ips) || ips.length === 0) {
            throw new handlers.ValidationError(c, {
                message: 'ips must be a non-empty array'
            });
        }

        if (ips.length > 100) {
            throw new handlers.ValidationError(c, {
                message: 'Maximum 100 IPs allowed per batch request'
            });
        }

        // Validate each IP before processing
        const validIPs = ips.map(ip => {
            const trimmed = ip.trim();
            if (trimmed.length > 45) {
                throw new handlers.InvalidIPAddress(c, { ip: trimmed, message: 'IP address too long' });
            }
            return trimmed;
        });

        const results = await lookupIPs(validIPs);

        logger?.info({
            requested: validIPs.length,
            found: results.filter(r => r !== null).length
        }, 'Batch IP geolocation lookup completed');

        return c.json({
            success: true,
            data: {
                results: validIPs.map((ip, index) => ({
                    ip,
                    geolocation: results[index]
                }))
            }
        });
    } catch (error) {
        if (error instanceof SyntaxError) {
            throw new handlers.ValidationError(c, {
                message: 'Invalid JSON in request body'
            });
        }
        throw error;
    }
});

// IP geolocation with query parameters (alternative endpoint)
app.get('/lookup', async (c: Context) => {
    const ip = c.req.query('ip');

    if (!ip || ip.trim() === '') {
        throw new handlers.ValidationError(c, {
            message: 'ip query parameter is required'
        });
    }

    // Basic IP validation
    const trimmedIP = ip.trim();
    if (trimmedIP.length > 45) { // Max length for IPv6
        throw new handlers.InvalidIPAddress(c, { ip: trimmedIP, message: 'IP address too long' });
    }

    try {
        const result = await lookupIP(trimmedIP);

        if (!result) {
            throw new handlers.IPNotFound(c, { ip: trimmedIP });
        }

        logger?.info({ ip: trimmedIP, result }, 'IP geolocation lookup successful');
        return c.json({
            success: true,
            data: {
                ip: trimmedIP,
                geolocation: result
            }
        });
    } catch (error) {
        if (error instanceof Error && error.message.includes('Invalid IP address')) {
            throw new handlers.InvalidIPAddress(c, { ip: trimmedIP, error: error.message });
        }
        throw error;
    }
});