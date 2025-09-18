import 'hono';
import { type Logger } from 'pino';
declare module 'hono' {
    interface HonoRequest {
        apiKey?: string;
        apiSecret?: string;
    }
} 