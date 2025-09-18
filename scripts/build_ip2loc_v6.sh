#!/usr/bin/env bash
set -euo pipefail

# Cleanup function
cleanup() {
  if [[ -n "${TEMP_DB:-}" && -f "$TEMP_DB" ]]; then
    echo "🧹 Cleaning up temporary files..."
    rm -f "$TEMP_DB"
  fi
}
trap cleanup EXIT

CSV_PATH="${1:-}"
DB_PATH="${2:-ip2location.db}"

if [[ -z "${CSV_PATH}" ]]; then
  echo "Usage: $0 /path/to/IP2LOCATION-LITE-DB11.IPV6.CSV [db_path.sqlite]"
  exit 1
fi
if [[ ! -f "$CSV_PATH" ]]; then
  echo "CSV not found: $CSV_PATH"
  exit 1
fi

# Max decimal length for IPv6 = 39 digits (2^128-1 = 340282366920938463463374607431768211455)
ZEROS="000000000000000000000000000000000000000"

# ------------------------------------------------------------------------------
# 1) Create schema (staging + final WITHOUT ROWID with PK on ip_from_padded)
# ------------------------------------------------------------------------------
sqlite3 "$DB_PATH" <<'SQL'
-- Performance optimizations for bulk operations
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA temp_store=MEMORY;
PRAGMA cache_size=-1000000;  -- Increased cache size for better performance
PRAGMA mmap_size=268435456;  -- 256MB memory-mapped I/O
PRAGMA page_size=4096;       -- Optimal page size for most systems
PRAGMA auto_vacuum=NONE;     -- Disable auto-vacuum during bulk operations

-- Drop any leftovers
DROP TABLE IF EXISTS ip2location_db11_ipv6_raw;
DROP TABLE IF EXISTS ip2location_db11_ipv6;

-- Staging: raw CSV as TEXT (matches file columns 1..10)
CREATE TABLE ip2location_db11_ipv6_raw (
  c1  TEXT,  -- ip_from (decimal, as text)
  c2  TEXT,  -- ip_to   (decimal, as text)
  c3  TEXT,  -- country_code
  c4  TEXT,  -- country_name
  c5  TEXT,  -- region_name
  c6  TEXT,  -- city_name
  c7  TEXT,  -- latitude
  c8  TEXT,  -- longitude
  c9  TEXT,  -- zip_code
  c10 TEXT   -- time_zone
);

-- Final: clustered by start-of-range for fast predecessor seek
CREATE TABLE ip2location_db11_ipv6 (
  ip_from_dec     TEXT NOT NULL,  -- original decimal
  ip_to_dec       TEXT NOT NULL,
  ip_from_padded  TEXT NOT NULL,  -- 39-char, zero-left-padded decimal
  ip_to_padded    TEXT NOT NULL,
  country_code    TEXT,           -- 2-letter country code (ISO 3166-1 alpha-2)
  country_name    TEXT,           -- Full country name
  region_name     TEXT,           -- State/Province/Region name
  city_name       TEXT,           -- City name
  latitude        REAL,           -- Latitude coordinate
  longitude       REAL,           -- Longitude coordinate
  zip_code        TEXT,           -- Postal/ZIP code
  time_zone       TEXT,           -- Time zone (e.g., +08:00)
  PRIMARY KEY (ip_from_padded),
  CHECK (length(ip_from_padded) = 39),
  CHECK (length(ip_to_padded) = 39),
  CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180))
) WITHOUT ROWID;
SQL

# ------------------------------------------------------------------------------
# 2) Import the CSV into the staging table
# ------------------------------------------------------------------------------
echo "📥 Importing CSV data into staging table..."
sqlite3 "$DB_PATH" <<SQL
.mode csv
.separator ","
.import '${CSV_PATH}' ip2location_db11_ipv6_raw
SQL

# Validate import
RECORD_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM ip2location_db11_ipv6_raw;")
echo "📊 Imported $RECORD_COUNT records into staging table"

