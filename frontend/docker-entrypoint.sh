#!/bin/sh
# Replaces BACKEND_HOST placeholder in nginx.conf with the actual value
# at container startup, then hands off to Nginx

: "${BACKEND_HOST:=backend}"

sed -i "s/BACKEND_HOST/${BACKEND_HOST}/g" /etc/nginx/conf.d/default.conf

exec nginx -g "daemon off;"