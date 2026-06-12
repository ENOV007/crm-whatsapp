#!/bin/sh
export PORT=${PORT:-80}
envsubst '$PORT' < /etc/nginx/conf.d/default.conf > /tmp/default.conf
cp /tmp/default.conf /etc/nginx/conf.d/default.conf
nginx -g 'daemon off;'