# ------------------------------------------------------------------------------
# 3) Transform into final table + cleanup
# ------------------------------------------------------------------------------
echo "🔄 Transforming data into final table..."
sqlite3 "$DB_PATH" <<SQL
-- Populate final table (turn "-" into NULL, cast lat/lon, pad to 39 chars)
INSERT INTO ip2location_db11_ipv6 (
  ip_from_dec, ip_to_dec, ip_from_padded, ip_to_padded,
  country_code, country_name, region_name, city_name,
  latitude, longitude, zip_code, time_zone
)
SELECT
  c1 AS ip_from_dec,
  c2 AS ip_to_dec,
  substr('${ZEROS}' || c1, -39, 39) AS ip_from_padded,
  substr('${ZEROS}' || c2, -39, 39) AS ip_to_padded,
  NULLIF(c3,  '-') AS country_code,
  NULLIF(c4,  '-') AS country_name,
  NULLIF(c5,  '-') AS region_name,
  NULLIF(c6,  '-') AS city_name,
  CASE WHEN c7='-' THEN NULL ELSE CAST(c7 AS REAL) END AS latitude,
  CASE WHEN c8='-' THEN NULL ELSE CAST(c8 AS REAL) END AS longitude,
  NULLIF(c9,  '-') AS zip_code,
  NULLIF(c10, '-') AS time_zone
FROM ip2location_db11_ipv6_raw;

-- Drop staging to reclaim space
DROP TABLE IF EXISTS ip2location_db11_ipv6_raw;

-- ------------------------------------------------------------------------------
-- 4) Create meaningful indexes for common query patterns
-- ------------------------------------------------------------------------------

-- Index for country-based queries (most common)
CREATE INDEX idx_country_code ON ip2location_db11_ipv6(country_code) 
WHERE country_code IS NOT NULL;

-- Index for region-based queries
CREATE INDEX idx_region_name ON ip2location_db11_ipv6(region_name) 
WHERE region_name IS NOT NULL;

-- Index for city-based queries
CREATE INDEX idx_city_name ON ip2location_db11_ipv6(city_name) 
WHERE city_name IS NOT NULL;

-- Composite index for geographic queries (latitude, longitude)
CREATE INDEX idx_geo_coords ON ip2location_db11_ipv6(latitude, longitude) 
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Index for time zone queries
CREATE INDEX idx_time_zone ON ip2location_db11_ipv6(time_zone) 
WHERE time_zone IS NOT NULL;

-- Index for country + region combinations (common for filtering)
CREATE INDEX idx_country_region ON ip2location_db11_ipv6(country_code, region_name) 
WHERE country_code IS NOT NULL AND region_name IS NOT NULL;

-- Index for country + city combinations
CREATE INDEX idx_country_city ON ip2location_db11_ipv6(country_code, city_name) 
WHERE country_code IS NOT NULL AND city_name IS NOT NULL;

-- Index for zip code queries (useful for postal code lookups)
CREATE INDEX idx_zip_code ON ip2location_db11_ipv6(zip_code) 
WHERE zip_code IS NOT NULL;

-- Stats and optimization
ANALYZE;
SQL

# Validate final transformation
FINAL_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM ip2location_db11_ipv6;")
echo "📊 Transformed $FINAL_COUNT records into final table"

# Validate data integrity
echo "🔍 Validating data integrity..."
sqlite3 "$DB_PATH" <<SQL
-- Check for any data integrity issues
SELECT 
  'Invalid latitude' as issue, COUNT(*) as count 
FROM ip2location_db11_ipv6 
WHERE latitude IS NOT NULL AND (latitude < -90 OR latitude > 90)
UNION ALL
SELECT 
  'Invalid longitude' as issue, COUNT(*) as count 
FROM ip2location_db11_ipv6 
WHERE longitude IS NOT NULL AND (longitude < -180 OR longitude > 180)
UNION ALL
SELECT 
  'Invalid padded length' as issue, COUNT(*) as count 
FROM ip2location_db11_ipv6 
WHERE length(ip_from_padded) != 39 OR length(ip_to_padded) != 39;
SQL

echo "✅ Done. Database created at: $DB_PATH"

# Show database file size
if [[ -f "$DB_PATH" ]]; then
  DB_SIZE=$(du -h "$DB_PATH" | cut -f1)
  echo "📦 Database file size: $DB_SIZE"
fi

