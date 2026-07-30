const LIVE_CBOM_WHEEL = 'live_cbom-0.1.0-py3-none-any.whl';
const PYODIDE_VERSION = '314.0.3';
const PYODIDE_INDEX_URL =
  `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const PYODIDE_MODULE_URL = `${PYODIDE_INDEX_URL}pyodide.mjs`;

let pyodide = null;
let browserApi = null;
let initialization = null;

const postStatus = (status) => {
  self.postMessage({ kind: 'status', status });
};

const initialize = async (assetBaseUrl) => {
  postStatus('Starting the Python WebAssembly runtime…');
  const { loadPyodide } = await import(PYODIDE_MODULE_URL);
  pyodide = await loadPyodide({ indexURL: PYODIDE_INDEX_URL });

  postStatus('Loading browser cryptography…');
  await pyodide.loadPackage(['micropip', 'cryptography']);

  postStatus('Installing the CBOM analyzer…');
  const micropip = pyodide.pyimport('micropip');
  try {
    await micropip.install(new URL(LIVE_CBOM_WHEEL, assetBaseUrl).toString());
  } finally {
    micropip.destroy();
  }

  browserApi = pyodide.pyimport('live_cbom.browser');
  postStatus('CBOM analyzer ready');
  return browserApi;
};

const getBrowserApi = (assetBaseUrl) => {
  if (browserApi) return Promise.resolve(browserApi);
  if (!initialization) {
    initialization = initialize(assetBaseUrl).catch((error) => {
      initialization = null;
      throw error;
    });
  }
  return initialization;
};

const getErrorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

self.addEventListener('message', async (event) => {
  const { id, action, payload } = event.data;

  try {
    if (action === 'dispose') {
      browserApi?.destroy();
      browserApi = null;
      pyodide = null;
      initialization = null;
      self.postMessage({ id, ok: true, result: null });
      return;
    }

    const assetBaseUrl = payload?.assetBaseUrl;
    const observations = payload?.observations;
    const options = payload?.options;
    if (
      action !== 'generate' ||
      typeof assetBaseUrl !== 'string' ||
      !Array.isArray(observations) ||
      !options ||
      typeof options !== 'object'
    ) {
      throw new Error('CBOM options and TLS observations are required.');
    }

    const api = await getBrowserApi(assetBaseUrl);
    postStatus('Building CycloneDX 1.7 CBOM…');
    api.reset(JSON.stringify(options));
    const count = api.ingest_json(JSON.stringify({ observations }));
    const json = api.finish_json(2);
    postStatus('CBOM ready');
    self.postMessage({
      id,
      ok: true,
      result: { json, observations: Number(count) },
    });
  } catch (error) {
    self.postMessage({ id, ok: false, error: getErrorMessage(error) });
  }
});
