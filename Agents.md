# Agent Instructions for Lamassu Dashboard

## Project Overview
Lamassu Dashboard is a modern web-based user interface for managing X.509 certificates and Public Key Infrastructure (PKI). It provides comprehensive certificate lifecycle management including Certificate Authorities (CAs), Registration Authorities (RAs), certificate issuance, revocation, validation, and device identity management. **Security and user experience are the highest priorities** - all PKI operations must maintain strict cryptographic standards while providing intuitive workflows for both technical and non-technical users.

## Architecture & Repository Overview

**Core Components:**
- **Certificate Management**: Full lifecycle management of X.509 certificates
- **CA Management**: Create, import, and manage Certificate Authorities
- **RA Management**: Configure Registration Authorities with EST protocol support
- **Device Management**: IoT device identity and certificate lifecycle
- **Validation Services**: OCSP and CRL-based certificate validation
- **Platform Integrations**: AWS KMS, PKCS#11, and cloud connector support
- **Authentication**: OIDC-based authentication with configurable providers

**Repository Details:**
- **Size & Type:** Medium-scale TypeScript/Next.js project (~50k lines) focused on PKI management dashboard with comprehensive certificate handling
- **Primary Language:** TypeScript with Next.js 15.x framework
- **Key Frameworks:** Next.js (App Router), React 18, ShadCN UI, Tailwind CSS
- **Authentication:** OIDC Client (oidc-client-ts) for OpenID Connect integration
- **Cryptography:** PKI.js and ASN1.js for certificate parsing and CSR generation
- **Container Technology:** Docker with multi-stage builds and Nginx serving
- **Deployment:** Static export with runtime configuration injection

**Core Dependencies:**
- **Next.js 15.3+**: React framework with App Router and static export
- **PKI.js/ASN1.js**: Certificate parsing, validation, and CSR generation
- **OIDC Client**: OpenID Connect authentication integration
- **ShadCN UI**: Component library built on Radix UI primitives
- **Tailwind CSS**: Utility-first CSS framework for styling

## Key Development Workflows

### Project Structure & Architecture

**Core Directory Layout:**
```
├── src/
│   ├── app/                           # Next.js App Router pages
│   │   ├── certificate-authorities/   # CA management pages
│   │   │   ├── details/               # CA details and operations
│   │   │   ├── issue-certificate/     # Certificate issuance workflow
│   │   │   ├── new/                   # CA creation
│   │   │   └── requests/              # CA certificate requests
│   │   ├── certificates/              # Certificate management
│   │   │   └── details/               # Certificate details and operations
│   │   ├── registration-authorities/  # RA management
│   │   │   ├── cacerts/               # RA CA certificates
│   │   │   └── new/                   # RA creation
│   │   ├── verification-authorities/  # VA management
│   │   ├── devices/                   # Device identity management
│   │   │   └── details/               # Device details and certificates
│   │   ├── signing-profiles/          # Certificate signing profiles
│   │   │   ├── edit/                  # Profile editing
│   │   │   └── new/                   # Profile creation
│   │   ├── integrations/              # Platform integrations
│   │   │   ├── configure/             # Integration configuration
│   │   │   └── new/                   # New integration setup
│   │   ├── crypto-engines/            # Crypto engine management
│   │   ├── kms/keys/                  # Key management service
│   │   ├── alerts/                    # System alerts and notifications
│   │   ├── tools/certificate-viewer/  # Certificate inspection tools
│   │   └── settings/                  # Application settings
│   ├── components/                    # React components
│   │   ├── alerts/                    # Alert management components
│   │   ├── ca/                        # CA-specific components
│   │   ├── devices/                   # Device management components
│   │   ├── home/                      # Dashboard home components
│   │   ├── shared/                    # Shared utility components
│   │   └── ui/                        # Base UI components (ShadCN)
│   ├── contexts/                      # React contexts
│   │   └── AuthContext.tsx            # OIDC authentication context
│   ├── hooks/                         # Custom React hooks
│   ├── lib/                           # Core business logic
│   │   ├── actions/                   # Server actions
│   │   ├── alerts-api.ts              # Alerts API client
│   │   ├── api-domains.ts             # API endpoint configuration
│   │   ├── ca-data.ts                 # CA data and operations
│   │   ├── ca-utils.ts                # CA utility functions
│   │   ├── csr-utils.ts               # CSR parsing and utilities
│   │   ├── devices-api.ts             # Device API client
│   │   ├── dms-api.ts                 # DMS (RA) API client
│   │   ├── est-api.ts                 # EST protocol API client
│   │   ├── integrations-api.ts        # Platform integrations API
│   │   ├── va-api.ts                  # Validation Authority API
│   │   └── utils.ts                   # General utilities
│   └── types/                         # TypeScript type definitions
│       ├── certificate.ts             # Certificate-related types
│       └── crypto-engine.ts           # Crypto engine types
├── public/                            # Static assets
│   ├── config.js                      # Runtime configuration
│   ├── footer.html                    # Custom footer content
│   ├── themes/                        # Custom theme assets
│   └── wasm_exec.js                   # WebAssembly execution support
├── config.js.tmpl                     # Configuration template for Docker
├── docker-entrypoint.sh               # Container startup script
├── Dockerfile                         # Multi-stage Docker build
├── nginx.conf                         # Nginx configuration for serving
├── next.config.ts                     # Next.js configuration
└── package.json                       # Dependencies and scripts
```

