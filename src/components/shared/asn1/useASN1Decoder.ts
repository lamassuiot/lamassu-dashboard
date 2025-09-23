import { useState, useCallback, useEffect } from 'react';
import { ASN1, Stream } from '@lapo/asn1js';
import { Hex } from '@lapo/asn1js/hex.js';
import { Base64 } from '@lapo/asn1js/base64.js';

// Type definitions
interface ASN1DecodedData {
  content: string;
  structure: string;
  hexDump: string | null;
  base64: string;
  definitions?: TypeDefinition[];
}

interface TypeDefinition {
  type: {
    description: string;
  };
  match: number;
}

interface UseASN1DecoderReturn {
  isLoading: boolean;
  error: string;
  decodedData: ASN1DecodedData | null;
  definitions: TypeDefinition[];
  selectedDefinition: string;
  wantHex: boolean;
  trimHex: boolean;
  wantDef: boolean;
  setWantHex: (value: boolean) => void;
  setTrimHex: (value: boolean) => void;
  setWantDef: (value: boolean) => void;
  setSelectedDefinition: (value: string) => void;
  decode: (der: string) => Promise<ASN1DecodedData>;
  decodeText: (val: string) => Promise<ASN1DecodedData>;
  decodeBinaryString: (str: string) => Promise<ASN1DecodedData>;
  decodeFile: (file: File) => Promise<ASN1DecodedData>;
}

