'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionHeader } from '@/components/shared/FormComponents';
import { CodeBlock } from '@/components/shared/CodeBlock';
import { Terminal, AlertCircleIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertExpandableContent, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';
import { getPublicAPIUrl } from '@/lib/api-domains';

const signatureAlgorithms = [
    'RSASSA_PSS_SHA_256', 'RSASSA_PSS_SHA_384', 'RSASSA_PSS_SHA_512',
    'RSASSA_PKCS1_V1_5_SHA_256', 'RSASSA_PKCS1_V1_5_SHA_384', 'RSASSA_PKCS1_V1_5_SHA_512',
    'ECDSA_SHA_256', 'ECDSA_SHA_384', 'ECDSA_SHA_512',
];

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

    // State for OpenSSL signing options
    const [selectedAlgorithm, setSelectedAlgorithm] = useState<string>(signatureAlgorithms[3]); // fallback to RSASSA_PKCS1_V1_5_SHA_256
    const [inputType, setInputType] = useState<string>('digest');

    // Function to check if an algorithm is compatible with the key
    const isAlgorithmDisabled = useCallback((algo: string): boolean => {
        // If we don't have algorithm info, allow all algorithms
        if (!algorithm) return false;

        if (algorithm === 'RSA') {
            return !algo.startsWith('RSASSA');
        }
        if (algorithm === 'ECDSA') {
            if (!algo.startsWith('ECDSA')) return true;

            const keySizeNumber = typeof size === 'string' ? parseInt(size) : parseInt(size);

            switch (keySizeNumber) {
                case 256: return algo !== 'ECDSA_SHA_256';
                case 384: return algo !== 'ECDSA_SHA_384';
                case 521: return algo !== 'ECDSA_SHA_512';
                default: return true;
            }
        }

        return false; // Allow unknown key types for now instead of disabling all
    }, [algorithm, size]);

    // Set compatible algorithm as default when component mounts or key details change
    useEffect(() => {
        const compatibleAlgo = signatureAlgorithms.find(algo => !isAlgorithmDisabled(algo));
        if (compatibleAlgo) {
            setSelectedAlgorithm(compatibleAlgo);
        }
    }, [algorithm, size, isAlgorithmDisabled]);

    // Helper function to extract hash algorithm from full algorithm name
    const getHashAlgorithm = (fullAlgorithm: string): string => {
        if (fullAlgorithm.includes('SHA_256')) return 'sha256';
        if (fullAlgorithm.includes('SHA_384')) return 'sha384';
        if (fullAlgorithm.includes('SHA_512')) return 'sha512';
        return 'sha256'; // default fallback
    };

    // Helper function to get PKCS11 mechanism name based on algorithm and mode
    const getPkcs11Mechanism = (fullAlgorithm: string, isDigestMode: boolean): string => {
        if (fullAlgorithm.startsWith('RSASSA_PSS_')) {
            // RSA-PSS: Always use RSA-PKCS-PSS mechanism
            return 'RSA-PKCS-PSS';
        }
        if (fullAlgorithm.startsWith('RSASSA_PKCS1_V1_5_')) {
            if (isDigestMode) {
                // Digest mode: Use combined mechanism with hash
                if (fullAlgorithm.includes('SHA_256')) return 'SHA256-RSA-PKCS';
                if (fullAlgorithm.includes('SHA_384')) return 'SHA384-RSA-PKCS';
                if (fullAlgorithm.includes('SHA_512')) return 'SHA512-RSA-PKCS';
            } else {
                // Raw mode: Use raw RSA-PKCS mechanism
                return 'RSA-PKCS';
            }
        }
        if (fullAlgorithm.startsWith('ECDSA_')) {
            if (isDigestMode) {
                // Digest mode: 
                return 'ECDSA';
            } else {
                if (fullAlgorithm.includes('SHA_256')) return 'ECDSA-SHA256';
                if (fullAlgorithm.includes('SHA_384')) return 'ECDSA-SHA384';
                if (fullAlgorithm.includes('SHA_512')) return 'ECDSA-SHA512';
                // Raw mode: 
            }
        }
        return 'SHA256-RSA-PKCS'; // default fallback
    };

    // Generate bearer token export command
    const bearerTokenExport = `export BEARER_TOKEN="${user?.access_token || 'YOUR_ACCESS_TOKEN_HERE'}"`;

    const keyAliasSanitized = keyAlias.replace(/\s+/g, '_');
    const kmsUrl = getPublicAPIUrl().replaceAll("https://", "").replaceAll("http://", "");

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

    // Generate OpenSSL signing commands based on selected options
    const hashAlgorithm = getHashAlgorithm(selectedAlgorithm);

    // Generate unified OpenSSL signing command with dynamic flags
    const getOpensslSignCommand = (isEngine: boolean) => {
        const opensslFlags = isEngine ? '-engine pkcs11' : '-provider pkcs11 -provider default';
        const isPssAlgorithm = selectedAlgorithm.includes('PSS');
        const pssOption = isPssAlgorithm ? '-pkeyopt rsa_padding_mode:pss' : '';

        return inputType === 'digest'
            ? `echo -n "your-data-to-sign" | openssl dgst -${hashAlgorithm} -binary -out digest.bin

openssl pkeyutl -sign -inkey "pkcs11:label=${keyAliasSanitized};type=private" ${pssOption} ${opensslFlags} -in digest.bin -out signature.bin

echo "signed data digest: $(cat digest.bin | hexdump -v -e '/1 "%02x"')"
echo "signature result (base64 encoded): $(cat signature.bin | base64 -w 0)"
`
            : `echo -n "your-data-to-sign" | \\
openssl dgst -${hashAlgorithm} -sign "pkcs11:label=${keyAliasSanitized};type=private" ${isPssAlgorithm ? '-sigopt rsa_padding_mode:pss \\' : ''} ${opensslFlags} -out signature.bin

echo "signature result (base64 encoded): $(cat signature.bin | base64 -w 0)"`
    };

    const opensslSignEngineCommand = getOpensslSignCommand(true);
    const opensslSignProviderCommand = getOpensslSignCommand(false);


    const getOpensslVerifyCommand = (isEngine: boolean) => {
        const opensslFlags = isEngine ? '-engine pkcs11' : '-provider pkcs11 -provider default';
        const isPssAlgorithm = selectedAlgorithm.includes('PSS');
        const pssOption = isPssAlgorithm ? '-pkeyopt rsa_padding_mode:pss' : '';

        return inputType === 'digest'
            ? `openssl pkey -provider pkcs11 -provider default  -in "pkcs11:object=${keyAliasSanitized}" -pubout > ${keyAliasSanitized}.pub

openssl pkeyutl -verify -pubin -inkey ${keyAliasSanitized}.pub -in digest.bin -sigfile signature.bin ${pssOption} ${opensslFlags}`
            : `echo -n "your-data-to-sign" | \\
openssl dgst -${hashAlgorithm} -verify public-key.pem \\
  -signature signature.bin`;
    }

    // Generate OpenSSL verification command based on selected options
    const opensslVerifyEngineCommand = getOpensslVerifyCommand(true);
    const opensslVerifyProviderCommand = getOpensslVerifyCommand(false);

    // Generate PKCS11-Tool signing command
    const isDigestMode = inputType === 'digest';
    const pkcs11Mechanism = getPkcs11Mechanism(selectedAlgorithm, isDigestMode);
    const isPssAlgorithm = selectedAlgorithm.includes('PSS');

    // Build command flags based on algorithm type and mode
    let commandFlags = `--mechanism ${pkcs11Mechanism}`;
    let pkcs11InFile = 'data-to-sign.txt';
    let optionalPostSignCommand = '';
    // Add hash algorithm only in digest mode (except for RSA-PSS which always needs it in digest mode)
    if (isDigestMode) {
        if (isPssAlgorithm || selectedAlgorithm.startsWith('RSASSA_PSS_')) {
            // RSA-PSS in digest mode: add hash algorithm
            commandFlags += ` --hash-algorithm ${hashAlgorithm}`;
        }

        pkcs11InFile = 'digest.bin';
        optionalPostSignCommand = `echo "signed data digest: $(cat digest.bin | hexdump -v -e '/1 "%02x"')"`;
        // For SHA*-RSA-PKCS and ECDSA-SHA* mechanisms, hash is already in mechanism name
    } else {
        optionalPostSignCommand = `openssl dgst -${hashAlgorithm} data-to-sign.txt`;
    }

    // Add salt length for RSA-PSS (both digest and raw modes)
    if (isPssAlgorithm) {
        commandFlags += ` --salt-len digest`;
    }

    const pkcs11SignCommand = `echo -n "your-data-to-sign" > data-to-sign.txt 
${isDigestMode ? `
openssl dgst -${hashAlgorithm} -binary -out digest.bin data-to-sign.txt` : ''}

pkcs11-tool --module ./lms-pkcs11-x86.so --sign ${commandFlags} --signature-format openssl --label "${keyAliasSanitized}" --input-file ${pkcs11InFile} --output-file signature.bin

${optionalPostSignCommand}
echo "signature result (base64 encoded): $(cat signature.bin | base64 -w 0)"
`;

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
                {/* Global Algorithm and Input Type Selectors */}
                <div className="lg:col-span-2 mb-6">
                    <Card>
                        <CardContent className="pt-6">
                            <h3 className="text-lg font-semibold mb-4">Signing Configuration</h3>
                            <p className="text-sm text-muted-foreground mb-4">
                                These settings apply to all CLI operations below (OpenSSL and PKCS11-tool).
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-muted-foreground">
                                        Algorithm
                                    </label>
                                    <Select value={selectedAlgorithm} onValueChange={setSelectedAlgorithm}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select algorithm" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {signatureAlgorithms.map(algo => (
                                                <SelectItem key={algo} value={algo} disabled={isAlgorithmDisabled(algo)}>
                                                    {algo}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-muted-foreground">
                                        Input Type
                                    </label>
                                    <Select value={inputType} onValueChange={setInputType}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select input type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="digest">Digest (pkcs11 inputs a digest)</SelectItem>
                                            <SelectItem value="raw">Raw (pkcs11 inputs raw data. It's then hashed internally)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card>
                        <SectionHeader icon={Terminal} title="OpenSSL" />
                        <CardContent className="space-y-4">
                            <div>
                                <h4 className="font-medium mb-4">Sign with OpenSSL</h4>

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
                                        <CodeBlock
                                            className='mt-4'
                                            content={opensslVerifyEngineCommand}
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
                                        <CodeBlock
                                            className='mt-4'
                                            content={opensslVerifyProviderCommand}
                                            showDownload={false}
                                            textareaClassName="h-20 font-mono text-xs"
                                        />
                                    </TabsContent>
                                </Tabs>
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