**Critical Configuration Files:**
- **`next.config.ts`** - Next.js configuration with static export enabled
- **`package.json`** - Dependencies, scripts, and project metadata
- **`tailwind.config.ts`** - Tailwind CSS configuration with custom theme
- **`public/config.js`** - Runtime configuration for API endpoints and auth
- **`config.js.tmpl`** - Template for Docker environment variable injection

**Key Integration Points:**
- **Authentication:** `src/contexts/AuthContext.tsx` handles OIDC integration
- **API Layer:** `src/lib/api-domains.ts` configures backend service endpoints
- **Certificate Operations:** `src/lib/ca-data.ts` and `src/lib/csr-utils.ts`
- **UI Components:** `src/components/ui/` contains ShadCN base components

**Testing Infrastructure:**
- **Type Checking:** TypeScript compiler with strict mode enabled
- **Linting:** ESLint with Next.js configuration and unused imports plugin
- **Development:** Hot reloading with Turbopack for fast iteration

### Build & Development Workflow

**Critical Prerequisites:**
- **Node.js 20+ required** - verified compatible version for Next.js 15
- **npm or pnpm** - package manager for dependency installation
- **Docker with multi-stage support** - required for containerized builds

**Essential Build Commands:**
```bash
# Development server with hot reloading
npm run dev                 # Starts on port 9002 with Turbopack (~30 seconds)

# Production build and export
npm run build              # Creates optimized static export in out/ (~2-3 minutes)

# Code quality and validation
npm run lint               # ESLint code analysis (~30 seconds)
npm run fix               # Auto-fix ESLint issues (~30 seconds)
npm run typecheck         # TypeScript type checking (~1 minute)

# Production server (after build)
npm run start             # Serves built application

# Docker operations
docker build -t lamassu-ui:latest .    # Multi-stage build (~5-8 minutes)
docker run -p 9002:80 lamassu-ui       # Run containerized application
```

**Critical Build Issues & Solutions:**
- **Module resolution errors** - ensure all imports use correct relative paths
- **Type errors** - run `npm run typecheck` before building
- **Missing environment variables** - check `public/config.js` configuration
- **Docker context issues** - ensure all required files are in build context
- **Next.js static export** - verify `output: 'export'` in `next.config.ts`

**Development Environment Setup:**
1. Install Node.js 20+ and npm/pnpm
2. Clone repository: `git clone https://github.com/lamassuiot/lamassu-dashboard`
3. **Always run `npm install` after fresh clone**
4. **Copy and configure `public/config.js` for local development**
5. **Run `npm run dev` to start development server on port 9002**
6. **Always run `npm run lint` and `npm run typecheck` before committing**

### Testing Strategy

**Code Quality & Validation:**
- **Type Checking**: TypeScript strict mode with comprehensive type coverage
  ```bash
  npm run typecheck          # Validate all TypeScript types (~1 minute)
  ```
- **Linting**: ESLint with Next.js configuration and custom rules
  ```bash
  npm run lint              # Check code style and potential issues (~30 seconds)
  npm run fix               # Auto-fix linting issues (~30 seconds)
  ```
