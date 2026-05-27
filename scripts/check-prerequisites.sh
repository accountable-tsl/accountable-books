#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 Checking development prerequisites...${NC}"

# Function to check command existence
check_cmd() {
    if ! command -v "$1" &> /dev/null; then
        return 1
    fi
    return 0
}

ERRORS=0

# 1. Check for mise (Required)
if check_cmd mise; then
    echo -e "${GREEN}✅ mise found${NC}"
    # Check if mise.toml exists
    if [ -f "mise.toml" ]; then
        # Verify mise is actually managing tools by checking if tools are installed
        if mise ls &>/dev/null; then
            INSTALLED_TOOLS=$(mise ls 2>/dev/null | wc -l | tr -d ' ')
            if [ "$INSTALLED_TOOLS" -gt 0 ]; then
                echo -e "${GREEN}   ✅ mise is managing tools (found $INSTALLED_TOOLS installed)${NC}"
            else
                echo -e "${YELLOW}   ⚠️  mise.toml found but no tools installed${NC}"
                echo -e "   Run: ${BLUE}mise install${NC} to install tools"
            fi
        fi
    else
        echo -e "${YELLOW}   ⚠️  mise.toml not found in project root${NC}"
    fi
else
    echo -e "${RED}❌ mise is missing.${NC}"
    echo -e "   Please install mise to manage runtime versions automatically."
    echo -e "   Run: ${BLUE}curl https://mise.run | sh${NC}"
    echo -e "   Link: ${BLUE}https://github.com/jdx/mise${NC}"
    ERRORS=$((ERRORS+1))
fi

# 2. Check for Docker (Required)
if check_cmd docker; then
    echo -e "${GREEN}✅ docker found${NC}"
    # check if docker daemon is running
    if ! docker info &> /dev/null; then
        echo -e "${RED}❌ Docker is installed but not running.${NC}"
        echo -e "   Please start Docker Desktop or the docker daemon."
        ERRORS=$((ERRORS+1))
    fi
else
    echo -e "${RED}❌ docker is missing.${NC}"
    echo -e "   Please install Docker to run the database."
    echo -e "   Link: ${BLUE}https://docs.docker.com/get-docker/${NC}"
    ERRORS=$((ERRORS+1))
fi

# 3. Check for pnpm (Required)
if check_cmd pnpm; then
    echo -e "${GREEN}✅ pnpm found${NC}"
    # Verify pnpm version matches mise.toml if mise is managing it
    if check_cmd mise && [ -f "mise.toml" ]; then
        EXPECTED_PNPM=$(grep -E '^pnpm\s*=' mise.toml | sed 's/.*= *"\(.*\)".*/\1/' | head -1)
        if [ -n "$EXPECTED_PNPM" ]; then
            ACTUAL_PNPM=$(pnpm --version 2>/dev/null || echo "")
            if [ -n "$ACTUAL_PNPM" ] && [ "$ACTUAL_PNPM" != "$EXPECTED_PNPM" ]; then
                echo -e "${YELLOW}   ⚠️  pnpm version mismatch: found $ACTUAL_PNPM, expected $EXPECTED_PNPM${NC}"
                echo -e "   Run: ${BLUE}mise install${NC} to update"
            fi
        fi
    fi
else
    echo -e "${RED}❌ pnpm is missing.${NC}"
    if check_cmd mise && [ -f "mise.toml" ]; then
        echo -e "   Run: ${BLUE}mise install${NC} to install pnpm"
    else
        echo -e "   Please install pnpm manually or install mise first."
    fi
    ERRORS=$((ERRORS+1))
fi

# 4. Check for uv (Required for ML)
if check_cmd uv; then
    echo -e "${GREEN}✅ uv found${NC}"
else
    echo -e "${RED}❌ uv is missing.${NC}"
    echo -e "   uv is required for the ML Engine."
    echo -e "   Install: ${BLUE}https://docs.astral.sh/uv/getting-started/installation/${NC}"
    ERRORS=$((ERRORS+1))
fi

echo ""

if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}🛑 Missing required tools. Please verify the errors above and try again.${NC}"
    exit 1
else
    echo -e "${GREEN}✨ All core prerequisites checked!${NC}"
    exit 0
fi