// Custom hook for ASN.1 decoding functionality
export const useASN1Decoder = (): UseASN1DecoderReturn => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [decodedData, setDecodedData] = useState<ASN1DecodedData | null>(null);
  const [definitions, setDefinitions] = useState<TypeDefinition[]>([]);
  const [selectedDefinition, setSelectedDefinition] = useState<string>('');

  // Options state
  const [wantHex, setWantHex] = useState<boolean>(true);
  const [trimHex, setTrimHex] = useState<boolean>(true);
  const [wantDef, setWantDef] = useState<boolean>(true);

  // Constants
  const maxLength = 10240;
  const reHex = /^\s*(?:[0-9A-Fa-f][0-9A-Fa-f]\s*)+$/;

  // Load options from localStorage
  useEffect(() => {
    const savedWantHex = localStorage.getItem('wantHex');
    const savedTrimHex = localStorage.getItem('trimHex');
    const savedWantDef = localStorage.getItem('wantDef');

    if (savedWantHex !== null) setWantHex(savedWantHex === 'true');
    if (savedTrimHex !== null) setTrimHex(savedTrimHex === 'true');
    if (savedWantDef !== null) setWantDef(savedWantDef === 'true');
  }, []);

  // Save options to localStorage
  useEffect(() => {
    localStorage.setItem('wantHex', wantHex.toString());
  }, [wantHex]);

  useEffect(() => {
    localStorage.setItem('trimHex', trimHex.toString());
  }, [trimHex]);

  useEffect(() => {
    localStorage.setItem('wantDef', wantDef.toString());
  }, [wantDef]);

  // Main decode function
  const decode = useCallback(async (der: string): Promise<ASN1DecodedData> => {
    try {
      setIsLoading(true);
      setError('');
      
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 500));

      // Helper function to get bytes from input data
      const getBytesFromData = (data: string): Uint8Array => {
        if (typeof data === 'string') {
          const trimmedData = data.trim();
          
          // Handle PEM format
          if (trimmedData.includes('-----BEGIN') && trimmedData.includes('-----END')) {
            const base64Content = trimmedData
              .replace(/-----BEGIN[^-]+-----/, '')
              .replace(/-----END[^-]+-----/, '')
              .replace(/\s/g, '');
            return Base64.decode(base64Content);
          }
          // Handle hex input
          else if (/^[0-9A-Fa-f\s]+$/.test(trimmedData)) {
            return Hex.decode(trimmedData);
          }
          // Handle base64 input
          else {
            try {
              return Base64.decode(trimmedData);
            } catch (e) {
              // If base64 decode fails, try as raw string
              const bytes = new Uint8Array(trimmedData.length);
              for (let i = 0; i < trimmedData.length; i++) {
                bytes[i] = trimmedData.charCodeAt(i);
              }
              return bytes;
            }
          }
        } else {
          throw new Error('Unsupported data format');
        }
      };

      // Generate hex dump from actual parsed data
      const generateHexDump = (data: string): string => {
        try {
          const bytes = getBytesFromData(data);
          
          // Create stream and generate hex dump
          const stream = new Stream(bytes, 0);
          const maxHexLength = 512; // Limit hex dump length for display
          const endPos = Math.min(bytes.length, maxHexLength);
          let hexDump = stream.hexDump(0, endPos, 'dump');
          
          if (bytes.length > maxHexLength) {
            hexDump += `... (${bytes.length - maxHexLength} more bytes)\n`;
          }
          
          return hexDump;
        } catch (error) {
          console.warn('Hex dump generation failed:', error);
          return `Hex dump error: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
      };

      // Generate real ASN.1 structure tree using actual parsing
      const generateASN1Structure = (data: string): string => {
        try {
          const bytes = getBytesFromData(data);
          
          // Parse the ASN.1 structure
          const stream = new Stream(bytes, 0);
          const asn1 = ASN1.decode(stream);
          
          // Return the real parsed structure as a formatted string
          return asn1.toPrettyString();
          
        } catch (error) {
          console.warn('ASN.1 parsing failed:', error);
          // Return error message with some guidance
          return `Parse Error: ${error instanceof Error ? error.message : 'Unknown error'}

Supported formats:
- PEM (-----BEGIN ... -----END ...)
- Hexadecimal (space-separated or continuous)
- Base64 encoded data

Make sure your input contains valid ASN.1 data.`;
        }
      };

      // Generate base64 from parsed bytes
      const generateBase64 = (data: string): string => {
        try {
          const bytes = getBytesFromData(data);
          if (bytes.length < maxLength) {
            // Convert Uint8Array to string for btoa
            let binaryString = '';
            for (let i = 0; i < bytes.length; i++) {
              binaryString += String.fromCharCode(bytes[i]);
            }
            return btoa(binaryString);
          }
          return '';
        } catch (error) {
          console.warn('Base64 encoding failed:', error);
          return '';
        }
      };

      const parsedAsn1: ASN1DecodedData = {
        content: der,
        structure: generateASN1Structure(der),
        hexDump: wantHex ? generateHexDump(der) : null,
        base64: generateBase64(der)
      };

      if (wantDef) {
        // Analyze content to provide more realistic definitions
        const detectContentType = (content: string): TypeDefinition[] => {
          const upper = content.toUpperCase();
          
          if (upper.includes('BEGIN CERTIFICATE') || upper.includes('CERTIFICATE')) {
            return [
              { type: { description: 'X.509 Certificate' }, match: 0.95 },
              { type: { description: 'PKCS#7/CMS Signature' }, match: 0.20 },
              { type: { description: 'PKCS#8 Private Key' }, match: 0.10 }
            ];
          } else if (upper.includes('BEGIN PRIVATE KEY') || upper.includes('PRIVATE KEY')) {
            return [
              { type: { description: 'PKCS#8 Private Key' }, match: 0.92 },
              { type: { description: 'PKCS#1 RSA Private Key' }, match: 0.85 },
              { type: { description: 'X.509 Certificate' }, match: 0.15 }
            ];
          } else if (upper.includes('BEGIN RSA PRIVATE KEY')) {
            return [
              { type: { description: 'PKCS#1 RSA Private Key' }, match: 0.98 },
              { type: { description: 'PKCS#8 Private Key' }, match: 0.75 },
              { type: { description: 'X.509 Certificate' }, match: 0.10 }
            ];
          } else if (upper.includes('BEGIN CERTIFICATE REQUEST') || upper.includes('CSR')) {
            return [
              { type: { description: 'PKCS#10 Certificate Request' }, match: 0.95 },
              { type: { description: 'X.509 Certificate' }, match: 0.30 },
              { type: { description: 'PKCS#8 Private Key' }, match: 0.15 }
            ];
          } else if (upper.includes('PKCS7') || upper.includes('CMS') || content.includes('.p7')) {
            return [
              { type: { description: 'PKCS#7/CMS Signature' }, match: 0.90 },
              { type: { description: 'PKCS#7/CMS Encrypted Data' }, match: 0.70 },
              { type: { description: 'X.509 Certificate' }, match: 0.25 }
            ];
          } else {
            // Generic ASN.1 types for unknown content
            return [
              { type: { description: 'ASN.1 DER Structure' }, match: 0.80 },
              { type: { description: 'PKCS#12 Container' }, match: 0.40 },
              { type: { description: 'Custom ASN.1 Format' }, match: 0.30 }
            ];
          }
        };
        
        const mockTypes = detectContentType(der).sort((a, b) => b.match - a.match);
        
        setDefinitions(mockTypes);
        if (mockTypes.length > 0) {
          setSelectedDefinition(mockTypes[0].type.description);
        }
        parsedAsn1.definitions = mockTypes;
      } else {
        setDefinitions([]);
        setSelectedDefinition('');
      }

      setDecodedData(parsedAsn1);
      return parsedAsn1;

    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Decoding error';
      setError(errorMessage);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [wantHex, wantDef, maxLength]);

  // Decode text input
  const decodeText = useCallback(async (val: string): Promise<ASN1DecodedData> => {
    try {
      setError('');
      
      // In the real implementation, you would:
      // let der = reHex.test(val) ? Hex.decode(val) : Base64.unarmor(val);
      
      // For now, just pass the value
      return await decode(val);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Text decoding error';
      setError(errorMessage);
      throw e;
    }
  }, [decode]);

  // Decode binary string from file
  const decodeBinaryString = useCallback(async (str: string): Promise<ASN1DecodedData> => {
    try {
      setError('');
      
      // In the real implementation:
      // let der;
      // if (reHex.test(str)) der = Hex.decode(str);
      // else if (Base64.re.test(str)) der = Base64.unarmor(str);
      // else der = str;
      
      return await decode(str);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Binary string decoding error';
      setError(errorMessage);
      throw e;
    }
  }, [decode]);

  // Decode file
  const decodeFile = useCallback(async (file: File): Promise<ASN1DecodedData> => {
    try {
      setError('');
      
      const text = await file.text();
      return await decode(text);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'File decoding error';
      setError(errorMessage);
      throw e;
    }
  }, [decode]);

  return {
    isLoading,
    error,
    decodedData,
    definitions,
    selectedDefinition,
    wantHex,
    trimHex,
    wantDef,
    setWantHex,
    setTrimHex,
    setWantDef,
    setSelectedDefinition,
    decode,
    decodeText,
    decodeBinaryString,
    decodeFile,
  };
};