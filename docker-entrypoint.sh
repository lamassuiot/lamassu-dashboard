#!/bin/bash
set -e

rm -f /var/www/html/config.js
cat /tmpl/config.js.tmpl | envsubst  > /var/www/html/config.js
exec nginx -g "daemon off;"