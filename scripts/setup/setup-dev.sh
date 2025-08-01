#!/bin/bash
# Development setup script

echo "🔧 Setting up development environment..."

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "❌ Node.js required"; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "❌ Python 3 required"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "❌ Docker required"; exit 1; }

# Frontend
echo "📦 Installing frontend dependencies..."
cd frontend && npm install

# Backend
echo "🐍 Setting up Python environment..."
cd ../backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Database
echo "🗄️ Starting database..."
cd ..
docker-compose up -d db redis

echo "✅ Development environment ready!"
echo ""
echo "Start frontend: cd frontend && npm start"
echo "Start backend: cd backend && uvicorn app.main:app --reload"
