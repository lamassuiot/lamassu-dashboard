# PoC de microfrontends para Lamassu Dashboard — Diseño

Fecha: 2026-11-09 · Estado: borrador para aprobación

## 1. Intención y porqué

Lamassu tiene muchos microservicios en backend y vendrán más. Parte del producto es
open source y parte es enterprise, y **cada cliente enterprise contrata una
combinación distinta de módulos** (unos X+Y, otros Y+Z…).

El frontal tiene que seguir el mismo modelo:

- El dashboard open source funciona por sí solo con los módulos open source.
- Los módulos enterprise se desarrollan en repos privados, se compilan y despliegan
  por separado, y se "enchufan" al dashboard en runtime.
- El código enterprise **nunca** aparece en el repo público ni en el bundle público.
- Activar un módulo para un cliente **no** requiere recompilar el dashboard.

La técnica elegida es **Module Federation** (`@module-federation/vite`) con
**descubrimiento dinámico** de remotes a partir de un manifiesto en runtime.
Restricciones de base: SPA, React, Vite, desplegable como ficheros estáticos.

## 2. Qué demuestra el PoC

Tres piezas:

1. **Shell**: el dashboard actual convertido en host de Module Federation, capaz de
   cargar remotes declarados en un manifiesto.
2. **Plantilla (esqueleto)**: el proyecto que se copia para crear cada microfrontend
   nuevo, con todo el cableado ya resuelto.
3. **PoC Service**: una instancia de la plantilla, cargada por el shell solo
   añadiéndola al manifiesto.

Criterio de éxito: con el shell ya compilado, añadir la entrada de PoC Service a
`modules.json` hace que aparezca en el menú y su página funcione dentro del layout
del shell (mismo router, mismo tema, mismo token), sin recompilar el shell. Quitar
la entrada lo hace desaparecer.

## 3. Objetivos, no-objetivos y anti-objetivos

**Objetivos**

- Shell que lee `modules.json` en runtime, registra remotes, añade rutas y menú.
- Contrato público y versionado entre shell y módulos (SDK open source).
- Plantilla copiable que funciona tanto dentro del shell como en modo standalone.
- PoC Service funcionando en local contra el shell.

**No-objetivos (fuera del PoC)**

- Extraer los módulos actuales (CAs, dispositivos, RAs…) a remotes. Se quedan dentro
  del shell como están.
- Chart de Helm, generación automática de `modules.json` desde values, despliegue en
  S3/CloudFront.
- Compartir los componentes shadcn del shell vía federation.
- Control de licencias en frontend. La autorización real la impone el backend: si un
  cliente no tiene desplegado el microservicio X, añadir X al manifiesto a mano no le
  da nada.
- Repos separados y publicación del SDK: plantilla, PoC Service y SDK viven de momento
  en este repo.

**Anti-objetivos (fracaso aunque "funcione")**

- Que el bundle del shell contenga nombres, rutas o código de módulos concretos.
- Que un remote caído o con error rompa el shell o el resto de páginas.
- Que un módulo tenga que conocer OIDC, gestionar su propio login o crear su propio
  `BrowserRouter`.
- Que crear un módulo nuevo exija tocar el código del shell.

## 4. Estado actual relevante

- `src/main.tsx`: `BrowserRouter` con rutas generadas por
  `import.meta.glob('./app/**/page.tsx')`, envueltas en `RootLayout`.
- `src/app/layout.tsx:105`: `navigationConfig` hardcodeado (grupos → items con
  `href`, `label`, icono lucide y `uiAuthzCapabilities`). `isNavItemVisible` filtra por
  capabilities globales y hay un efecto que redirige a `/` si la ruta actual exige una
  capability que el usuario no tiene.
- Config runtime: `public/config.js` → `window.lamassuConfig`, generado en el
  contenedor por `docker-entrypoint.sh` con `envsubst` desde `config.js.tmpl`.
  `ConfigContext` hace polling hasta encontrarlo.
- Auth: `AuthContext` (`oidc-client-ts`), `useAuth()` → `user.access_token`. Auth
  puede estar deshabilitada (token nulo).
- API: `src/lib/api-domains.ts` resuelve `LAMASSU_API`.
- Estilos: Tailwind v4 con `@theme` en `src/app/globals.css` que mapea a variables
  CSS (`--background`, `--primary`…) definidas en `:root` y `.dark`.
- Stack: React 19, react-router 7, Vite 8, pnpm 12. `pnpm-workspace.yaml` existe
  pero solo con ajustes, sin `packages:`.
