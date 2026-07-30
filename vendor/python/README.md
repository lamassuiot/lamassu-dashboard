# Browser Python wheel

`live_cbom-0.1.0-py3-none-any.whl` is built from the sibling `live-cbom`
project and copied into `public/python` by `npm run cbom:assets`.

To rebuild and test it after changing `live-cbom`:

```bash
npm run cbom:update
```

For a deployable Next.js build, stop the development server first and run
`npm run cbom:update:production`.

Use `npm run cbom:update -- --skip-tests` for a quicker wheel-only refresh, or
pass `--live-cbom-dir PATH` when the Python repository is elsewhere.
