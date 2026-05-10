#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-s7robotics.space}"
APP_DIR="${APP_DIR:-/var/www/s7robotics}"
REPO_URL="${REPO_URL:-https://github.com/batyr121/S7Robotics.git}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo DOMAIN=$DOMAIN bash deploy/ubuntu-nginx-php.sh"
  exit 1
fi

apt-get update
apt-get install -y nginx git unzip sqlite3 php8.1-fpm php8.1-sqlite3 php8.1-mbstring php8.1-xml php8.1-curl

mkdir -p "$APP_DIR"
if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" pull --ff-only
else
  rm -rf "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
fi

mkdir -p "$APP_DIR/api/.storage"
chown -R www-data:www-data "$APP_DIR/api/.storage"
chmod 750 "$APP_DIR/api/.storage"
find "$APP_DIR" -type d -not -path "$APP_DIR/api/.storage" -exec chmod 755 {} \;
find "$APP_DIR" -type f -exec chmod 644 {} \;

cat > "/etc/nginx/sites-available/s7robotics" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN s7robotics.play2go.cloud;

    root $APP_DIR;
    index index.html index.php;

    client_max_body_size 20m;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        try_files \$uri /api/index.php?\$query_string;
    }

    location ~ ^/api/.+\\.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php8.1-fpm.sock;
    }

    location ~ /api/\\.storage {
        deny all;
    }

    location ~ /\\. {
        deny all;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/s7robotics /etc/nginx/sites-enabled/s7robotics
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable --now php8.1-fpm
systemctl reload nginx

echo "S7 Robotics deployed to http://$DOMAIN"
echo "Create the first admin account in the browser."
