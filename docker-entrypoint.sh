#!/bin/bash
set -e

# The browser terminal is off unless EXPERIMENTAL_WBTERM is exactly "true".
if [[ "${EXPERIMENTAL_WBTERM:-false}" != "true" ]]; then
    export EXPERIMENTAL_WBTERM=false
fi

rm -f /var/www/html/config.js
cat /tmpl/config.js.tmpl | envsubst  > /var/www/html/config.js
exec nginx -g "daemon off;"
