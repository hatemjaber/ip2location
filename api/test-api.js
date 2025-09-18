#!/usr/bin/env node

// Test script for the IP Geolocation API
const BASE_URL = 'http://localhost:3000/api';
const API_KEY = 'test-key';
const API_SECRET = 'test-secret';

const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
    'X-API-Secret': API_SECRET
};

async function testEndpoint(url, method = 'GET', body = null) {
    try {
        console.log(`\n🔍 Testing ${ method } ${ url }`);

        const options = {
            method,
            headers,
            ...(body && { body: JSON.stringify(body) })
        };

        const response = await fetch(`${ BASE_URL }${ url }`, options);
        const data = await response.json();

        console.log(`Status: ${ response.status }`);
        console.log('Response:', JSON.stringify(data, null, 2));

        return { success: response.ok, data, status: response.status };
    } catch (error) {
        console.error(`❌ Error testing ${ url }:`, error.message);
        return { success: false, error: error.message };
    }
}

async function runTests() {
    console.log('🚀 Starting IP Geolocation API Tests');
    console.log(`Base URL: ${ BASE_URL }`);

    // Test health endpoint (no auth required)
    console.log('\n=== Testing Health Endpoint ===');
    await testEndpoint('/health');

    // Test single IP lookup with 8.8.8.8
    console.log('\n=== Testing IP Lookup (8.8.8.8) ===');
    await testEndpoint('/ip/8.8.8.8');

    // Test query parameter lookup
    console.log('\n=== Testing Query Parameter Lookup ===');
    await testEndpoint('/lookup?ip=1.1.1.1');

    // Test batch lookup
    console.log('\n=== Testing Batch Lookup ===');
    await testEndpoint('/ip/batch', 'POST', {
        ips: ['8.8.8.8', '1.1.1.1', '8.8.4.4']
    });

    // Test invalid IP
    console.log('\n=== Testing Invalid IP ===');
    await testEndpoint('/ip/invalid-ip');

    // Test missing IP
    console.log('\n=== Testing Missing IP ===');
    await testEndpoint('/lookup');

    console.log('\n✅ All tests completed!');
}

// Run tests
runTests().catch(console.error);