- Despliegue: imagen Nginx estática (`nginx.conf`, puerto 8085, fallback SPA).

## 5. Diseño

### 5.1 Estructura del repo

El repo pasa a ser un workspace pnpm. **El shell sigue siendo la raíz** (no se mueve
nada de `src/`), para no perturbar el código existente.

```
/                         # shell (dashboard actual)
packages/
  mfe-sdk/                # @lamassu/mfe-sdk — contrato público (open source)
microfrontends/
  template/               # esqueleto a copiar
  poc-service/            # instancia de la plantilla
```

### 5.2 Manifiesto de módulos (`/modules.json`)

Fichero estático servido junto a `index.html`, independiente de `config.js` para
poder montarlo como ConfigMap por cliente. Si no existe (404) o está vacío, el shell
arranca sin módulos externos — es el caso open source por defecto.

Contiene **todo lo necesario para pintar el menú sin descargar ningún remote**; el
remote solo se descarga al navegar a su ruta.

Forma orientativa (el tipo exacto lo define el SDK):

```json
{
  "version": 1,
  "modules": [
    {
      "name": "poc_service",
      "entry": "http://localhost:9010/remoteEntry.js",
      "basePath": "/poc-service",
      "nav": {
        "group": "ENTERPRISE",
        "label": "PoC Service",
        "icon": "flask-conical",
        "uiAuthzCapabilities": "pki.poc.something"
      }
    }
  ]
}
```

- `entry` admite URL `http(s)` absoluta o ruta relativa al origen; cualquier otro
  esquema (`data:`, `javascript:`…) o valor que no sea una URL válida se descarta. En
  producción será relativa (`/ui/modules/poc-service/remoteEntry.js`), servida por la
  misma ingress.
- `name` debe ser un identificador válido de Module Federation y único.
- `nav.group` puede ser un grupo existente del menú (se añade al final) o uno nuevo
  (se añade tras los grupos nativos).
- `nav.icon` es un nombre de icono lucide; desconocido → icono genérico.
- `nav.uiAuthzCapabilities` opcional, misma semántica que en `navigationConfig`.
- El shell valida el manifiesto (zod, ya es dependencia). Entradas inválidas se
  descartan con `console.warn`; no rompen las demás. La petición de `/modules.json`
  tiene un tiempo máximo (5 s): si se agota, el shell arranca sin módulos externos.

**Frontera de confianza.** `entry` se descarga y se ejecuta como código dentro del
origen del dashboard, que tiene acceso a los tokens OIDC. Por tanto `modules.json` es
**configuración equivalente a código**: quien pueda escribirlo puede ejecutar código en
la sesión de cada usuario. Debe protegerse igual que la imagen del shell (ConfigMap con
permisos restringidos). En producción se recomiendan entradas del mismo origen y una
política CSP con `script-src 'self'`; las entradas de otro origen (p. ej.
`localhost:9010`) son solo para desarrollo.

### 5.3 Contrato: `@lamassu/mfe-sdk`

Paquete open source del workspace. Exporta:

- **Tipos** del manifiesto (`ModulesManifest`, `ModuleDescriptor`) y su esquema zod.
- **`ShellApi`**: lo que el shell entrega a cada módulo.
  - `getAccessToken(): string | null` (lectura en el momento de la llamada, para
    respetar renovaciones silenciosas).
  - `apiBaseUrl: string` y `publicApiUrl: string`.
  - `hasCapability(key: string, action = 'ui'): boolean` *(decisión de diseño)*:
    `true` si la lista de acciones de `key` en las capabilities globales incluye
    `action`. Por defecto `'ui'`, igual que `isNavItemVisible`; el parámetro permite a
    los módulos condicionar botones (`create`, `delete`…). Si las capabilities no
    están disponibles (`globalCapabilities === null`, p. ej. auth deshabilitada),
    devuelve `true`, igual que el menú.
  - `basePath: string` (el del módulo).
  - `theme: 'light' | 'dark'`.
  - `notify` (éxito/error, delegando en el sistema de toasts del shell).
- **`ShellProvider` / `useShell()`**: contexto React para usar `ShellApi` dentro del
  módulo.
- **`ModuleDefinition`**: lo que el remote expone (ver 5.4).
- **`SDK_CONTRACT_VERSION`**: el shell comprueba la versión mayor del contrato del
  módulo y rechaza (con error visible en su página) los incompatibles.
