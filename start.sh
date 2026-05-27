#!/bin/bash

echo "🚀 Starting DataPilot Application..."
echo ""

# Kill any existing processes on ports 8000 and 3000
echo "📌 Clearing ports..."
lsof -ti:8000 2>/dev/null | xargs kill -9 2>/dev/null
lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null

# Start backend in background
echo "🔧 Starting backend server on port 8000..."
cd "/Users/salim/development/new project disin/backend"
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 > /tmp/datapilot_backend.log 2>&1 &
BACKEND_PID=$!
echo "   Backend PID: $BACKEND_PID"

# Wait for backend to start
sleep 3

# Start frontend in background
echo "🎨 Starting frontend server on port 3000..."
cd "/Users/salim/development/new project disin/frontend"
npm run dev > /tmp/datapilot_frontend.log 2>&1 &
FRONTEND_PID=$!
echo "   Frontend PID: $FRONTEND_PID"

echo ""
echo "✅ DataPilot is starting!"
echo ""
echo "📍 Backend API:  http://localhost:8000"
echo "📍 Swagger Docs: http://localhost:8000/docs"
echo "📍 Frontend App: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Keep script running and show logs
wait
