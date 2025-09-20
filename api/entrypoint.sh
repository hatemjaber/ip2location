#!/bin/sh

# IP2Location API Docker Entrypoint Script
# This script handles database file permissions and starts the application

set -e

echo "🚀 Starting IP2Location API..."

# Check if database file exists
if [ ! -f "/app/data/primary.db" ]; then
    echo "❌ Error: Database file not found at /app/data/primary.db"
    echo "Please ensure the database file is mounted or copied to the container."
    exit 1
fi

echo "✅ Database file found: /app/data/primary.db"

# Fix permissions for database files
echo "🔧 Setting up database file permissions..."

# Ensure the data directory exists and has proper permissions
mkdir -p /app/data

# Fix ownership and permissions for database files
# This is safe to run as root (before switching to nodejs user)
chown -R nodejs:nodejs /app/data
chmod -R 755 /app/data
chmod 644 /app/data/primary.db 2>/dev/null || true

# Fix any existing .db-shm and .db-wal files
chmod 644 /app/data/primary.db-shm 2>/dev/null || true
chmod 644 /app/data/primary.db-wal 2>/dev/null || true

echo "✅ Database permissions configured"

# Test database access
echo "🧪 Testing database access..."
su-exec nodejs node -e "
    const { createClient } = require('@libsql/client');
    const client = createClient({ url: 'file:/app/data/primary.db' });
    client.execute('SELECT 1 as test').then(() => {
        console.log('✅ Database access test successful');
    }).catch(err => {
        console.error('❌ Database access test failed:', err.message);
        process.exit(1);
    });
"

echo "🎉 Starting application as nodejs user..."

# Switch to nodejs user and execute the main command
exec su-exec nodejs "$@"
