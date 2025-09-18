#!/usr/bin/env node

// Simple database test script
import { createClient } from '@libsql/client';

const client = createClient({
    url: 'file:./data/primary.db',
});

async function testDatabase() {
    try {
        console.log('🔍 Testing database connection...');

        // Test basic connection
        const result = await client.execute('SELECT COUNT(*) as count FROM ip2location_db11_ipv6');
        console.log(`✅ Database connected. Total records: ${ result.rows[0].count }`);

        // Test a sample query
        const sampleResult = await client.execute(`
      SELECT country_code, country_name, city_name 
      FROM ip2location_db11_ipv6 
      WHERE country_code IS NOT NULL 
      LIMIT 5
    `);

        console.log('📊 Sample data:');
        sampleResult.rows.forEach((row, index) => {
            console.log(`${ index + 1 }. ${ row.country_code } - ${ row.country_name } - ${ row.city_name }`);
        });

        // Test the optimized lookup query
        const testIP = '8.8.8.8';
        const paddedDecimal = '0000000000000000000000000000000134744072'; // 8.8.8.8 in padded decimal

        const lookupResult = await client.execute({
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

        if (lookupResult.rows.length > 0) {
            const row = lookupResult.rows[0];
            console.log(`\n🎯 Test lookup for ${ testIP }:`);
            console.log(`   Country: ${ row.country_name } (${ row.country_code })`);
            console.log(`   City: ${ row.city_name }`);
            console.log(`   Region: ${ row.region_name }`);
        } else {
            console.log(`❌ No data found for ${ testIP }`);
        }

        console.log('\n✅ Database test completed successfully!');

    } catch (error) {
        console.error('❌ Database test failed:', error);
    } finally {
        client.close();
    }
}

testDatabase();
