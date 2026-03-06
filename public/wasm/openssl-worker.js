/* openssl-worker.js - Classic Web Worker for OpenSSL WASM execution
 * Served as a static asset so webpack never touches it.
 * importScripts() is always available in a classic worker. */

var CRYPTO_COMMANDS = ['genpkey', 'req', 'rand', 'dgst', 'enc', 'cms', 'ca', 'x509', 'verify', 'sign', 'spkac', 'pkeyutl'];
var OUTPUT_EXTENSIONS = ['.key', '.pub', '.csr', '.crt', '.sig', '.txt', '.bin', '.p12', '.pem', '.enc', '.der', '.p7b', '.crl'];
var SKIP_DIRS = { '.': true, '..': true, tmp: true, dev: true, proc: true, ssl: true, usr: true };

var moduleFactory = null;

// ── Load the Emscripten factory once ─────────────────────────────────────────

function loadFactory() {
  if (moduleFactory) return;
  importScripts('/wasm/openssl.js');
  // openssl.js defines EmscrJSR_openssl as a var → it becomes a global in a classic worker
  var f = typeof EmscrJSR_openssl !== 'undefined' ? EmscrJSR_openssl : self.EmscrJSR_openssl;
  if (typeof f !== 'function') throw new Error('EmscrJSR_openssl not found after loading openssl.js');
  moduleFactory = f;
}

// ── Create a fresh Emscripten module instance ─────────────────────────────────

function createModuleInstance(requestId) {
  return moduleFactory({
    noInitialRun: true,
    print:    function(t) { self.postMessage({ type: 'LOG', stream: 'stdout', message: t, requestId: requestId }); },
    printErr: function(t) { self.postMessage({ type: 'LOG', stream: 'stderr', message: t, requestId: requestId }); },
    locateFile: function(p) { return p.endsWith('.wasm') ? '/wasm/openssl.wasm' : p; }
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function injectEntropy(m) {
  try { var s = new Uint8Array(4096); self.crypto.getRandomValues(s); m.FS.writeFile('/random.seed', s); } catch(e) {}
}

function configureEnvironment(m) {
  var cfg = 'openssl_conf = openssl_init\n[openssl_init]\nproviders = provider_sect\n' +
    '[provider_sect]\ndefault = default_sect\n[default_sect]\nactivate = 1\n' +
    '[req]\ndistinguished_name = req_distinguished_name\n[req_distinguished_name]\n';
  var b = new TextEncoder().encode(cfg);
  function md(p) { try { m.FS.mkdir(p); } catch(e) {} }
  md('/ssl'); md('/usr'); md('/usr/local'); md('/usr/local/ssl');
  m.FS.writeFile('/ssl/openssl.cnf', b);
  m.FS.writeFile('/usr/local/ssl/openssl.cnf', b);
  m.FS.writeFile('/openssl.cnf', b);
  if (m.ENV) { m.ENV['OPENSSL_CONF'] = '/ssl/openssl.cnf'; m.ENV['RANDFILE'] = '/random.seed'; }
}

function writeFiles(m, files, requestId) {
  var written = {};
  for (var i = 0; i < files.length; i++) {
    try { m.FS.writeFile('/' + files[i].name, files[i].data); written[files[i].name] = true; }
    catch(e) { self.postMessage({ type: 'LOG', stream: 'stderr', message: 'Write failed: ' + files[i].name, requestId: requestId }); }
  }
  return written;
}

function scanOutputFiles(m, written, requestId) {
  try {
    var entries = m.FS.readdir('/');
    for (var i = 0; i < entries.length; i++) {
      var f = entries[i];
      if (SKIP_DIRS[f] || written[f]) continue;
      try {
        var stat = m.FS.stat('/' + f);
        if (m.FS.isFile(stat.mode)) {
          var ok = false;
          for (var j = 0; j < OUTPUT_EXTENSIONS.length; j++) { if (f.endsWith(OUTPUT_EXTENSIONS[j])) { ok = true; break; } }
          if (ok) self.postMessage({ type: 'FILE_CREATED', name: f, data: m.FS.readFile('/' + f), requestId: requestId });
        }
      } catch(e) {}
    }
  } catch(e) {}
}

// ── Command execution ─────────────────────────────────────────────────────────

async function executeCommand(command, args, inputFiles, requestId) {
  try {
    loadFactory();
    var m = await createModuleInstance(requestId);
    var useCrypto = CRYPTO_COMMANDS.indexOf(command) !== -1;
    if (useCrypto) injectEntropy(m);
    configureEnvironment(m);
    var written = writeFiles(m, inputFiles, requestId);
    var fullArgs = useCrypto ? [command, '-rand', '/random.seed'].concat(args) : [command].concat(args);
    try {
      m.callMain(fullArgs);
    } catch(e) {
      if (e && e.name === 'ExitStatus') { if (e.status !== 0) throw new Error('OpenSSL exited with status ' + e.status); }
      else throw e;
    }
    scanOutputFiles(m, written, requestId);
    self.postMessage({ type: 'DONE', requestId: requestId });
  } catch(e) {
    self.postMessage({ type: 'ERROR', error: (e && e.message) || 'Execution failed', requestId: requestId });
    self.postMessage({ type: 'DONE', requestId: requestId });
  }
}

// ── Message handler ───────────────────────────────────────────────────────────

self.addEventListener('message', function(event) {
  var msg = event.data;
  var requestId = msg.requestId;
  if (msg.type === 'LOAD') {
    try {
      loadFactory();
      self.postMessage({ type: 'READY' });
    } catch(e) {
      self.postMessage({ type: 'ERROR', error: (e && e.message) || 'Failed to load OpenSSL' });
    }
  } else if (msg.type === 'COMMAND') {
    executeCommand(msg.command, msg.args || [], msg.files || [], requestId);
  }
});
