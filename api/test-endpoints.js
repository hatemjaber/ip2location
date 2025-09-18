#!/usr/bin/env node

// Simple test script for the IP geolocation API
const API_KEY = process.env.API_KEY || 'test-key';
const API_SECRET = process.env.API_SECRET || 'test-secret';
const BASE_URL = process.env.API_URL || 'http://localhost:5000/api';

const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
    'X-API-Secret': API_SECRET
};

async function testEndpoint(url, method = 'GET', body = null) {
    try {
        const options = {
            method,
            headers,
            ...(body && { body: JSON.stringify(body) })
        };

        console.log(`\n🔍 Testing ${ method } ${ url }`);
        const response = await fetch(`${ BASE_URL }${ url }`, options);
        const data = await response.json();

        console.log(`Status: ${ response.status }`);
        console.log('Response:', JSON.stringify(data, null, 2));

        return { success: response.ok, data };
    } catch (error) {
        console.error(`❌ Error testing ${ url }:`, error.message);
        return { success: false, error: error.message };
    }
}

async function runTests() {
    console.log('🚀 Starting IP Geolocation API Tests');
    console.log(`Base URL: ${ BASE_URL }`);

    // Test health endpoint (no auth required)
    await testEndpoint('/health');

    // Test single IP lookup
    await testEndpoint('/ip/8.8.8.8');

    // Test IPv6 lookup
    await testEndpoint('/ip/2001:4860:4860::8888');

    // Test query parameter lookup
    await testEndpoint('/lookup?ip=1.1.1.1');

    // Test batch lookup
    await testEndpoint('/ip/batch', 'POST', {
        ips: ['8.8.8.8', '1.1.1.1', '208.67.222.222']
    });

    // Test invalid IP
    await testEndpoint('/ip/invalid-ip');

    // Test missing IP
    await testEndpoint('/lookup');

    console.log('\n✅ Tests completed');
}

// Run tests if this script is executed directly
if (import.meta.url === `file://${ process.argv[1] }`) {
    runTests().catch(console.error);
}

export { testEndpoint, runTests };
