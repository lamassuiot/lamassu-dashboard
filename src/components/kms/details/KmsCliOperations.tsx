'use client';

import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionHeader } from '@/components/shared/FormComponents';
import { CodeBlock } from '@/components/shared/CodeBlock';
import { Terminal, AlertTriangle, AlertCircleIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertExpandableContent, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';

interface KmsCliOperationsProps {
    keyId: string;
    keyAlias: string;
    algorithm: string;
    size: string;
    publicKeyPem?: string;
}

export const KmsCliOperations: React.FC<KmsCliOperationsProps> = ({
    keyId,
    keyAlias,
    algorithm,
    size,
    publicKeyPem
}) => {
    const { user } = useAuth();
    // Generate bearer token export command
    const bearerTokenExport = `export BEARER_TOKEN="${user?.access_token || 'YOUR_ACCESS_TOKEN_HERE'}"`;

    const keyAliasSanitized = keyAlias.replace(/\s+/g, '_');
    const kmsUrl = typeof window !== 'undefined' ? window.location.host : 'lab.lamassu.io'

    // Generate config file content with dynamic values
    const configFileContent = JSON.stringify({
        "slots": [
            {
                "url": kmsUrl,
                "objects": [
                    {
                        "label": keyAliasSanitized,
                        "key_id": keyId,
                    }
                ]
            }
        ]
    }, null, 2);

    // Generate config file creation commands
    const configFileCommands = `cat > pkcs11-kms.config << 'EOF'
${configFileContent}
EOF

export LMS_PKCS11_CONFIG=./pkcs11-kms.config`;

    // OpenSSL version check command
    const opensslVersionCommand = `openssl version`;

    // OpenSSL configuration for version < 3.0.0 (engine-based)
    const opensslEngineConfig = `openssl_conf = openssl_init

[openssl_init]
engines = engine_section

[engine_section]
pkcs11 = pkcs11_section

[pkcs11_section]
engine_id = pkcs11
dynamic_path = /usr/lib/x86_64-linux-gnu/engines-3/pkcs11.so
MODULE_PATH = ./lms-pkcs11-x86.so
PIN = 1234
init = 0`;

    const opensslEngineCommands = `cat > openssl-pkcs11-engine.conf << 'EOF'
${opensslEngineConfig}
EOF

export OPENSSL_CONF=$(pwd)/openssl-pkcs11-engine.conf`;

    // OpenSSL configuration for version >= 3.0.0 (provider-based)
    const opensslProviderConfig = `openssl_conf = openssl_init

[openssl_init]
providers = provider_sect

[provider_sect]
default = default_sect
pkcs11 = pkcs11_section

[default_sect]
activate = 1

[pkcs11_section]
module = /usr/lib/x86_64-linux-gnu/ossl-modules/pkcs11.so
pkcs11-module-path = ./lms-pkcs11-x86.so
activate = 1`;

    const opensslProviderCommands = `cat > openssl-pkcs11-provider.conf << 'EOF'
${opensslProviderConfig}
EOF

export OPENSSL_CONF=$(pwd)/openssl-pkcs11-provider.conf`;

    // Generate OpenSSL signing commands
    const opensslSignEngineCommand = `echo -n "your-data-to-sign" | \\
  openssl dgst -sha256 -sign "pkcs11:token=${kmsUrl};label=${keyAliasSanitized};type=private" \\
  -engine pkcs11 > signature.bin`;

    const opensslSignProviderCommand = `echo -n "your-data-to-sign" | \\
  openssl dgst -sha256 -sign "pkcs11:token=${kmsUrl};label=${keyAliasSanitized};type=private" \\
  -provider pkcs11 -provider default > signature.bin`;

    // Generate OpenSSL verification command  
    const opensslVerifyCommand = `echo -n "your-data-to-sign" | \\
  openssl dgst -sha256 -verify public-key.pem \\
  -signature signature.bin`;

    // Generate PKCS11-Tool signing command
    const pkcs11SignCommand = `pkcs11-tool --module /path/to/libkms.so --sign \\
  --mechanism SHA256-RSA-PKCS --hash-algorithm sha256 \\
  --id "pkcs11:token=${kmsUrl};label=${keyAliasSanitized};type=private" --input-file data-to-sign.txt \\
  --output-file signature.bin`;

    return (
        <div className="space-y-6">
            <Alert expandable={true} defaultExpanded={false} variant="success">
                <Terminal className="h-4 w-4" />
                <AlertTitle variant="default">Initialization Steps</AlertTitle>
                <AlertDescription>
                    Expand this section to initialize and configure your CLI environment for PKCS11 KMS operations.
                </AlertDescription>
                <AlertExpandableContent>
                    <div className="space-y-4 pl-4 border-l-2 border-muted">
                        <div>
                            <h4 className="font-medium mb-2 flex items-center">
                                Authentication Setup
                            </h4>
                            <p className="text-sm text-muted-foreground mb-3">
                                Export your current bearer token to authenticate CLI operations:
                            </p>
                            <CodeBlock
                                content={bearerTokenExport}
                                title="Bearer Token Export"
                                showDownload={false}
                                textareaClassName="h-12 font-mono text-xs"
                            />
                        </div>

                        <div>
                            <h4 className="font-medium mb-2 flex items-center">
                                PKCS11 KMS Configuration
                            </h4>
                            <p className="text-sm text-muted-foreground mb-3">
                                Create a configuration file for PKCS11 KMS operations:
                            </p>
                            <CodeBlock
                                content={configFileCommands}
                                title="Create pkcs11-kms.config"
                                showDownload={false}
                                textareaClassName="h-48 font-mono text-xs"
                            />
                        </div>

                        <div>
                            <h4 className="font-medium mb-2 flex items-center">
                                OpenSSL Configuration
                            </h4>
                            <p className="text-sm text-muted-foreground mb-3">
                                First, check your OpenSSL version to determine which configuration to use:
                            </p>
                            <CodeBlock
                                content={opensslVersionCommand}
                                title="Check OpenSSL Version"
                                showDownload={false}
                                textareaClassName="h-2 font-mono text-xs"
                            />

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                                <div>
                                    <h5 className="font-medium mb-2 font-semibold">OpenSSL version &lt; 3.0.0</h5>
                                    <p className="text-xs text-muted-foreground mb-2">
                                        Engine-based configuration for older OpenSSL versions:
                                    </p>
                                           <Alert variant="warning">
                                        <AlertCircleIcon className="h-4 w-4" />
                                        <AlertTitle variant="warning">Warning: OpenSSL third-party library required</AlertTitle>
                                        <AlertDescription>
                                            In order to use the Lamassu KMS PKCS11 compliant engine, you must install a third-party OpenSSL library that includes PKCS11 support, such as <a href="https://github.com/OpenSC/libp11" style={{ textDecoration: "underline", color: "hsl(var(--primary))" }}>https://github.com/OpenSC/libp11</a>.
                                        </AlertDescription>
                                    </Alert>
                                    <CodeBlock
                                        content={opensslEngineCommands}
                                        title="Create openssl-pkcs11-engine.conf"
                                        showDownload={false}
                                        textareaClassName="h-64 font-mono text-xs"
                                    />
                                </div>

                                <div>
                                    <h5 className="font-medium mb-2 font-semibold">OpenSSL version &gt;= 3.0.0</h5>
                                    <p className="text-xs text-muted-foreground mb-2">
                                        Provider-based configuration for OpenSSL 3.0+:
                                    </p>
                                    <Alert variant="warning">
                                        <AlertCircleIcon className="h-4 w-4" />
                                        <AlertTitle variant="warning">Warning: OpenSSL third-party library required</AlertTitle>
                                        <AlertDescription>
                                            In order to use the Lamassu KMS PKCS11 compliant provider, you must install a third-party OpenSSL library that includes PKCS11 support, such as <a href="https://github.com/latchset/pkcs11-provider" style={{ textDecoration: "underline", color: "hsl(var(--primary))" }}>https://github.com/latchset/pkcs11-provider</a>.
                                        </AlertDescription>
                                    </Alert>
                                    <CodeBlock
                                        content={opensslProviderCommands}
                                        title="Create openssl-pkcs11-provider.conf"
                                        showDownload={false}
                                        textareaClassName="h-64 font-mono text-xs"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </AlertExpandableContent>
            </Alert>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-6">
                    <Card>
                        <SectionHeader icon={Terminal} title="OpenSSL" />
                        <CardContent className="space-y-4">
                            <div>
                                <h4 className="font-medium mb-2">Sign with OpenSSL</h4>
                                <Tabs defaultValue="engine" className="w-full">
                                    <TabsList className="grid w-full grid-cols-2">
                                        <TabsTrigger value="engine">Engine (&lt; 3.0.0)</TabsTrigger>
                                        <TabsTrigger value="provider">Provider (&gt;= 3.0.0)</TabsTrigger>
                                    </TabsList>
                                    <TabsContent value="engine" className="mt-4">
                                        <CodeBlock
                                            content={opensslSignEngineCommand}
                                            showDownload={false}
                                            textareaClassName="h-20 font-mono text-xs"
                                        />
                                    </TabsContent>
                                    <TabsContent value="provider" className="mt-4">
                                        <CodeBlock
                                            content={opensslSignProviderCommand}
                                            showDownload={false}
                                            textareaClassName="h-20 font-mono text-xs"
                                        />
                                    </TabsContent>
                                </Tabs>
                            </div>

                            <div>
                                <h4 className="font-medium mb-2">Verify with OpenSSL</h4>
                                <CodeBlock
                                    content={opensslVerifyCommand}
                                    showDownload={false}
                                    textareaClassName="h-20 font-mono text-xs"
                                />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card>
                        <SectionHeader icon={Terminal} title="PKCS11-Tool" />
                        <CardContent className="space-y-4">
                            <div>
                                <h4 className="font-medium mb-2">Sign with PKCS11-Tool</h4>
                                <CodeBlock
                                    content={pkcs11SignCommand}
                                    showDownload={false}
                                    textareaClassName="h-32 font-mono text-xs"
                                />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
};