import { createClient } from '@libsql/client';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';

// Database client instance
let client: ReturnType<typeof createClient> | null = null;

export const getDatabase = () => {
    if (!client) {
        const dbPath = process.env.DATABASE_PATH || './data/primary.db';
        client = createClient({
            url: `file:${ dbPath }`,
        });
        logger?.info({ dbPath }, 'Database client initialized');
    }
    return client;
};

// IP Geolocation result interface
export interface IPGeolocationResult {
    ip_from_dec: string;
    ip_to_dec: string;
    country_code: string | null;
    country_name: string | null;
    region_name: string | null;
    city_name: string | null;
    latitude: number | null;
    longitude: number | null;
    zip_code: string | null;
    time_zone: string | null;
}

// Convert IPv4/IPv6 address to 39-character padded decimal
export const ipToPaddedDecimal = (ip: string): string => {
    // Check if it's IPv4
    if (isIPv4(ip)) {
        const parts = ip.split('.').map(Number);
        if (parts.length !== 4 || parts.some(part => part < 0 || part > 255)) {
            throw new Error('Invalid IPv4 address');
        }
        const decimal = (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
        return decimal.toString().padStart(39, '0');
    }

    // Check if it's IPv6
    if (isIPv6(ip)) {
        const decimal = ipv6ToDecimal(ip);
        return decimal.toString().padStart(39, '0');
    }

    throw new Error('Invalid IP address format');
};

// Check if string is valid IPv4
const isIPv4 = (ip: string): boolean => {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipv4Regex.test(ip)) return false;

    const parts = ip.split('.').map(Number);
    return parts.length === 4 && parts.every(part => part >= 0 && part <= 255);
};

// Check if string is valid IPv6
const isIPv6 = (ip: string): boolean => {
    // Basic IPv6 validation - more comprehensive validation can be added
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;
    return ipv6Regex.test(ip) || ip.includes(':');
};

// Convert IPv6 to decimal (simplified - handles basic cases)
const ipv6ToDecimal = (ip: string): bigint => {
    // Handle special cases
    if (ip === '::1') return BigInt('281470681743359'); // localhost
    if (ip === '::') return BigInt('0');

    // Normalize IPv6 address
    const normalized = normalizeIPv6(ip);

    // Convert to decimal
    const parts = normalized.split(':');
    let result = BigInt(0);

    for (const part of parts) {
        result = result * BigInt(65536) + BigInt('0x' + part);
    }

    return result;
};

// Normalize IPv6 address (expand :: and pad with zeros)
const normalizeIPv6 = (ip: string): string => {
    // Handle :: expansion
    if (ip.includes('::')) {
        const parts = ip.split('::');
        const leftParts = parts[0] ? parts[0].split(':') : [];
        const rightParts = parts[1] ? parts[1].split(':') : [];

        const missingZeros = 8 - leftParts.length - rightParts.length;
        const zeros = Array(missingZeros).fill('0000');

        return [...leftParts, ...zeros, ...rightParts].join(':');
    }

    // Pad each part to 4 characters
    return ip.split(':').map(part => part.padStart(4, '0')).join(':');
};

// Lookup IP geolocation
export const lookupIP = async (ip: string): Promise<IPGeolocationResult | null> => {
    try {
        const paddedDecimal = ipToPaddedDecimal(ip);
        const db = getDatabase();

        // Use the optimized query from our script
        const result = await db.execute({
            sql: `
        WITH cand AS (
          SELECT *
          FROM ip2location_db11_ipv6
          WHERE ip_from_padded <= ?
          ORDER BY ip_from_padded DESC
          LIMIT 1
        )
        SELECT * FROM cand WHERE ip_to_padded >= ?
      `,
            args: [paddedDecimal, paddedDecimal]
        });

        if (result.rows.length === 0) {
            return null;
        }

        const row = result.rows[0];
        return {
            ip_from_dec: row.ip_from_dec as string,
            ip_to_dec: row.ip_to_dec as string,
            country_code: row.country_code as string | null,
            country_name: row.country_name as string | null,
            region_name: row.region_name as string | null,
            city_name: row.city_name as string | null,
            latitude: row.latitude as number | null,
            longitude: row.longitude as number | null,
            zip_code: row.zip_code as string | null,
            time_zone: row.time_zone as string | null,
        };
    } catch (error) {
        logger?.error({ error, ip }, 'Error looking up IP geolocation');
        throw error;
    }
};

// Get multiple IPs in batch
export const lookupIPs = async (ips: string[]): Promise<(IPGeolocationResult | null)[]> => {
    const results = await Promise.allSettled(
        ips.map(ip => lookupIP(ip))
    );

    return results.map(result =>
        result.status === 'fulfilled' ? result.value : null
    );
};
