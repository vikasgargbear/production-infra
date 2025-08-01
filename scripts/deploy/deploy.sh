#!/bin/bash
# Simple deployment script

echo "🚀 Deploying Pharma ERP..."

# Run tests
echo "🧪 Running tests..."
npm test --prefix frontend -- --watchAll=false
pytest backend/tests/

# Build images
echo "🐳 Building Docker images..."
docker-compose build

# Deploy
echo "📦 Starting services..."
docker-compose up -d

echo "✅ Deployment complete!"
echo "Frontend: http://localhost:3000"
echo "Backend: http://localhost:8000"