echo "📈 Database statistics:"
sqlite3 "$DB_PATH" <<SQL
SELECT 
  'Total records' as metric, COUNT(*) as value FROM ip2location_db11_ipv6
UNION ALL
SELECT 
  'Countries', COUNT(DISTINCT country_code) FROM ip2location_db11_ipv6 WHERE country_code IS NOT NULL
UNION ALL
SELECT 
  'Regions', COUNT(DISTINCT region_name) FROM ip2location_db11_ipv6 WHERE region_name IS NOT NULL
UNION ALL
SELECT 
  'Cities', COUNT(DISTINCT city_name) FROM ip2location_db11_ipv6 WHERE city_name IS NOT NULL
UNION ALL
SELECT 
  'Time zones', COUNT(DISTINCT time_zone) FROM ip2location_db11_ipv6 WHERE time_zone IS NOT NULL;
SQL

echo "🔍 Index information:"
sqlite3 "$DB_PATH" <<SQL
SELECT 
  name as index_name,
  sql as index_definition
FROM sqlite_master 
WHERE type = 'index' 
  AND tbl_name = 'ip2location_db11_ipv6'
  AND name NOT LIKE 'sqlite_%'
ORDER BY name;
SQL
echo "💡 Example queries using the optimized indexes:"
cat <<'EOSQL'
-- 1) IP Geolocation Lookup (uses PRIMARY KEY index):
-- Given :key = 39-char left-padded decimal of the IP:
WITH cand AS (
  SELECT *
  FROM ip2location_db11_ipv6
  WHERE ip_from_padded <= :key
  ORDER BY ip_from_padded DESC
  LIMIT 1
)
SELECT * FROM cand WHERE ip_to_padded >= :key;

-- 2) Find all IPs in a specific country (uses idx_country_code):
SELECT ip_from_dec, ip_to_dec, country_name, region_name, city_name
FROM ip2location_db11_ipv6
WHERE country_code = 'US'
ORDER BY ip_from_padded;

-- 3) Find IPs in a specific region (uses idx_region_name):
SELECT ip_from_dec, ip_to_dec, country_name, region_name, city_name
FROM ip2location_db11_ipv6
WHERE region_name = 'California'
ORDER BY ip_from_padded;

-- 4) Find IPs in a specific city (uses idx_city_name):
SELECT ip_from_dec, ip_to_dec, country_name, region_name, city_name
FROM ip2location_db11_ipv6
WHERE city_name = 'New York'
ORDER BY ip_from_padded;

-- 5) Geographic proximity search (uses idx_geo_coords):
SELECT ip_from_dec, ip_to_dec, country_name, region_name, city_name,
       latitude, longitude,
       (latitude - :target_lat) * (latitude - :target_lat) + 
       (longitude - :target_lon) * (longitude - :target_lon) AS distance_squared
FROM ip2location_db11_ipv6
WHERE latitude IS NOT NULL AND longitude IS NOT NULL
  AND latitude BETWEEN :target_lat - 1 AND :target_lat + 1
  AND longitude BETWEEN :target_lon - 1 AND :target_lon + 1
ORDER BY distance_squared
LIMIT 10;

-- 6) Find IPs by time zone (uses idx_time_zone):
SELECT ip_from_dec, ip_to_dec, country_name, region_name, city_name, time_zone
FROM ip2location_db11_ipv6
WHERE time_zone = '+08:00'
ORDER BY ip_from_padded;

-- 7) Country + Region combination (uses idx_country_region):
SELECT ip_from_dec, ip_to_dec, country_name, region_name, city_name
FROM ip2location_db11_ipv6
WHERE country_code = 'AU' AND region_name = 'Victoria'
ORDER BY ip_from_padded;

-- 8) Country + City combination (uses idx_country_city):
SELECT ip_from_dec, ip_to_dec, country_name, region_name, city_name
FROM ip2location_db11_ipv6
WHERE country_code = 'GB' AND city_name = 'London'
ORDER BY ip_from_padded;

-- 9) Find IPs by ZIP code (uses idx_zip_code):
SELECT ip_from_dec, ip_to_dec, country_name, region_name, city_name, zip_code
FROM ip2location_db11_ipv6
WHERE zip_code = '10001'
ORDER BY ip_from_padded;
EOSQL

