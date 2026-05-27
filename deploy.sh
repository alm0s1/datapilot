#!/bin/bash
set -euo pipefail

# ==============================================
# DataPilot Production Deployment Script
# Target: Ubuntu 22.04/24.04 LTS on a fresh VPS
# ==============================================

APP_DIR="/opt/datapilot"
COMPOSE_FILE="docker-compose.prod.yml"

echo "========================================"
echo "  DataPilot Production Deployment"
echo "========================================"

# ---- Phase 1: System Setup ----
echo ""
echo "[1/7] Updating system packages..."
apt-get update && apt-get upgrade -y

echo "[1/7] Installing prerequisites..."
apt-get install -y curl git ufw apt-transport-https ca-certificates software-properties-common

# ---- Phase 2: Firewall ----
echo ""
echo "[2/7] Configuring firewall..."
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
echo "Firewall configured: SSH, HTTP, HTTPS allowed."

# ---- Phase 3: Install Docker ----
echo ""
echo "[3/7] Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    echo "Docker installed successfully."
else
    echo "Docker already installed: $(docker --version)"
fi

# Ensure docker compose plugin is available
if ! docker compose version &> /dev/null; then
    apt-get install -y docker-compose-plugin
fi

# ---- Phase 4: Project Setup ----
echo ""
echo "[4/7] Setting up project..."
if [ ! -d "$APP_DIR" ]; then
    echo "ERROR: Project not found at $APP_DIR"
    echo "Please copy the project to $APP_DIR first:"
    echo "  scp -r ./  root@<VPS_IP>:$APP_DIR"
    echo "  or: git clone <repo-url> $APP_DIR"
    exit 1
fi

cd "$APP_DIR"

# ---- Phase 5: Environment Configuration ----
echo ""
echo "[5/7] Configuring environment..."
if [ ! -f ".env.prod" ]; then
    cp .env.prod.example .env.prod

    # Auto-generate secrets
    SECRET_KEY=$(openssl rand -hex 64)
    JWT_SECRET_KEY=$(openssl rand -hex 64)
    POSTGRES_PASSWORD=$(openssl rand -hex 32)
    REDIS_PASSWORD=$(openssl rand -hex 32)

    sed -i "s|<run: openssl rand -hex 64>|$SECRET_KEY|" .env.prod
    sed -i "s|<run: openssl rand -hex 64>|$JWT_SECRET_KEY|" .env.prod
    sed -i "s|<run: openssl rand -hex 32>|$POSTGRES_PASSWORD|" .env.prod
    sed -i "0,/<run: openssl rand -hex 32>/s||$REDIS_PASSWORD|" .env.prod

    echo ""
    echo "========================================="
    echo "  IMPORTANT: Edit .env.prod before continuing!"
    echo "  Fill in your OAuth credentials, OpenAI key,"
    echo "  email for Let's Encrypt, and domain."
    echo "========================================="
    echo ""
    echo "  nano $APP_DIR/.env.prod"
    echo ""
    read -p "Press ENTER after editing .env.prod to continue..."
fi

# Load domain from env
source .env.prod
DOMAIN="${DOMAIN:-ufuq.fyi}"
CERT_EMAIL="${CERT_EMAIL:-}"

if [ -z "$CERT_EMAIL" ]; then
    echo "ERROR: CERT_EMAIL is not set in .env.prod"
    exit 1
fi

# ---- Phase 6: SSL Certificate ----
echo ""
echo "[6/7] Obtaining SSL certificate for $DOMAIN..."

# Check if certificate already exists
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ] && [ ! -d "$APP_DIR/certbot-conf/live/$DOMAIN" ]; then
    # Create temporary nginx config for ACME challenge
    mkdir -p /tmp/certbot-nginx
    cat > /tmp/certbot-nginx/default.conf << 'NGINX_CONF'
server {
    listen 80;
    server_name _;
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location / {
        return 444;
    }
}
NGINX_CONF

    mkdir -p /tmp/certbot-www

    # Start temporary nginx for ACME challenge
    docker run -d --name certbot-nginx \
        -p 80:80 \
        -v /tmp/certbot-nginx/default.conf:/etc/nginx/conf.d/default.conf:ro \
        -v /tmp/certbot-www:/var/www/certbot \
        nginx:alpine

    # Give nginx a moment to start
    sleep 3

    # Create Docker volumes for certbot if they don't exist
    docker volume create datapilot_certbot-conf 2>/dev/null || true
    docker volume create datapilot_certbot-www 2>/dev/null || true

    # Get the volume mount path
    CERTBOT_CONF_PATH=$(docker volume inspect datapilot_certbot-conf --format '{{.Mountpoint}}')

    # Obtain certificate
    docker run --rm \
        -v datapilot_certbot-conf:/etc/letsencrypt \
        -v /tmp/certbot-www:/var/www/certbot \
        certbot/certbot certonly \
        --webroot \
        -w /var/www/certbot \
        -d "$DOMAIN" \
        --email "$CERT_EMAIL" \
        --agree-tos \
        --non-interactive

    # Stop temporary nginx
    docker stop certbot-nginx && docker rm certbot-nginx
    rm -rf /tmp/certbot-nginx /tmp/certbot-www

    echo "SSL certificate obtained for $DOMAIN"
else
    echo "SSL certificate already exists for $DOMAIN"
fi

# ---- Phase 7: Build and Launch ----
echo ""
echo "[7/7] Building and starting DataPilot..."

# Use the volume names matching docker-compose project name
export COMPOSE_PROJECT_NAME="datapilot"

docker compose -f "$COMPOSE_FILE" --env-file .env.prod build
docker compose -f "$COMPOSE_FILE" --env-file .env.prod up -d

# Wait for services
echo "Waiting for services to start..."
sleep 15

# Verify
echo ""
echo "========================================"
echo "  Deployment Status"
echo "========================================"
docker compose -f "$COMPOSE_FILE" ps

echo ""
echo "Health check:"
HEALTH=$(curl -sk "https://$DOMAIN/health" 2>/dev/null || echo "FAILED")
echo "  https://$DOMAIN/health -> $HEALTH"

echo ""
echo "========================================"
echo "  Deployment Complete!"
echo "========================================"
echo ""
echo "  URL:  https://$DOMAIN"
echo ""
echo "  Next steps:"
echo "  1. Update OAuth redirect URIs in Google/Microsoft console:"
echo "     - https://$DOMAIN/api/v1/auth/oauth/callback/google"
echo "     - https://$DOMAIN/api/v1/auth/oauth/callback/microsoft"
echo ""
echo "  2. Useful commands:"
echo "     View logs:     docker compose -f $COMPOSE_FILE logs -f"
echo "     Restart:       docker compose -f $COMPOSE_FILE restart"
echo "     Stop:          docker compose -f $COMPOSE_FILE down"
echo "     DB backup:     docker compose -f $COMPOSE_FILE exec postgres pg_dump -U datapilot datapilot > backup.sql"
echo ""
