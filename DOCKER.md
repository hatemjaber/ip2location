Docker Setup for IP2Location API

This guide explains how to build and run the IP2Location API using Docker.

## Prerequisites

- Docker and Docker Compose installed
- IP2Location database file (`primary.db`) in the `api/data/` directory

## Quick Start

1. **Prepare the database** (if not already done):
   ```bash
   # Make sure you have the IP2Location database
   ls api/data/primary.db
   ```

2. **Set up environment variables**:
   ```bash
   # Copy the example environment file
   cp api/.env.example api/.env

   # Edit the environment file with your API credentials
   nano api/.env
   ```

3. **Build and run with Docker Compose**:
   ```bash
   # Build and start the service
   docker-compose up --build

   # Or run in detached mode
   docker-compose up --build -d
   ```

4. **Test the service**:
   ```bash
   # Run the test script
   ./test-docker.sh

   # Or test manually
   curl http://localhost:3000/api/health
   ```

## Manual Docker Build

If you prefer to build manually:

```bash
# Build the Docker image
docker build -t ip2location-api ./api

# Run the container
docker run -d \
  --name ip2location-api \
  -p 3000:3000 \
  -e API_KEY=your-key \
  -e API_SECRET=your-secret \
  -v $(pwd)/api/data:/app/data:ro \
  ip2location-api
```

## Environment Variables

| Variable        | Description                   | Default                |
| --------------- | ----------------------------- | ---------------------- |
| `API_KEY`       | API key for authentication    | `test-key`             |
| `API_SECRET`    | API secret for authentication | `test-secret`          |
| `NODE_ENV`      | Node.js environment           | `production`           |
| `HOST`          | Server host                   | `0.0.0.0`              |
| `PORT`          | Server port                   | `3000`                 |
| `LOG_LEVEL`     | Logging level                 | `info`                 |
| `DATABASE_PATH` | Path to SQLite database       | `/app/data/primary.db` |

## Image Details

- **Base Image**: `node:22-alpine` (latest Node.js on Alpine Linux)
- **Size**: ~150MB (optimized for production)
- **Architecture**: Multi-stage build for minimal production image
- **Security**: Runs as non-root user (`nodejs`)
- **Health Check**: Built-in health monitoring

## Testing

The included test script (`test-docker.sh`) performs comprehensive testing:

- Health check endpoint
- API documentation endpoint
- Single IP lookups (path and query parameters)
- Batch IP lookups
- Error handling (invalid IPs, missing auth)
- Authentication validation

## Pushing to Docker Hub

1. **Tag the image**:
   ```bash
   docker tag ip2location-api your-username/ip2location-api:latest
   ```

2. **Login to Docker Hub**:
   ```bash
   docker login
   ```

3. **Push the image**:
   ```bash
   docker push your-username/ip2location-api:latest
   ```

## Production Deployment

For production deployment, consider:

- Using environment-specific configuration files
- Setting up proper secrets management
- Configuring reverse proxy (nginx/traefik)
- Setting up monitoring and logging
- Using container orchestration (Kubernetes/Docker Swarm)

## Troubleshooting

### Service won't start

- Check if the database file exists and is readable
- Verify environment variables are set correctly
- Check container logs: `docker logs ip2location-api`

### Database not found

- Ensure `primary.db` exists in `api/data/` directory
- Check volume mount in docker-compose.yml
- Verify file permissions

### Authentication errors

- Verify API_KEY and API_SECRET are set correctly
- Check that headers are being sent properly
- Review middleware configuration

### Performance issues

- Monitor container resource usage
- Check database file size and indexing
- Review query performance in logs
