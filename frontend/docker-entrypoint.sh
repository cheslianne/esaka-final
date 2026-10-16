#!/bin/sh
set -e

API_BASE_URL="${API_BASE_URL:-https://esaka-backend-production.up.railway.app}"
API_BASE_URL="${API_BASE_URL%/}"

# Keep browser requests same-origin so the HTTP-only auth cookie is first-party.
cat > /usr/share/nginx/html/assets/js/config.js <<EOF
window.API_BASE_URL = window.location.origin;
EOF

# Railway provides PORT at runtime; substitute it into the nginx config
export PORT="${PORT:-8080}"
envsubst '${PORT} ${API_BASE_URL}' < /etc/nginx/templates/nginx.conf.template > /etc/nginx/conf.d/default.conf

exec nginx -g "daemon off;"
