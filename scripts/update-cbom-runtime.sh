#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'EOF'
Build live-cbom's Python wheel and install it into the dashboard.

Usage:
  scripts/update-cbom-runtime.sh [options]

Options:
  --production           Also create a production Next.js build.
  --skip-tests           Skip the Python and dashboard tests.
  --live-cbom-dir PATH   Use a live-cbom checkout at PATH.
  -h, --help             Show this help.

Environment:
  LIVE_CBOM_DIR          Alternative to --live-cbom-dir.
  LIVE_CBOM_PYTHON       Python executable used to test and build live-cbom.
EOF
}

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
dashboard_dir="$(cd -- "${script_dir}/.." && pwd)"
live_cbom_dir="${LIVE_CBOM_DIR:-${dashboard_dir}/../live-cbom}"
production=false
run_tests=true

while (($# > 0)); do
  case "$1" in
    --production)
      production=true
      shift
      ;;
    --skip-tests)
      run_tests=false
      shift
      ;;
    --live-cbom-dir)
      if (($# < 2)); then
        echo "error: --live-cbom-dir requires a path" >&2
        exit 2
      fi
      live_cbom_dir="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ ! -d "${live_cbom_dir}" ]]; then
  echo "error: live-cbom directory not found: ${live_cbom_dir}" >&2
  exit 1
fi

live_cbom_dir="$(cd -- "${live_cbom_dir}" && pwd)"

if [[ ! -f "${live_cbom_dir}/pyproject.toml" ]]; then
  echo "error: ${live_cbom_dir} does not look like a Python project" >&2
  exit 1
fi

if [[ ! -f "${dashboard_dir}/package.json" ]]; then
  echo "error: dashboard package.json not found: ${dashboard_dir}" >&2
  exit 1
fi

if [[ "${production}" == true ]] && command -v ss >/dev/null 2>&1; then
  if ss -ltnH 'sport = :9002' 2>/dev/null | grep -q .; then
    echo "error: port 9002 is in use. Stop the dashboard dev server before using --production." >&2
    echo "       A Next.js production build and dev server must not share the .next directory." >&2
    exit 1
  fi
fi

if [[ -n "${LIVE_CBOM_PYTHON:-}" ]]; then
  python_bin="${LIVE_CBOM_PYTHON}"
elif [[ -x "${live_cbom_dir}/.venv/bin/python" ]]; then
  python_bin="${live_cbom_dir}/.venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
  python_bin="$(command -v python3)"
else
  echo "error: Python 3 was not found" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "error: npm was not found" >&2
  exit 1
fi

wheel_name="live_cbom-0.1.0-py3-none-any.whl"
build_dir="$(mktemp -d)"

cleanup() {
  if [[ -n "${build_dir:-}" && -d "${build_dir}" ]]; then
    rm -rf -- "${build_dir}"
  fi
}
trap cleanup EXIT INT TERM

if [[ "${run_tests}" == true ]]; then
  echo "==> Testing live-cbom"
  (
    cd -- "${live_cbom_dir}"
    "${python_bin}" -m unittest discover -s tests
  )
fi

echo "==> Building ${wheel_name}"
"${python_bin}" -m pip wheel "${live_cbom_dir}" \
  --no-deps \
  --wheel-dir "${build_dir}"

built_wheel="${build_dir}/${wheel_name}"
if [[ ! -f "${built_wheel}" ]]; then
  echo "error: expected wheel was not produced: ${built_wheel}" >&2
  echo "       If the package version changed, update the wheel name used by the dashboard worker." >&2
  exit 1
fi

mkdir -p -- "${dashboard_dir}/vendor/python"
install -m 0644 "${built_wheel}" "${dashboard_dir}/vendor/python/${wheel_name}"

echo "==> Copying browser runtime assets"
(
  cd -- "${dashboard_dir}"
  npm run cbom:assets
)

if [[ "${run_tests}" == true ]]; then
  echo "==> Testing the dashboard observation adapter"
  (
    cd -- "${dashboard_dir}"
    npm test -- src/lib/packet-analyzer/cbom-observations.test.ts
  )
fi

if [[ "${production}" == true ]]; then
  echo "==> Building the production dashboard"
  (
    cd -- "${dashboard_dir}"
    npm run build
  )
fi

echo
echo "CBOM browser runtime updated successfully."
if [[ "${production}" == true ]]; then
  echo "The production dashboard build is ready."
else
  echo "Next.js will compile UI changes automatically in development."
  echo "Hard-refresh the packet analyzer page so its worker loads the new wheel."
fi