- `theme.css`: el bloque `@theme` que mapea los tokens de color/radio/fuente de
  Tailwind a las variables CSS del shell, para que los módulos lo importen en vez de
  copiarlo.

**El `ShellApi` se pasa como prop**, y el módulo monta su propio `ShellProvider` con
él. Así `useShell()` funciona aunque el SDK no se resuelva como singleton. Los
singletons obligatorios son solo `react`, `react-dom` y `react-router`.

**Política de compatibilidad** *(decisión de diseño)*:

- `SDK_CONTRACT_VERSION` es un entero igual a la versión mayor del paquete SDK.
- El contrato incluye las versiones mayores de los singletons. Subir la mayor de
  `react`, `react-dom` o `react-router` en el shell obliga a subir la mayor del SDK.
  Así los módulos compilados contra la versión anterior se rechazan con un error
  visible, en lugar de fallar de forma impredecible.
- En la config `shared` de shell y plantilla: `singleton: true` con `requiredVersion`
  acotado a la mayor (`^19`, `^7`). La copia del shell es siempre la que se usa;
  Module Federation solo avisa por consola si hay desajuste de menor/parche.
- `RemoteModuleHost` comprueba solo `contractVersion` antes de renderizar.

**Distribución del SDK (decidido):** en el PoC el SDK solo vive en este repo. Shell,
plantilla y PoC Service lo consumen con `workspace:*` y pueden leer su código TS
directamente; no hace falta paso de build, `.d.ts` ni publicación. Copiar la plantilla
fuera del repo queda fuera del PoC. El README de la plantilla lo indica y deja
anotado que, para usarla fuera, primero habrá que publicar el SDK. Aun así, el
paquete tiene `name`, `version` y un `exports` que incluye `theme.css`, para que
publicarlo más adelante no obligue a cambiar los imports.

### 5.4 Qué expone un remote

Un único expose: `./module`, que exporta por defecto un `ModuleDefinition`:

```ts
{
  contractVersion: number;            // SDK_CONTRACT_VERSION con el que se compiló
  Root: React.ComponentType<{ shell: ShellApi }>;
}
```

`Root` renderiza `<Routes>` relativas: el shell lo monta en
`<Route path={basePath + '/*'}>`, de modo que el módulo gestiona sus subrutas con el
router del shell. Menú y metadatos no vienen del remote sino del manifiesto (5.2).

### 5.5 Cambios en el shell

1. **Carga del manifiesto** antes de pintar rutas (`ModulesProvider` envuelve el router,
   fuera de `ConfigProvider`: el manifiesto no depende de la configuración). Un
   `ModulesContext` expone la lista validada y su estado de carga.
2. **Registro**: `registerRemotes` del runtime de Module Federation con
   `type: 'module'` para cada entrada válida.
3. **Rutas**: en `AppRoutes` (`src/main.tsx`), una ruta `basePath/*` por módulo, antes
   del catch-all `*`. El elemento es un `RemoteModuleHost` que hace
   `loadRemote('<name>/module')` de forma perezosa, comprueba `contractVersion`, y
   renderiza `Root` con el `ShellApi`. Está envuelto en un error boundary y un
   `Suspense` propios: si falla la descarga o el render, muestra un error dentro del
   área de contenido (con el nombre del módulo y un botón de reintentar), sin tumbar el
   layout.
4. **Menú**: `layout.tsx` combina `navigationConfig` con las entradas derivadas del
   manifiesto antes de filtrar, de modo que `isNavItemVisible` y la redirección por
   capability se aplican igual a módulos externos.
5. **Federation host**: `@module-federation/vite` en `vite.config.mjs` con
   `name: 'lamassu_shell'`, sin `remotes` estáticos, y `shared` singletons para
   `react`, `react-dom`, `react-router`.
6. **Dev**: `public/modules.json` de ejemplo apuntando a PoC Service en local. Debe
   quedar fuera del build público o vacío por defecto (decisión del builder; ver 7).

Lo que **no** cambia: las páginas existentes, `AuthContext`, `api-domains`, el
Dockerfile del shell (más allá de que el build funcione con el workspace).

### 5.6 La plantilla (`microfrontends/template`)

Proyecto Vite + React + TypeScript listo para copiar:

- `vite.config.ts` con `@module-federation/vite`: `name` derivado del paquete,
  `filename: 'remoteEntry.js'`, `exposes: { './module': './src/module.tsx' }`, mismos
  singletons que el shell, puerto de dev propio y CORS habilitado en dev.
