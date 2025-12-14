# Testing Infrastructure

This document describes the unit testing setup for the Lamassu Dashboard lib folder.

## Overview

The testing infrastructure uses **Vitest** as the test framework with MSW (Mock Service Worker) for API mocking. Tests are colocated with source files using the `*.test.ts` naming convention.

## Tech Stack

- **Vitest 4.x** - Fast test runner with Jest-compatible API
- **MSW 2.x** - API mocking for HTTP requests
- **@testing-library/react** - React component testing utilities
- **@testing-library/jest-dom** - DOM matchers for assertions
- **happy-dom** - Lightweight DOM implementation for Web Crypto API support

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

## Project Structure

```
src/lib/
├── *.ts                        # Source files
├── *.test.ts                   # Test files (colocated)
└── test-utils/                 # Shared testing utilities
    ├── setup.ts                # Global test setup (Vitest config)
    ├── msw-server.ts           # MSW server instance
    ├── handlers.ts             # MSW request handlers
    └── fixtures/
        └── certificates.ts     # PKI test fixtures (CSRs, certificates)
```

## Test Coverage

### Implemented Tests

1. **csr-utils.test.ts** (12 tests)
   - CSR parsing with PKI.js
   - Subject extraction and validation
   - Public key identification (RSA/ECDSA)
   - Subject Alternative Names (SANs) handling
   - Error handling for malformed input

2. **api-domains.test.ts** (21 tests)
   - API URL construction for all services
   - Environment configuration handling
   - Public API URL overrides
   - Error handling and response parsing
   - URL structure validation

3. **ca-utils.test.ts** (19 tests)
   - Recursive CA tree filtering
   - Status-based filtering (active, expired, revoked)
   - Type-based filtering (MANAGED, IMPORTED, EXTERNAL)
   - Text search filtering
   - Combined filter logic
   - Hierarchy preservation

### Coverage Goals

| Module Type | Target Coverage | Status |
|-------------|----------------|--------|
| PKI parsing (csr-utils) | 90%+ | ✅ Implemented |
| Configuration (api-domains) | 85%+ | ✅ Implemented |
| Utilities (ca-utils) | 95%+ | ✅ Implemented |
| API clients | 85%+ | 🔜 Planned |
| Static data | 50% | ⏭️ Optional |

## Writing Tests

### Basic Test Structure

```typescript
import { describe, it, expect } from 'vitest'
import { myFunction } from './my-module'

describe('my-module', () => {
  describe('myFunction', () => {
    it('should handle valid input', () => {
      const result = myFunction('valid-input')
      expect(result).toBe('expected-output')
    })

    it('should throw on invalid input', () => {
      expect(() => myFunction('invalid')).toThrow('error message')
    })
  })
})
```

### Testing API Calls with MSW

```typescript
import { http, HttpResponse } from 'msw'
import { server } from './test-utils/msw-server'

describe('api-module', () => {
  it('should handle API success', async () => {
    server.use(
      http.get('/api/endpoint', () => {
        return HttpResponse.json({ data: 'test' })
      })
    )

    const result = await fetchData()
    expect(result.data).toBe('test')
  })

  it('should handle API error', async () => {
    server.use(
      http.get('/api/endpoint', () => {
        return new HttpResponse(null, { status: 500 })
      })
    )

    await expect(fetchData()).rejects.toThrow()
  })
})
```

### Using PKI Test Fixtures

```typescript
import { VALID_CSR_PEM, CSR_WITH_SANS_PEM } from './test-utils/fixtures/certificates'

describe('certificate-parsing', () => {
  it('should parse valid CSR', async () => {
    const result = await parseCsr(VALID_CSR_PEM)
    expect(result.error).toBeUndefined()
    expect(result.subject).toContain('CN=example.com')
  })
})
```

## Configuration

### vitest.config.ts

Key configuration options:

- **Environment**: `happy-dom` for Web Crypto API support
- **Setup Files**: `src/lib/test-utils/setup.ts` for global mocks
- **Coverage Provider**: `v8` with HTML/JSON/text reporters
- **Path Aliases**: `@/*` mapped to `src/*`

### Test Setup (setup.ts)

Global setup includes:

- MSW server initialization and cleanup
- Window.lamassuConfig mock for API endpoint configuration
- Web Crypto API polyfill (Node.js crypto.webcrypto)
- Base64 encoding/decoding (atob/btoa) polyfills

## Best Practices

1. **Colocate Tests**: Place `*.test.ts` files next to source files
2. **Use Fixtures**: Reuse PKI fixtures for consistent test data
3. **Mock APIs**: Use MSW handlers for external API calls
4. **Test Error Paths**: Always test error handling, not just success cases
5. **Descriptive Names**: Use clear, descriptive test names
6. **Arrange-Act-Assert**: Follow AAA pattern in test structure
7. **Cleanup**: Reset MSW handlers between tests (handled automatically)

## Known Limitations

1. **SANs Parsing**: PKI.js may not fully parse CSR extension requests in all cases
2. **Web Crypto API**: Requires happy-dom or browser environment
3. **Async Operations**: PKI.js operations are async (use `await`)

## Adding New Tests

To add tests for a new lib module:

1. Create `module-name.test.ts` next to the source file
2. Import test utilities from `./test-utils/`
3. Add MSW handlers if the module makes API calls
4. Follow existing test structure and patterns
5. Run tests to verify: `npm test`

## Troubleshooting

### Tests fail with "Cannot find module @/*"
- Ensure `vitest.config.ts` has path alias configuration
- Check that `tsconfig.json` includes the test files

### Web Crypto API errors
- Verify `happy-dom` is installed
- Check that `setup.ts` includes crypto polyfill
- Consider using Vitest browser mode for complex crypto operations

### MSW request not intercepted
- Verify handler is added to `handlers.ts`
- Check that URL matches exactly (including protocol)
- Ensure MSW server is running (check `setup.ts`)

### Fixture-related errors
- Verify fixture files are valid PEM format
- Check that import paths are correct
- Ensure fixtures match the expected format for the library

## Future Enhancements

- [ ] Add tests for remaining API client modules (7 modules)
- [ ] Add tests for ca-data.ts certificate parsing (highest priority)
- [ ] Add snapshot testing for parsed certificate structures
- [ ] Add integration tests for multi-module workflows
- [ ] Add performance benchmarks for PKI operations
- [ ] Generate ECDSA test fixtures for ECDSA-specific tests
