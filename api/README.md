# IP Geolocation API

A high-performance IP geolocation API built with Hono and libsql, using the
IP2Location database.

## Features

- **Fast IP Lookups**: Optimized database queries with strategic indexes
- **IPv4 Support**: Handles IPv4 address format with comprehensive geolocation
  data
- **Batch Processing**: Lookup multiple IPs in a single request (up to 100 IPs)
- **API Authentication**: Secure endpoints with API key and secret validation
- **Comprehensive Error Handling**: Detailed error responses with proper HTTP
  status codes
- **Health Monitoring**: Database connectivity health checks
- **Request Logging**: Complete request/response logging with timing
- **Security Headers**: Built-in security headers for protection
- **Input Validation**: Robust IP address validation and sanitization

## API Endpoints

### Authentication

All endpoints (except `/health`) require authentication headers:

- `X-API-Key`: Your API key
- `X-API-Secret`: Your API secret

### Endpoints

#### 1. API Documentation

```http
GET /api/docs
```

Returns complete API documentation with endpoint details and examples.

**Example:**

```bash
curl http://localhost:3000/api/docs
```

#### 2. Health Check

```http
GET /api/health
```

Health check endpoint that tests database connectivity.

**Response:**

```json
{
  "message": "OK",
  "status": "healthy",
  "timestamp": "2025-01-18T11:37:33.839Z"
}
```

#### 3. Single IP Lookup (Path Parameter)

```http
GET /api/ip/{ip}
```

**Example:**

```bash
curl -H "X-API-Key: your-key" -H "X-API-Secret: your-secret" \
  http://localhost:3000/api/ip/8.8.8.8
```

#### 4. Single IP Lookup (Query Parameter)

```http
GET /api/lookup?ip={ip}
```

**Example:**

```bash
curl -H "X-API-Key: your-key" -H "X-API-Secret: your-secret" \
  "http://localhost:3000/api/lookup?ip=1.1.1.1"
```

#### 5. Batch IP Lookup

```http
POST /api/ip/batch
Content-Type: application/json

{
  "ips": ["8.8.8.8", "1.1.1.1", "208.67.222.222"]
}
```

**Example:**

```bash
curl -X POST \
  -H "X-API-Key: your-key" \
  -H "X-API-Secret: your-secret" \
  -H "Content-Type: application/json" \
  -d '{"ips": ["8.8.8.8", "1.1.1.1"]}' \
  http://localhost:3000/api/ip/batch
```

## Response Format

### Successful Response

```json
{
  "success": true,
  "data": {
    "ip": "8.8.8.8",
    "geolocation": {
      "ip_from_dec": "134744064",
      "ip_to_dec": "134744319",
      "country_code": "US",
      "country_name": "United States of America",
      "region_name": "California",
      "city_name": "Mountain View",
      "latitude": 37.38605,
      "longitude": -122.08385,
      "zip_code": "94035",
      "time_zone": "-07:00"
    }
  }
}
```

### Error Response

```json
{
  "message": "IP address not found",
  "cause": "No geolocation data available for this IP address",
  "errorCode": "IP_NOT_FOUND"
}
```

## Error Codes

| Error Code             | Status | Description                |
| ---------------------- | ------ | -------------------------- |
| `API_KEY_NOT_FOUND`    | 401    | Missing API key header     |
| `API_SECRET_NOT_FOUND` | 401    | Missing API secret header  |
| `API_KEY_INVALID`      | 401    | Invalid API key            |
| `API_SECRET_INVALID`   | 401    | Invalid API secret         |
| `INVALID_IP_ADDRESS`   | 400    | Invalid IP address format  |
| `IP_NOT_FOUND`         | 404    | No geolocation data for IP |
| `VALIDATION_ERROR`     | 422    | Request validation failed  |
| `PATH_NOT_FOUND`       | 404    | Endpoint not found         |
| `INTERNAL_ERROR`       | 500    | Internal server error      |

## Environment Variables

Create a `.env` file:

```env
NODE_ENV=development
HOST=0.0.0.0
PORT=3000
LOG_LEVEL=info
API_KEY=your-api-key
API_SECRET=your-api-secret
DATABASE_PATH=./data/primary.db
```

## Development

### Prerequisites

- Node.js 18+
- pnpm
- IP2Location database in `./data/primary.db`

### Installation

```bash
pnpm install
```

### Run Development Server

```bash
pnpm dev
```

### Build

```bash
pnpm build
```

### Test Endpoints

```bash
# Test with curl
curl -H "X-API-Key: test-key" -H "X-API-Secret: test-secret" \
  http://localhost:3000/api/ip/8.8.8.8

# Test health endpoint
curl http://localhost:3000/api/health

# Test API documentation
curl http://localhost:3000/api/docs

# Test batch lookup
curl -X POST \
  -H "X-API-Key: test-key" \
  -H "X-API-Secret: test-secret" \
  -H "Content-Type: application/json" \
  -d '{"ips": ["8.8.8.8", "1.1.1.1"]}' \
  http://localhost:3000/api/ip/batch
```

## Database

The API uses a SQLite database with the following optimizations:

- **Primary Key**: `ip_from_padded` (39-character zero-padded decimal)
- **Indexes**: Strategic indexes on country, region, city, coordinates, time
  zone
- **Query Optimization**: Uses the optimized range lookup algorithm
- **IPv4 Database**: Uses IP2Location IPv4 database for accurate geolocation
  data

### Database Schema

```sql
CREATE TABLE ip2location_db11_ipv6 (
  ip_from_dec     TEXT NOT NULL,
  ip_to_dec       TEXT NOT NULL,
  ip_from_padded  TEXT NOT NULL,  -- 39-char, zero-left-padded decimal
  ip_to_padded    TEXT NOT NULL,
  country_code    TEXT,           -- 2-letter country code
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
```

### Strategic Indexes

The database includes the following indexes for optimal query performance:

- `idx_country_code` - For country-based queries
- `idx_region_name` - For region-based queries
- `idx_city_name` - For city-based queries
- `idx_geo_coords` - For geographic proximity searches
- `idx_time_zone` - For time zone queries
- `idx_country_region` - For country + region combinations
- `idx_country_city` - For country + city combinations
- `idx_zip_code` - For postal code lookups

## Performance

- **Single IP Lookup**: ~1-5ms average response time
- **Batch Lookup**: ~10-50ms for 100 IPs
- **Database Size**: ~1.9GB optimized with strategic indexes
- **Memory Usage**: Efficient with libsql client
- **Concurrent Requests**: Handles multiple simultaneous requests
- **Request Logging**: Minimal performance impact with structured logging

## Security Features

- **API Authentication**: Required API key and secret for all protected
  endpoints
- **Input Validation**: Comprehensive IP address validation and sanitization
- **Security Headers**: X-Content-Type-Options, X-Frame-Options,
  X-XSS-Protection
- **Error Handling**: Secure error responses without sensitive information
  leakage
- **Request Logging**: Complete audit trail of all API requests

## Monitoring & Observability

- **Health Checks**: Database connectivity monitoring
- **Request Logging**: Complete request/response logging with timing
- **Error Tracking**: Detailed error logging with context
- **Performance Metrics**: Response time tracking
- **Structured Logging**: JSON-formatted logs for easy parsing

## License

This project uses the IP2Location LITE database. Please refer to the IP2Location
license terms.