- `src/module.tsx`: el `ModuleDefinition`.
- `src/routes/`: una página de ejemplo que usa `useShell()` para hacer una llamada
  autenticada a la API.
- **Modo standalone** (`pnpm dev:standalone` o similar): un `main.tsx` que crea su
  propio `BrowserRouter` y un `ShellApi` de pega (token desde env, API desde env) para
  desarrollar el módulo sin el shell. Solo existe en dev; no se expone.
- **Estilos**: Tailwind v4 importando el `theme.css` del SDK y **solo** capas de
  `theme` y `utilities`, sin preflight (el shell ya lo aplica). Los tokens de color
  vienen de las variables CSS del shell en runtime, así que el modo claro/oscuro
  funciona sin hacer nada. **Las utilidades del módulo llevan el prefijo `mfe:`**
  (`mfe:p-4`, `mfe:md:grid-cols-2`): sin prefijo, el CSS del módulo y el del shell
  acaban en el mismo documento y el que se carga después pisa al otro (p. ej. el
  `p-4` del módulo anulaba el `md:p-6` del contenido de todas las páginas nativas).
- Componentes UI: los que necesite se copian de shadcn dentro del módulo (los del
  shell no se comparten en este PoC).
- `module.json`: el fragmento de manifiesto propio del módulo (lo que habría que añadir
  a `modules.json`), como fuente de verdad para el futuro generador de Helm.
- `Dockerfile` + `nginx.conf` para servirlo bajo `/ui/modules/<nombre>/`, con
  `remoteEntry.js` en `no-cache` y assets con hash como `immutable`.
- `README.md` con los pasos para crear un módulo nuevo a partir de la plantilla.

### 5.7 PoC Service (`microfrontends/poc-service`)

Copia de la plantilla siguiendo su README (es también la prueba de que el README
basta). Dos páginas mínimas bajo `/poc-service` para demostrar subrutas, una de ellas
con una llamada autenticada a un endpoint real ya existente del backend (p. ej. el de
salud/estadísticas de CA) para demostrar que el token del shell llega y funciona.

### 5.8 Despliegue objetivo (contexto, no se implementa)

Cada microfrontend es una imagen propia desplegada en Helm junto a su microservicio,
servida por la misma ingress en `/ui/modules/<nombre>/` (mismo origen → sin CORS).
`modules.json` se genera a partir de los subcharts habilitados por cliente. Las
imágenes enterprise van a un registry privado. Para el shell un remote es solo una
URL, así que S3/CloudFront sigue siendo posible cambiando las `entry`.

## 6. Verificación

- Unit tests (vitest) para: validación del manifiesto (entradas inválidas se
  descartan), fusión del menú con capabilities, y `RemoteModuleHost` mostrando error
  ante fallo de carga y ante `contractVersion` incompatible.
- `pnpm run typecheck`, `pnpm run lint`, `pnpm run build` del shell en verde.
- Build de la plantilla y de PoC Service en verde.
- Prueba manual documentada: shell en `:9002` + PoC Service en su puerto; con y sin la
  entrada en `modules.json`; con PoC Service parado (el shell sigue funcionando y la
  página del módulo muestra el error); en modo claro y oscuro.
- Dos comprobaciones añadidas tras la revisión: con el módulo ya cargado, una página
  nativa conserva su layout (mismo padding que antes de visitarlo, a ancho ≥ md); y con
  dos módulos, navegar de uno a otro nunca renderiza el primero con el `ShellApi` del
  segundo. Una entrada con `entry` inválida se descarta sin dejar el shell en la pantalla
  de carga.
- Comprobación de anti-objetivo: `grep` del bundle `out/` del shell sin la cadena
  `poc` (salvo si `modules.json` de ejemplo se empaqueta; ver 7).

## 7. Decisiones dejadas al builder

- Mecanismo para que `public/modules.json` de ejemplo no acabe en la imagen pública
  (p. ej. servirlo solo en dev, o que el build público use uno vacío).
- Implementación del nombre de icono → componente lucide.
- Nombres concretos de scripts, puertos de dev de los remotes y del endpoint de
  ejemplo.
- Si `@module-federation/vite` no soporta Vite 8 / React 19 en su versión actual, el
  primer paso del plan debe comprobarlo con un spike mínimo y, si falla, proponer la
  alternativa (fijar versión compatible del plugin o usar `@module-federation/runtime`
  directamente) antes de seguir.