- **Build Validation**: Static export verification
  ```bash
  npm run build             # Validate complete build process (~2-3 minutes)
  ```

**Manual Testing Workflows:**
- **Certificate Operations**: Test CA creation, certificate issuance, and revocation
- **Authentication**: Verify OIDC login/logout flows with different providers
- **Device Management**: Test device enrollment and certificate lifecycle
- **API Integration**: Validate backend service communication
- **Responsive Design**: Test UI across different screen sizes and devices

**Testing Best Practices:**
- **Always run `npm run typecheck` before submitting changes** - catches type errors early
- **Test authentication flows in different environments** - dev, staging, production
- **Verify certificate operations with real PKI data** - ensure cryptographic accuracy
- **Test Docker builds locally** - validate containerization before deployment

### Development Guidelines & Patterns

Make sure that there is a new line at the end of any file you edit. This is a common convention in TypeScript and many other programming languages.

**Next.js App Router Patterns:**
1. **Page Components** (`src/app/` directory): Use React Server Components where possible, Client Components for interactivity
2. **Component Organization** (`src/components/` directory): Group by feature, shared components in `shared/`
3. **API Integration** (`src/lib/` directory): Centralized API clients with consistent error handling

**Certificate Management Development:**
- **CSR Generation**: Use PKI.js for browser-based key generation and CSR creation
- **Certificate Parsing**: Leverage ASN1.js and PKI.js for certificate inspection
- **PEM Handling**: Consistent base64 encoding/decoding for certificate data
- **Validation**: Implement proper certificate chain validation and expiry checking

**UI/UX Standards:**
- Follow ShadCN UI component patterns with Tailwind CSS
- Implement responsive design for mobile and desktop usage
- Use consistent loading states and error handling
- Provide clear feedback for all certificate operations
- Implement proper form validation with user-friendly error messages

**Code Standards:**
- Follow TypeScript strict mode conventions
- Use proper React hooks patterns (useState, useEffect, useCallback)
- Implement error boundaries for robust error handling
- Use consistent naming conventions for files and functions
- Prefer composition over inheritance for component design

### Security Considerations
**Security is paramount** - every component must be designed with security-first principles:

- **Critical**: Validate and sanitize all certificate data before processing
- **Mandatory**: Implement strict input validation for all forms and file uploads
- **Essential**: Use secure defaults for all PKI operations and configurations
- **Required**: Ensure private key generation happens client-side only when appropriate
- **Must**: Validate certificate chains and expiry dates before acceptance
- **Always**: Log security-relevant operations for audit purposes
- **Never**: Expose private keys, tokens, or sensitive data in logs or client state

### Performance Guidelines
**Performance is critical** - dashboard responsiveness directly impacts user productivity:

- **Critical**: Minimize API calls and implement proper loading states
- **Mandatory**: Use React.memo and useMemo for expensive certificate parsing operations
- **Essential**: Implement pagination for large certificate lists
- **Required**: Optimize bundle size with proper code splitting
- **Always**: Provide immediate UI feedback for user actions
- **Never**: Block the UI thread with synchronous certificate operations
- **Never**: Load entire certificate databases without pagination

### PKI.js and ASN1.js Integration
Lamassu Dashboard heavily relies on **PKI.js** and **ASN1.js** for client-side cryptographic operations:

- **Certificate Parsing**: Parse X.509 certificates to extract subject, issuer, validity, and extensions
- **CSR Generation**: Create PKCS#10 Certificate Signing Requests in the browser
- **Key Generation**: Generate RSA and ECDSA key pairs for certificate requests
- **Chain Validation**: Validate certificate chains and trust relationships
- **PEM Encoding**: Convert between binary and PEM formats for certificate data
- **Extension Handling**: Process certificate extensions like SANs, key usage, and basic constraints

**Key Integration Points:**
- `src/lib/csr-utils.ts`: CSR parsing and validation using PKI.js
- `src/app/certificate-authorities/issue-certificate/`: Browser-based key generation and CSR creation
- `src/components/CertificateDetailsModal.tsx`: Certificate parsing and display
- `src/lib/ca-utils.ts`: Certificate chain building and validation

### OIDC Authentication Integration
Lamassu Dashboard uses **oidc-client-ts** for OpenID Connect authentication:

