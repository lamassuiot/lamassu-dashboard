#!/bin/bash
set -e

# The browser terminal is off unless EXPERIMENTAL_WBTERM is exactly "true".
if [[ "${EXPERIMENTAL_WBTERM:-false}" != "true" ]]; then
    export EXPERIMENTAL_WBTERM=false
fi

# Wisp server for the browser terminal's network. nginx proxies /wisp/ to it (nginx.conf), so the
# terminal uses it on the dashboard's own origin.
WISP_PORT=5001
wisp_enabled=false
if [[ "${EXPERIMENTAL_WBTERM}" == "true" && "${WISP_ENABLED:-true}" == "true" ]]; then
    wisp_enabled=true
fi

if [[ "$wisp_enabled" == "true" ]]; then
    case "${WISP_ALLOW_PRIVATE_IPS:-false}" in
        true|false) ;;
        *) echo "WISP_ALLOW_PRIVATE_IPS must be true or false" >&2; exit 1 ;;
    esac
    # wisp-js blocks loopback and private addresses unless told otherwise: the terminal must not be
    # a way into the container's network. WISP_OPTIONS (JSON) replaces this when it is set.
    if [[ -z "${WISP_OPTIONS:-}" ]]; then
        WISP_OPTIONS="{\"allow_private_ips\":${WISP_ALLOW_PRIVATE_IPS:-false}}"
    fi
    if ! node -e 'try { const value = JSON.parse(process.argv[1]); if (!value || Array.isArray(value) || typeof value !== "object") process.exit(1); } catch { process.exit(1); }' "$WISP_OPTIONS"; then
        echo "WISP_OPTIONS must be a valid JSON object" >&2
        exit 1
    fi
    # Unless the operator points the terminal at another server.
    export LAMASSU_TERMINAL_WISP_URL="${LAMASSU_TERMINAL_WISP_URL:-/wisp/}"
fi

rm -f /var/www/html/config.js
cat /tmpl/config.js.tmpl | envsubst  > /var/www/html/config.js

pids=()
if [[ "$wisp_enabled" == "true" ]]; then
    node /opt/wisp/node_modules/@mercuryworkshop/wisp-js/src/bin/server_cli.mjs \
        --host 127.0.0.1 --port "$WISP_PORT" --logging WARN --options "$WISP_OPTIONS" &
    pids+=($!)
fi
nginx -g "daemon off;" &
pids+=($!)

# Forward stop signals to every child (the nginx image stops with SIGQUIT) and exit cleanly. Stop
# the container as soon as one child exits on its own, so the orchestrator restarts it (a dead
# Wisp server would leave the terminal without a network).
stopping=false
trap 'stopping=true; kill -TERM "${pids[@]}" 2>/dev/null || true' TERM INT QUIT
set +e
wait -n "${pids[@]}"
status=$?
kill "${pids[@]}" 2>/dev/null
wait
if [[ "$stopping" == "true" ]]; then exit 0; fi
exit "$status"
