#!/bin/bash
set -e

# Environment setup script for remote deployments
# Usage: ./scripts/setup-env.sh [staging|production]

ENVIRONMENT=${1:-staging}

echo "🔧 Setting up environment for: $ENVIRONMENT"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
  echo "❌ Error: Please run this script from the apps/api directory"
  exit 1
fi

# Create base environment file if it doesn't exist
if [ ! -f ".env.$ENVIRONMENT" ]; then
  echo "📝 Creating .env.$ENVIRONMENT from .env.example..."
  cp .env.example ".env.$ENVIRONMENT"
  echo "✅ Created .env.$ENVIRONMENT"
else
  echo "✅ .env.$ENVIRONMENT already exists"
fi

# Create secrets file if it doesn't exist
if [ ! -f ".env.secrets.$ENVIRONMENT" ]; then
  echo "📝 Creating .env.secrets.$ENVIRONMENT..."
  touch ".env.secrets.$ENVIRONMENT"
  echo "# Secrets for $ENVIRONMENT environment" > ".env.secrets.$ENVIRONMENT"
  echo "# Add your secrets here (this file is gitignored)" >> ".env.secrets.$ENVIRONMENT"
  echo "✅ Created .env.secrets.$ENVIRONMENT"
else
  echo "✅ .env.secrets.$ENVIRONMENT already exists"
fi

echo ""
echo "🎯 Next steps:"
echo "1. Edit .env.$ENVIRONMENT with your environment-specific values"
echo "2. Edit .env.secrets.$ENVIRONMENT with your secrets"
echo "3. Set NODE_ENV=$ENVIRONMENT when running your application"
echo ""
echo "💡 For Docker deployments, set NODE_ENV=$ENVIRONMENT in your environment"
