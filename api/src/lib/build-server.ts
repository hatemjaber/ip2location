import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { cors } from 'hono/cors';
import { showRoutes } from 'hono/dev';
import { requestId } from 'hono/request-id';
import { trimTrailingSlash } from 'hono/trailing-slash';
import { type Logger } from 'pino';

// need to add this to get BigInt to work with JSON.stringify
// @ts-ignore
BigInt.prototype["toJSON"] = function () {
    return this.toString();
};

export const buildHonoServer = (environment: string, port?: number, hostname?: string, logger?: Logger) => {
    const app = new Hono();

    // Generic middlewares
    app.use(cors());
    app.use(compress());
    app.use(trimTrailingSlash());
    app.use(requestId());

    if (environment === "development") {
        showRoutes(app);
    }

    if (port && hostname) {
        const server = serve({ fetch: app.fetch, port, hostname });

        const gracefulShutdown = async () => {
            logger?.info('Shutting down gracefully...');
            // wait for a second before closing the server
            await new Promise(resolve => setTimeout(resolve, 1000));
            server.close(() => {
                logger?.info('Server closed');
                process.exit(0);
            });
        };

        process.on('SIGINT', gracefulShutdown);
        process.on('SIGTERM', gracefulShutdown);
    }

    logger?.info(`Server is running on port: ${ port }, env: ${ environment }, host: ${ hostname }`);
    return app;
};