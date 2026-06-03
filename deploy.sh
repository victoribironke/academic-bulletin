#!/bin/bash
# ─── Production Deploy Script ──────────────────────────────────────────────
# Run this on the Debian server to pull the latest code and redeploy.
# Usage:  bash deploy.sh
# ──────────────────────────────────────────────────────────────────────────

set -e  # Exit immediately if any command fails

echo "Pulling latest code..."
git pull origin main

echo "Rebuilding and restarting containers..."
docker compose up -d --build

echo "Removing unused Docker images to free disk space..."
docker image prune -f

echo "Deployment complete!"
echo ""
echo "Container status:"
docker compose ps