- **User Management**: Handle user login, logout, and session management
- **Token Management**: Automatic token refresh and storage
- **Silent Renewal**: Background token renewal to maintain sessions
- **Provider Support**: Compatible with various OIDC providers (Keycloak, Auth0, etc.)
- **Security**: Secure token storage and PKCE flow support

**Key Integration Points:**
- `src/contexts/AuthContext.tsx`: Main authentication context and user management
- `src/app/signin-callback/`: OIDC sign-in callback handling
- `src/app/signout-callback/`: OIDC sign-out callback handling
- `src/app/silent-renew-callback/`: Silent token renewal callback

### Configuration Management
The application supports runtime configuration through multiple mechanisms:

**Runtime Configuration (`public/config.js`):**
- **API Endpoints**: Configure backend service URLs
- **Authentication**: OIDC provider settings and client configuration
- **Features**: Enable/disable features like custom footer and developer options
- **Integrations**: Configure available platform connectors

**Docker Configuration (`config.js.tmpl`):**
- **Environment Variables**: Inject configuration at container startup
- **Template Processing**: Use envsubst for environment variable substitution
- **Deployment Flexibility**: Different configurations per environment

**Development Configuration:**
- **Local Development**: Direct configuration in `public/config.js`
- **Environment Variables**: Next.js environment variable support
- **Feature Toggles**: Developer-only menu items and debugging features

### Common Patterns
- Use `useAuth()` hook for authentication state and operations
- Implement proper loading states with Skeleton components
- Use React Hook Form for complex form validation
- Follow the ShadCN UI component composition patterns
- Implement proper error boundaries and fallback UI
- Use TypeScript strict mode for enhanced type safety

### Communication Guidelines
When contributing to Lamassu Dashboard, maintain clear and user-focused communication:

**Code & Documentation:**
- Write self-documenting code with meaningful component and function names
- Keep comments focused on complex PKI logic and business rules
- Use clear, descriptive commit messages that explain user-facing changes
- Structure PR descriptions with context, changes made, and testing approach

**Error Messages:**
- Provide actionable error messages that guide users toward solutions
- Include relevant context (certificate names, CA information, validation errors)
- Use plain language that both developers and PKI operators can understand
- Suggest next steps or point to documentation when appropriate

**PKI Operations:**
- Write clear validation messages for certificate and CSR operations
- Include specific details about what validation failed and why
- Provide examples of correct certificate formats when possible
- Use consistent terminology aligned with PKI standards and industry practices

**Response Style:**
- Provide actionable error messages that guide users toward solutions
- Include relevant context (resource names, paths, constraint violations)
- Use plain language that both developers and operators can understand
- Suggest next steps when appropriate

## CI/CD & Validation

**Development Workflow:**
- **Type Safety** - TypeScript strict mode catches errors at compile time
- **Code Quality** - ESLint with Next.js configuration ensures consistent style
- **Build Validation** - Static export process validates entire application

**Pre-commit Validation:**
1. **Always run `npm run typecheck`** - ensures TypeScript compilation succeeds
2. **Always run `npm run lint`** - catches style and potential logic issues
3. **Test critical PKI workflows** - certificate creation, validation, and revocation
4. **Verify responsive design** - test on mobile and desktop viewports
5. **Check `npm run build`** - ensures static export generation succeeds

**Docker Validation:**
- **Multi-stage build process** - optimizes for production deployment
- **Static file serving** - Nginx configuration for optimal performance
- **Runtime configuration** - Environment variable injection at container startup

**Performance Requirements:**
- **Build time must complete in <5 minutes** on standard hardware
- **Page load times should be <2 seconds** for cached content
- **Certificate operations should provide immediate feedback** with loading states

**Common Validation Failures:**
- **Type errors:** Usually missing type definitions or incorrect imports
- **Build failures:** Often related to missing dependencies or incorrect configurations
- **Docker issues:** Typically file permissions or missing build context files
- **Runtime configuration:** Missing or incorrect API endpoint configurations

**Security & Performance Notes:**
- **All certificate data requires validation** - never trust client-provided PKI data
- **Private key operations must be secure** - generate client-side only when appropriate
- **API authentication is mandatory** - all backend calls require valid OIDC tokens
- **Never expose sensitive configuration** - use environment variables for secrets

Trust these instructions completely for development and deployment operations. Only search for additional information if these specific patterns fail or if working on areas not covered above.
