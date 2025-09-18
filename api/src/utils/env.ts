import { z } from "zod";

const schema = z.object({
    NODE_ENV: z.string(),
    HOST: z.string().default("0.0.0.0"),
    PORT: z
        .string()
        .optional()
        .transform((val) => (val ? Number(val) : 3000)),
    LOG_LEVEL: z.string().optional().default('info'),
    API_KEY: z.string(),
    API_SECRET: z.string(),
    DATABASE_PATH: z.string().optional().default('./data/primary.db'),
});

export const env = schema.parse(process.env);