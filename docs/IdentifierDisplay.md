# IdentifierDisplay Component

## Overview

The `IdentifierDisplay` component provides a consistent way to display identifiers (like certificate serial numbers, IDs, etc.) throughout the application with user-configurable formatting.

## Features

- **Global Context**: Uses React Context to manage display preferences across the entire application
- **Cookie Persistence**: User preferences are saved in a cookie and persist across sessions
- **Flexible Formatting**: Supports displaying identifiers with or without separators
- **User Control**: Toggle switch in the user profile menu allows users to change the display format
- **Comprehensive Coverage**: Formats all certificate identifiers including:
  - Serial Numbers
  - Subject Key Identifiers (SKI)
  - Authority Key Identifiers (AKI)
  - SHA-256 Fingerprints

## Components

### IdentifierDisplayContext

Located at: `src/contexts/IdentifierDisplayContext.tsx`

Provides global state management for identifier display preferences:
- `mode`: Current display mode (`'with-separators'` or `'without-separators'`)
- `setMode()`: Function to set the display mode
- `toggleMode()`: Function to toggle between modes

**Cookie**: `lamassu-identifier-display-mode` (expires in 1 year)

### IdentifierDisplay Component

Located at: `src/components/shared/IdentifierDisplay.tsx`

A React component that displays identifiers with formatting based on user preferences.

**Props**:
- `value` (required): The identifier string to display
- `className` (optional): Additional CSS classes
- `separator` (optional): Custom separator character (default: `:`)
- `chunkSize` (optional): Number of characters between separators (default: `2`)

**Example Usage**:
```tsx
import { IdentifierDisplay } from '@/components/shared/IdentifierDisplay';

// Basic usage
<IdentifierDisplay value="1A2B3C4D5E6F" />

// With custom className
<IdentifierDisplay value="1A2B3C4D5E6F" className="text-xs" />

// With custom separator and chunk size
<IdentifierDisplay value="1A2B3C4D5E6F" separator="-" chunkSize={4} />
```

**Output Examples**:
- **With separators**: `1A2B3C4D5E6F` → `1A:2B:3C:4D:5E:6F`
- **Without separators**: `1A2B3C4D5E6F` → `1A2B3C4D5E6F`

## User Interface

A toggle switch has been added to the user profile dropdown menu (accessible from the header):
1. Click on your user profile in the top right
2. Below "My Account", you'll see "ID Separators" with a toggle switch
3. Turn ON to display identifiers with separators (e.g., `1A:2B:3C`)
4. Turn OFF to display identifiers without separators (e.g., `1A2B3C`)

## Implementation Details

### Integration in App Layout

The `IdentifierDisplayProvider` wraps the application in `src/app/layout.tsx`:

```tsx
<IdentifierDisplayProvider>
  <React.Suspense fallback={<LoadingState />}>
    <InnerLayout>{children}</InnerLayout>
  </React.Suspense>
</IdentifierDisplayProvider>
```

### Components Updated

The following components have been updated to use `IdentifierDisplay`:
- `InformationTabContent.tsx` - CA and certificate serial numbers, SKI, AKI, and SHA-256 fingerprints
- `CertificateList.tsx` - Certificate list serial number column
- `SelectableCertificateItem.tsx` - Certificate selector items
- `CrlCheckModal.tsx` - Revoked certificate serial numbers
- `CertificateDetailsModal.tsx` - Certificate detail modal with SHA-256 fingerprint

### Identifiers Formatted

All cryptographic identifiers are now formatted consistently:
- **Serial Numbers**: Certificate and CA serial numbers
- **Subject Key Identifier (SKI)**: Certificate subject key identifiers
- **Authority Key Identifier (AKI)**: Certificate authority key identifiers (including clickable links)
- **SHA-256 Fingerprint**: Certificate fingerprints

## Technical Notes

- The component removes any existing separators (`:`, `-`, spaces) before formatting
- Hydration mismatch is prevented by not rendering the context until after client-side mount
- The preference is stored in a cookie with 1-year expiration
- The component is fully type-safe with TypeScript
- Font is monospaced (`font-mono`) by default for better readability of identifiers
