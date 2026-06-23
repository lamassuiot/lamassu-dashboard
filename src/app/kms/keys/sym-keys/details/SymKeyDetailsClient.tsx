'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDropzone } from 'react-dropzone';
import { ArrowLeft, Lock, Info, FileText, Loader2, AlertTriangle, Upload, Download, Plus, X, UploadCloud, File as FileIcon, Shield, Zap, Key, Clock, Router as RouterIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';
import { DetailItem } from '@/components/shared/DetailItem';
import { SymmetricKeyStrengthIndicator } from '@/components/shared/SymmetricKeyStrengthIndicator';
import { ResourceConsumptionIndicator } from '@/components/shared/LightweightIndicator';
import { AEADIndicator } from '@/components/shared/AEADIndicator';
import { SYM_KEY_ALGORITHMS } from '@/lib/key-spec-constants';
import { 
  fetchSymmetricKeys, 
  encryptWithSymmetricKey, 
  decryptWithSymmetricKey,
  computeMac,
  verifyMac,
  type SymmetricKey,
  type EncryptRequest,
  type DecryptRequest,
  type ComputeMacRequest,
  type VerifyMacRequest
} from '@/lib/symkms-api';
import { formatDistanceToNow } from 'date-fns';
import { KeyDevicesLookupCard } from '@/components/kms/KeyDevicesLookupCard';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';

interface FileToEncrypt {
  id: string;
  name: string;
  content: string; // base64 encoded
  size: number;
}

interface EncryptedFile {
  id: string;
  name: string;
  ciphertext: string; // base64 encoded
  iv: string; // hex encoded
  size: number;
}

interface FileToDecrypt {
  id: string;
  name: string;
  ciphertext: string; // base64 encoded
  iv: string; // hex encoded
  size: number;
}

interface DecryptedFile {
  id: string;
  name: string;
  plaintext: string; // base64 encoded
  size: number;
}

export default function SymKeyDetailsClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const keyId = searchParams.get('keyId');

  const [keyDetails, setKeyDetails] = useState<SymmetricKey | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tabFromQuery = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<string>(tabFromQuery || 'overview');

  // State for Encrypt Tab
  const [filesToEncrypt, setFilesToEncrypt] = useState<FileToEncrypt[]>([]);
  const [encryptedFiles, setEncryptedFiles] = useState<EncryptedFile[]>([]);
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [customIv, setCustomIv] = useState('');
  const [encryptFormat, setEncryptFormat] = useState<'ciphertext' | 'pkcs7' | ''>('');
  
  // State for text encryption
  const [textToEncrypt, setTextToEncrypt] = useState('');
  const [encryptedText, setEncryptedText] = useState<{ ciphertext: string; iv: string } | null>(null);
  
  // State for text decryption
  const [textToDecrypt, setTextToDecrypt] = useState('');
  const [ivForTextDecrypt, setIvForTextDecrypt] = useState('');
  const [decryptedText, setDecryptedText] = useState<string>('');

  // State for Decrypt Tab
  const [filesToDecrypt, setFilesToDecrypt] = useState<FileToDecrypt[]>([]);
  const [decryptedFiles, setDecryptedFiles] = useState<DecryptedFile[]>([]);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptFormat, setDecryptFormat] = useState<'ciphertext' | 'pkcs7' | ''>('');

  // State for MAC Tab
  const [macAlgorithm, setMacAlgorithm] = useState<'HMAC-SHA3-256' | 'AES-CMAC' | 'ASCON-MAC' | ''>('');
  const [macDataInput, setMacDataInput] = useState('');
  const [macDataFile, setMacDataFile] = useState<File | null>(null);
  const [macDataFileBase64, setMacDataFileBase64] = useState<string | null>(null);
  const [isMacDataFileLoading, setIsMacDataFileLoading] = useState(false);
  const [computedMac, setComputedMac] = useState<string | null>(null);
  const [isComputingMac, setIsComputingMac] = useState(false);
  const [macToVerify, setMacToVerify] = useState('');
  const [macVerifyDataInput, setMacVerifyDataInput] = useState('');
  const [macVerifyFile, setMacVerifyFile] = useState<File | null>(null);
  const [macVerifyFileBase64, setMacVerifyFileBase64] = useState<string | null>(null);
  const [isMacVerifyFileLoading, setIsMacVerifyFileLoading] = useState(false);
  const [macVerifyResult, setMacVerifyResult] = useState<boolean | null>(null);
  const [isVerifyingMac, setIsVerifyingMac] = useState(false);
  const [computeMacAbortController, setComputeMacAbortController] = useState<AbortController | null>(null);
  const [verifyMacAbortController, setVerifyMacAbortController] = useState<AbortController | null>(null);

  const fetchKeyData = useCallback(async () => {
    if (!keyId) {
      setError("Key ID is missing from URL.");
      setIsLoading(false);
      return;
    }

    if (authLoading || !isAuthenticated() || !user?.access_token) {
      if (!authLoading && !isAuthenticated()) {
        setError("User not authenticated. Please log in.");
      }
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const userId = user.profile?.sub || user.profile?.email || 'default-user';
      const response = await fetchSymmetricKeys(userId);
      const key = response.list.find(k => k.id === keyId);

      if (key) {
        setKeyDetails(key);
      } else {
        setError(`Symmetric key with ID "${keyId}" not found.`);
      }
    } catch (err: any) {
      setError(err.message || "Failed to fetch symmetric key details.");
    } finally {
      setIsLoading(false);
    }
  }, [keyId, user?.access_token, user?.profile, authLoading, isAuthenticated]);

  useEffect(() => {
    fetchKeyData();
  }, [fetchKeyData]);

  // File upload handlers for encryption
  const onDropFiles = useCallback(async (acceptedFiles: File[], fileRejections: any[]) => {
    if (fileRejections.length > 0) {
      toast({
        title: "File Rejected",
        description: fileRejections[0].errors.map((err: any) => err.message).join(', '),
        variant: "destructive",
      });
      return;
    }

    const newFiles: FileToEncrypt[] = [];
    for (let i = 0; i < acceptedFiles.length; i++) {
      const file = acceptedFiles[i];
      const reader = new FileReader();
      
      await new Promise((resolve) => {
        reader.onload = (e) => {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
          newFiles.push({
            id: `${Date.now()}-${i}`,
            name: file.name,
            content: base64,
            size: file.size,
          });
          resolve(null);
        };
        reader.readAsArrayBuffer(file);
      });
    }

    setFilesToEncrypt(prev => [...prev, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onDropFiles,
    accept: undefined, // Allow all file types
    multiple: true,
  });

  // Helper function to convert ArrayBuffer to base64 without stack overflow
  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 8192; // Process in chunks to avoid stack overflow
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    return btoa(binary);
  };

  // Dropzone for MAC compute (single-file)
  const onDropMacComputeFiles = useCallback((acceptedFiles: File[]) => {
    if (!acceptedFiles || acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];
    
    // IMPORTANT: Clear base64 immediately to prevent using stale data from previous file
    setMacDataFileBase64(null);
    setMacDataFile(file);
    // Always read file to base64 (the backend now accepts base64 up to ~350MB).
    // Keep a loading flag so UI can prevent accidental submits while reading.
    setIsMacDataFileLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        const base64 = arrayBufferToBase64(arrayBuffer);
        setMacDataFileBase64(base64);
      } catch (err) {
        console.error('Error converting file to base64:', err);
      } finally {
        setIsMacDataFileLoading(false);
      }
    };
    reader.onerror = () => {
      console.error('Error reading file');
      setIsMacDataFileLoading(false);
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const { getRootProps: getMacComputeRootProps, getInputProps: getMacComputeInputProps, isDragActive: isMacComputeDragActive } = useDropzone({
    onDrop: onDropMacComputeFiles,
    accept: undefined,
    multiple: false,
  });

  // Dropzone for MAC verify (single-file)
  const onDropMacVerifyFiles = useCallback((acceptedFiles: File[]) => {
    if (!acceptedFiles || acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];
    
    // IMPORTANT: Clear base64 immediately to prevent using stale data from previous file
    setMacVerifyFileBase64(null);
    setMacVerifyFile(file);
    // Always read file to base64 (the backend now accepts base64 up to ~350MB).
    setIsMacVerifyFileLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        const base64 = arrayBufferToBase64(arrayBuffer);
        setMacVerifyFileBase64(base64);
      } catch (err) {
        console.error('Error converting file to base64:', err);
      } finally {
        setIsMacVerifyFileLoading(false);
      }
    };
    reader.onerror = () => {
      setIsMacVerifyFileLoading(false);
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const { getRootProps: getMacVerifyRootProps, getInputProps: getMacVerifyInputProps, isDragActive: isMacVerifyDragActive } = useDropzone({
    onDrop: onDropMacVerifyFiles,
    accept: undefined,
    multiple: false,
  });

  // Dropzone for decrypt files
  const onDropDecryptFiles = useCallback((acceptedFiles: File[]) => {
    const newFiles: FileToDecrypt[] = [];
    for (const file of acceptedFiles) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        // Remove data URL prefix if present (for base64 encoded files)
        const base64Content = content.split(',')[1] || content;
        
        newFiles.push({
          id: `${file.name}-${Date.now()}-${Math.random()}`,
          name: file.name,
          ciphertext: base64Content,
          iv: '',
          size: file.size,
        });
        
        if (newFiles.length === acceptedFiles.length) {
          setFilesToDecrypt(prev => [...prev, ...newFiles]);
        }
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const { getRootProps: getDecryptRootProps, getInputProps: getDecryptInputProps, isDragActive: isDecryptDragActive } = useDropzone({
    onDrop: onDropDecryptFiles,
    accept: undefined, // Allow all file types
    multiple: true,
  });

  const handleFilesForEncryption = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const newFiles: FileToEncrypt[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      
      await new Promise((resolve) => {
        reader.onload = (e) => {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
          newFiles.push({
            id: `${Date.now()}-${i}`,
            name: file.name,
            content: base64,
            size: file.size,
          });
          resolve(null);
        };
        reader.readAsArrayBuffer(file);
      });
    }

    setFilesToEncrypt(prev => [...prev, ...newFiles]);
    event.target.value = ''; // Reset input
  };

  const removeFileToEncrypt = (id: string) => {
    setFilesToEncrypt(prev => prev.filter(f => f.id !== id));
  };

  const handleEncryptFiles = async () => {
    if (!keyDetails || !user?.access_token || filesToEncrypt.length === 0 || !encryptFormat) return;

    setIsEncrypting(true);
    const userId = user.profile?.sub || user.profile?.email || 'default-user';
    const encrypted: EncryptedFile[] = [];

    try {
      for (const file of filesToEncrypt) {
        const request: EncryptRequest = {
          user_id: userId,
          key_name: keyDetails.id,
          algorithm: keyDetails.algorithm,
          plaintext: file.content,
          format: encryptFormat as 'ciphertext' | 'pkcs7',
        };

        if (customIv.trim()) {
          request.iv = customIv.trim();
        }

        const response = await encryptWithSymmetricKey(request);
        encrypted.push({
          id: file.id,
          name: file.name,
          ciphertext: response.ciphertext,
          iv: response.iv,
          size: file.size,
        });
      }

      setEncryptedFiles(encrypted);
      setFilesToEncrypt([]);
      toast({
        title: "Files Encrypted",
        description: `Successfully encrypted ${encrypted.length} file(s) using ${encryptFormat} format.`,
      });
    } catch (err: any) {
      toast({
        title: "Encryption Failed",
        description: err.message || "Failed to encrypt files.",
        variant: "destructive",
      });
    } finally {
      setIsEncrypting(false);
    }
  };

  const downloadEncryptedFile = (file: EncryptedFile) => {
    let blob: Blob;
    let filename: string;
    
    if (encryptFormat === 'ciphertext') {
      // Hex-encoded: convert hex to binary
      const hex = file.ciphertext;
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
      }
      blob = new Blob([bytes.buffer], { type: 'application/octet-stream' });
      filename = `${file.name}.encrypted`;
    } else {
      // PKCS7/CMS format: download as PEM text file
      blob = new Blob([file.ciphertext], { type: 'text/plain' });
      // Remove .pem extension if it already exists in the filename
      const baseName = file.name.toLowerCase().endsWith('.pem') 
        ? file.name.slice(0, -4) 
        : file.name;
      filename = `${baseName}.pem`;
    }
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadIvFile = (file: EncryptedFile) => {
    const blob = new Blob([file.iv], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file.name}.iv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleEncryptText = async () => {
    if (!keyDetails || !user?.access_token || !textToEncrypt.trim() || !encryptFormat) return;

    setIsEncrypting(true);
    const userId = user.profile?.sub || user.profile?.email || 'default-user';

    try {
      // Convert text to base64
      const textBase64 = btoa(textToEncrypt);

      const request: EncryptRequest = {
        user_id: userId,
        key_name: keyDetails.id,
        algorithm: keyDetails.algorithm,
        plaintext: textBase64,
        format: encryptFormat as 'ciphertext' | 'pkcs7',
      };

      if (customIv.trim()) {
        request.iv = customIv.trim();
      }

      const response = await encryptWithSymmetricKey(request);
      setEncryptedText({
        ciphertext: response.ciphertext,
        iv: response.iv,
      });
      setTextToEncrypt('');
      toast({
        title: "Text Encrypted",
        description: `Successfully encrypted text using ${encryptFormat} format.`,
      });
    } catch (err: any) {
      toast({
        title: "Encryption Failed",
        description: err.message || "Failed to encrypt text.",
        variant: "destructive",
      });
    } finally {
      setIsEncrypting(false);
    }
  };

  const downloadEncryptedText = () => {
    if (!encryptedText) return;
    
    const content = `Ciphertext: ${encryptedText.ciphertext}\nIV: ${encryptedText.iv}\nFormat: ${encryptFormat}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Use appropriate extension based on format
    const extension = encryptFormat === 'pkcs7' ? '.pem' : '.txt';
    a.download = `encrypted-text${extension}`;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadDecryptedText = () => {
    if (!decryptedText) return;
    
    const blob = new Blob([decryptedText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'decrypted-text.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDecryptText = async () => {
    if (!keyDetails || !user?.access_token || !textToDecrypt.trim() || !decryptFormat) return;
    if (decryptFormat !== 'pkcs7' && !ivForTextDecrypt.trim()) return;

    setIsDecrypting(true);
    const userId = user.profile?.sub || user.profile?.email || 'default-user';

    try {
      const request: DecryptRequest = {
        user_id: userId,
        key_name: keyDetails.id,
        algorithm: keyDetails.algorithm,
        ciphertext: textToDecrypt.trim(),
        format: decryptFormat as 'ciphertext' | 'pkcs7',
      };

      // Only include IV for non-PKCS7 formats
      if (decryptFormat !== 'pkcs7') {
        request.iv = ivForTextDecrypt.trim();
      }

      const response = await decryptWithSymmetricKey(request);
      // Decode base64 plaintext to text
      const decryptedTextContent = atob(response.plaintext);
      setDecryptedText(decryptedTextContent);
      setTextToDecrypt('');
      if (decryptFormat !== 'pkcs7') {
        setIvForTextDecrypt('');
      }
      toast({
        title: "Text Decrypted",
        description: `Successfully decrypted text using ${decryptFormat} format.`,
      });
    } catch (err: any) {
      toast({
        title: "Decryption Failed",
        description: err.message || "Failed to decrypt text.",
        variant: "destructive",
      });
    } finally {
      setIsDecrypting(false);
    }
  };

  // File upload handlers for decryption
  const handleEncryptedFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const newFiles: FileToDecrypt[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      
      await new Promise((resolve) => {
        reader.onload = (e) => {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          const bytes = new Uint8Array(arrayBuffer);
          
          // Convert to hex or base64 based on selected format
          let ciphertextEncoded: string;
          if (decryptFormat === 'ciphertext') {
            // Convert to hex
            ciphertextEncoded = Array.from(bytes)
              .map(byte => byte.toString(16).padStart(2, '0'))
              .join('');
          } else {
            // Convert to base64
            ciphertextEncoded = btoa(String.fromCharCode(...bytes));
          }
          
          newFiles.push({
            id: `${Date.now()}-${i}`,
            name: file.name.replace('.encrypted', ''),
            ciphertext: ciphertextEncoded,
            iv: '', // Will be set from IV file or manual input
            size: file.size,
          });
          resolve(null);
        };
        reader.readAsArrayBuffer(file);
      });
    }

    setFilesToDecrypt(prev => [...prev, ...newFiles]);
    event.target.value = '';
  };

  const handleIvFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, fileId: string) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const ivText = e.target?.result as string;
      setFilesToDecrypt(prev => prev.map(f => 
        f.id === fileId ? { ...f, iv: ivText.trim() } : f
      ));
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const updateFileIv = (fileId: string, iv: string) => {
    setFilesToDecrypt(prev => prev.map(f => 
      f.id === fileId ? { ...f, iv } : f
    ));
  };

  const removeFileToDecrypt = (id: string) => {
    setFilesToDecrypt(prev => prev.filter(f => f.id !== id));
  };

  const handleDecryptFiles = async () => {
    if (!keyDetails || !user?.access_token || filesToDecrypt.length === 0 || !decryptFormat) return;

    setIsDecrypting(true);
    const userId = user.profile?.sub || user.profile?.email || 'default-user';
    const decrypted: DecryptedFile[] = [];

    try {
      for (const file of filesToDecrypt) {
        if (decryptFormat !== 'pkcs7' && !file.iv.trim()) {
          throw new Error(`IV is required for file: ${file.name}`);
        }

        const request: DecryptRequest = {
          user_id: userId,
          key_name: keyDetails.id,
          algorithm: keyDetails.algorithm,
          ciphertext: file.ciphertext,
          format: decryptFormat as 'ciphertext' | 'pkcs7',
        };

        // Only include IV for non-PKCS7 formats
        if (decryptFormat !== 'pkcs7') {
          request.iv = file.iv.trim();
        }

        const response = await decryptWithSymmetricKey(request);
        // Calculate actual decrypted content size from base64
        const decryptedBytes = atob(response.plaintext);
        const actualSize = decryptedBytes.length;
        
        // Restore original filename by removing encryption extension
        let originalName = file.name;
        if (decryptFormat === 'pkcs7' && originalName.toLowerCase().endsWith('.pem')) {
          originalName = originalName.slice(0, -4);
        } else if (decryptFormat === 'ciphertext' && originalName.toLowerCase().endsWith('.encrypted')) {
          originalName = originalName.slice(0, -10);
        }
        
        decrypted.push({
          id: file.id,
          name: originalName,
          plaintext: response.plaintext,
          size: actualSize, // Use actual decrypted content size
        });
      }

      setDecryptedFiles(decrypted);
      setFilesToDecrypt([]);
      toast({
        title: "Files Decrypted",
        description: `Successfully decrypted ${decrypted.length} file(s) using ${decryptFormat} format.`,
      });
    } catch (err: any) {
      toast({
        title: "Decryption Failed",
        description: err.message || "Failed to decrypt files.",
        variant: "destructive",
      });
    } finally {
      setIsDecrypting(false);
    }
  };

  const downloadDecryptedFile = (file: DecryptedFile) => {
    // Decode base64 plaintext to binary
    const binaryString = atob(file.plaintext);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // MAC handlers
  const getAvailableMacAlgorithms = (): Array<{ value: 'HMAC-SHA3-256' | 'AES-CMAC' | 'ASCON-MAC'; label: string }> => {
    if (!keyDetails) return [];
    const algo = keyDetails.algorithm.toUpperCase();
    
    if (algo.startsWith('AES')) {
      return [
        { value: 'HMAC-SHA3-256', label: 'HMAC-SHA3-256' },
        { value: 'AES-CMAC', label: 'AES-CMAC (RFC 4493)' },
      ];
    } else if (algo.startsWith('ASCON')) {
      return [
        { value: 'ASCON-MAC', label: 'ASCON-MAC' },
      ];
    }
    return [];
  };

  const handleComputeMac = async () => {
    console.log('handleComputeMac called', {
      keyDetails: !!keyDetails,
      access_token: !!user?.access_token,
      macDataInput: macDataInput.trim(),
      macDataFile: macDataFile?.name,
      macAlgorithm,
      isMacDataFileLoading,
      macDataFileBase64: macDataFileBase64?.substring(0, 50),
    });
    
    if (!keyDetails || !user?.access_token || (!macDataInput.trim() && !macDataFile) || !macAlgorithm) {
      console.log('Early return - validation failed');
      return;
    }
    
    // Check if file is still loading
    if (macDataFile && isMacDataFileLoading) {
      console.log('Early return - file still loading');
      toast({
        title: "Please wait",
        description: "File is still being processed...",
      });
      return;
    }

    setIsComputingMac(true);
    const userId = user.profile?.sub || user.profile?.email || 'default-user';

    try {
      // Maximum file size limit (~350MB when base64 encoded becomes ~467MB)
      const MAX_FILE_SIZE = 350 * 1024 * 1024;
      
      // File takes priority over text input
      if (macDataFile) {
        // Check file size limit
        if (macDataFile.size > MAX_FILE_SIZE) {
          toast({
            title: "File Too Large",
            description: `File size exceeds the maximum limit of 350MB. Current file size: ${(macDataFile.size / (1024 * 1024)).toFixed(2)}MB`,
            variant: "destructive",
          });
          setIsComputingMac(false);
          return;
        }

        // Wait for base64 if not ready yet
        if (!macDataFileBase64) {
          toast({
            title: "Please wait",
            description: "File is still being processed...",
          });
          setIsComputingMac(false);
          return;
        }
        
        const request: ComputeMacRequest = {
          user_id: userId,
          key_name: keyDetails.id,
          mac_algorithm: macAlgorithm as 'HMAC-SHA3-256' | 'AES-CMAC' | 'ASCON-MAC',
          data: macDataFileBase64,
        };

        // Add abort support for compute
        const controller = new AbortController();
        setComputeMacAbortController(controller);
        // Timeout scales with file size: base 60s + 30s per MB
        const fileSizeMB = macDataFile.size / (1024 * 1024);
        const TIMEOUT_MS = Math.max(120 * 1000, (60 + fileSizeMB * 30) * 1000);
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
          const response = await computeMac(request, { signal: controller.signal });
          setComputedMac(response.mac);
        } finally {
          clearTimeout(timeoutId);
          setComputeMacAbortController(null);
        }
      } else {
  // No file - use text input
        const dataBase64 = btoa(macDataInput);

        const request: ComputeMacRequest = {
          user_id: userId,
          key_name: keyDetails.id,
          mac_algorithm: macAlgorithm as 'HMAC-SHA3-256' | 'AES-CMAC' | 'ASCON-MAC',
          data: dataBase64,
        };

        // Add abort support for text compute as well
        const controller = new AbortController();
        setComputeMacAbortController(controller);
        const TIMEOUT_MS = 60 * 1000;
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
          const response = await computeMac(request, { signal: controller.signal });
          setComputedMac(response.mac);
        } finally {
          clearTimeout(timeoutId);
          setComputeMacAbortController(null);
        }
      }
      
      toast({
        title: "MAC Computed",
        description: `Successfully computed ${macAlgorithm} MAC.`,
      });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        toast({ title: "MAC Aborted", description: "MAC computation was cancelled or timed out.", variant: "destructive" });
      } else {
      toast({
        title: "MAC Computation Failed",
        description: err.message || "Failed to compute MAC.",
        variant: "destructive",
      });
      }
    } finally {
      setIsComputingMac(false);
    }
  };

  const handleVerifyMac = async () => {
    if (!keyDetails || !user?.access_token || (!macVerifyDataInput.trim() && !macVerifyFile) || !macToVerify.trim() || !macAlgorithm) return;

    // Check if file is still loading
    if (macVerifyFile && isMacVerifyFileLoading) {
      toast({
        title: "Please wait",
        description: "File is still being processed...",
      });
      return;
    }

    setIsVerifyingMac(true);
    const userId = user.profile?.sub || user.profile?.email || 'default-user';

    try {
      // Maximum file size limit (~350MB when base64 encoded becomes ~467MB)
      const MAX_FILE_SIZE = 350 * 1024 * 1024;
      
      // File takes priority over text input
      if (macVerifyFile) {
        // Check file size limit
        if (macVerifyFile.size > MAX_FILE_SIZE) {
          toast({
            title: "File Too Large",
            description: `File size exceeds the maximum limit of 350MB. Current file size: ${(macVerifyFile.size / (1024 * 1024)).toFixed(2)}MB`,
            variant: "destructive",
          });
          setIsVerifyingMac(false);
          return;
        }

        // Wait for base64 if not ready yet
        if (!macVerifyFileBase64) {
          toast({
            title: "Please wait",
            description: "File is still being processed...",
          });
          setIsVerifyingMac(false);
          return;
        }
        
        const request: VerifyMacRequest = {
          user_id: userId,
          key_name: keyDetails.id,
          mac_algorithm: macAlgorithm as 'HMAC-SHA3-256' | 'AES-CMAC' | 'ASCON-MAC',
          data: macVerifyFileBase64,
          mac: macToVerify.trim(),
        };

        // Timeout scales with file size: base 60s + 30s per MB
        const fileSizeMB = macVerifyFile.size / (1024 * 1024);
        const TIMEOUT_MS = Math.max(120 * 1000, (60 + fileSizeMB * 30) * 1000);
        const controller = new AbortController();
        setVerifyMacAbortController(controller);
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
          const response = await verifyMac(request, { signal: controller.signal });
          setMacVerifyResult(response.valid);
          toast({
            title: response.valid ? "MAC Valid" : "MAC Invalid",
            description: response.valid 
              ? "The MAC is valid and matches the data." 
              : "The MAC does not match the provided data.",
            variant: response.valid ? "default" : "destructive",
          });
        } finally {
          clearTimeout(timeoutId);
          setVerifyMacAbortController(null);
        }
      } else {
        // No file - use text input
        const dataBase64 = btoa(macVerifyDataInput);

        const request: VerifyMacRequest = {
          user_id: userId,
          key_name: keyDetails.id,
          mac_algorithm: macAlgorithm as 'HMAC-SHA3-256' | 'AES-CMAC' | 'ASCON-MAC',
          data: dataBase64,
          mac: macToVerify.trim(),
        };

        const controller = new AbortController();
        setVerifyMacAbortController(controller);
        const TIMEOUT_MS = 60 * 1000;
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
          const response = await verifyMac(request, { signal: controller.signal });
          setMacVerifyResult(response.valid);
          toast({
            title: response.valid ? "MAC Valid" : "MAC Invalid",
            description: response.valid 
              ? "The MAC is valid and matches the data." 
              : "The MAC does not match the provided data.",
            variant: response.valid ? "default" : "destructive",
          });
        } finally {
          clearTimeout(timeoutId);
          setVerifyMacAbortController(null);
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        toast({ title: "MAC Aborted", description: "MAC verification was cancelled or timed out.", variant: "destructive" });
      } else {
      toast({
        title: "MAC Verification Failed",
        description: err.message || "Failed to verify MAC.",
        variant: "destructive",
      });
      }
    } finally {
      setIsVerifyingMac(false);
    }
  };

  // Cleanup any remaining abort controllers on unmount
  useEffect(() => {
    return () => {
      computeMacAbortController?.abort();
      verifyMacAbortController?.abort();
    };
  }, [computeMacAbortController, verifyMacAbortController]);

  if (isLoading || authLoading) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-8">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading Symmetric Key Details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="outline" onClick={() => router.push('/kms/keys/sym-keys')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Symmetric Keys
        </Button>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Key</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!keyDetails) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="outline" onClick={() => router.push('/kms/keys/sym-keys')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Symmetric Keys
        </Button>
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Key Not Found</AlertTitle>
          <AlertDescription>The requested symmetric key could not be found.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <BreadcrumbPage items={[{ label: 'Home', href: '/' }, { label: 'KMS Keys', href: '/kms/keys' }, { label: 'Symmetric Keys', href: '/kms/keys/sym-keys' }, { label: keyId || 'Details' }]} className="space-y-6 w-full pb-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Button variant="outline" onClick={() => router.push('/kms/keys/sym-keys')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Symmetric Keys
          </Button>
        </div>
      </div>

      <div className="flex items-center space-x-3">
        <Lock className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-headline font-semibold">{keyDetails.id}</h1>
          <p className="text-sm text-muted-foreground">Symmetric Key Details</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">
            <Info className="mr-2 h-4 w-4" /> Overview
          </TabsTrigger>
          <TabsTrigger value="devices">
            <RouterIcon className="mr-2 h-4 w-4" /> Devices
          </TabsTrigger>
          <TabsTrigger value="encrypt">
            <Lock className="mr-2 h-4 w-4" /> Encrypt
          </TabsTrigger>
          <TabsTrigger value="decrypt">
            <FileText className="mr-2 h-4 w-4" /> Decrypt
          </TabsTrigger>
          <TabsTrigger value="mac">
            <Shield className="mr-2 h-4 w-4" /> MAC
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Header Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-l-4 border-l-primary">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Algorithm</p>
                    <p className="text-2xl font-bold">
                      {SYM_KEY_ALGORITHMS[keyDetails.algorithm] || keyDetails.algorithm}
                    </p>
                  </div>
                  <div className="rounded-full bg-primary/10 p-3">
                    <Key className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-green-500">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Key Length</p>
                    <p className="text-2xl font-bold">
                      {(() => {
                        const algo = keyDetails.algorithm.toUpperCase();
                        if (algo.includes('256')) return '256 bits';
                        if (algo.includes('192')) return '192 bits';
                        if (algo.includes('128')) return '128 bits';
                        if (algo.includes('80PQ')) return '160 bits';
                        return 'N/A';
                      })()}
                    </p>
                  </div>
                  <div className="rounded-full bg-green-500/10 p-3">
                    <Shield className="h-5 w-5 text-green-500" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Created</p>
                    <p className="text-lg font-semibold">
                      {keyDetails.created_at 
                        ? formatDistanceToNow(new Date(keyDetails.created_at), { addSuffix: true })
                        : 'Unknown'}
                    </p>
                  </div>
                  <div className="rounded-full bg-blue-500/10 p-3">
                    <Clock className="h-5 w-5 text-blue-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Information Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Key Information Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Info className="h-5 w-5 text-primary" />
                  Key Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <DetailItem label="Key ID" value={keyDetails.id} isMono fullWidthValue />
                {keyDetails.creation_ts && (
                  <DetailItem 
                    label="Created On" 
                    value={new Date(keyDetails.creation_ts * 1000).toLocaleString()} 
                  />
                )}
                <div className="pt-2 border-t">
                  <p className="text-sm font-medium mb-2">Tags</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">symmetric</Badge>
                    <Badge variant="secondary">{keyDetails.algorithm.toLowerCase().includes('aes') ? 'aes' : 'ascon'}</Badge>
                    {keyDetails.algorithm.toLowerCase().includes('gcm') && <Badge variant="secondary">aead</Badge>}
                    {keyDetails.algorithm.toLowerCase().includes('ascon') && <Badge variant="secondary">lightweight</Badge>}
                  </div>
                </div>
                <div className="pt-2 border-t">
                  <p className="text-sm font-medium mb-2">Metadata</p>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <div className="flex justify-between">
                      <span>User ID:</span>
                      <span className="font-mono text-xs">{keyDetails.user_id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Key Type:</span>
                      <span>Symmetric Encryption</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Security Properties Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Shield className="h-5 w-5 text-primary" />
                  Security Properties
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Security Strength and Quantum Security in one row */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Security Strength</p>
                    <div className="flex flex-col space-y-2">
                      <SymmetricKeyStrengthIndicator algorithm={keyDetails.algorithm} />
                      <p className="text-sm font-medium text-muted-foreground">
                        {(() => {
                          const algo = keyDetails.algorithm.toUpperCase();
                          if (algo.includes('80PQ')) return '80-bit post-quantum';
                          if (algo.includes('256')) return '256-bit classical';
                          if (algo.includes('192')) return '192-bit classical';
                          if (algo.includes('128')) return '128-bit classical';
                          return 'Unknown';
                        })()}
                      </p>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Quantum Security</p>
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0">
                        {keyDetails.algorithm.toUpperCase().includes('80PQ') ? (
                          <div className="rounded-full bg-purple-100 dark:bg-purple-900/20 p-2">
                            <Shield className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                          </div>
                        ) : (
                          <div className="rounded-full bg-muted p-2">
                            <Shield className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {(() => {
                            const algo = keyDetails.algorithm.toUpperCase();
                            if (algo === 'ASCON80PQ') return '80-bit Quantum Security';
                            if (algo.includes('256')) return '128-bit Quantum Security';
                            if (algo.includes('192')) return '96-bit Quantum Security';
                            if (algo.includes('128') || algo.includes('ASCON')) return '64-bit Quantum Security';
                            return 'Classical Security';
                          })()}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {(() => {
                            const algo = keyDetails.algorithm.toUpperCase();
                            if (algo === 'ASCON80PQ') return 'Provides increased post-quantum security through an extended key length'
                          })()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* AEAD and Resources side by side - larger */}
                <div className="grid grid-cols-2 gap-6 pt-4 border-t">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <AEADIndicator algorithm={keyDetails.algorithm} />
                      <div className="flex-1">
                        <p className="text-lg font-medium">
                          {(keyDetails.algorithm.toLowerCase().includes('gcm') ||
                            keyDetails.algorithm.toLowerCase().includes('ascon'))
                            ? 'AEAD' : 'Needs MAC or signature'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {(keyDetails.algorithm.toLowerCase().includes('gcm') ||
                            keyDetails.algorithm.toLowerCase().includes('ascon'))
                            ? 'Authenticated Encryption with Associated Data provides both confidentiality and integrity in a single operation'
                            : 'Requires separate Message Authentication Code (MAC) or digital signature for data integrity'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <ResourceConsumptionIndicator algorithm={keyDetails.algorithm} />
                      <div className="flex-1">
                        <p className="text-lg font-medium">
                          {keyDetails.algorithm.toLowerCase().includes('ascon')
                            ? 'Lightweight' : 'Standard'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {keyDetails.algorithm.toLowerCase().includes('ascon')
                            ? 'Optimized for IoT and constrained devices with minimal memory and processing requirements'
                            : 'Standard resource requirements that constrained devices could suffer specially if low RAM and/or no HW for AES'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Cipher Mode & Details Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Zap className="h-5 w-5 text-primary" />
                Cipher Mode Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Mode</p>
                  <Badge variant="outline" className="font-mono text-base">
                    {(() => {
                      const algo = keyDetails.algorithm.toUpperCase();
                      if (algo.includes('GCM')) return 'GCM';
                      if (algo.includes('CBC')) return 'CBC';
                      if (algo.includes('CTR')) return 'CTR';
                      if (algo.includes('ASCON')) return 'Ascon';
                      return 'N/A';
                    })()}
                  </Badge>
                  <p className="text-xs text-muted-foreground pt-1">
                    {(() => {
                      const algo = keyDetails.algorithm.toUpperCase();
                      if (algo.includes('GCM')) return 'Galois/Counter Mode';
                      if (algo.includes('CBC')) return 'Cipher Block Chaining';
                      if (algo.includes('CTR')) return 'Counter Mode';
                      if (algo.includes('ASCON')) return 'Authenticated Cipher';
                      return 'N/A';
                    })()}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Block/Stream</p>
                  <Badge variant="secondary" className="text-base">
                    {(() => {
                      const algo = keyDetails.algorithm.toUpperCase();
                      if (algo.includes('CTR')) return 'Stream';
                      if (algo.includes('ASCON')) return 'Stream';
                      return 'Block';
                    })()}
                  </Badge>
                  <p className="text-xs text-muted-foreground pt-1">
                    {(() => {
                      const algo = keyDetails.algorithm.toUpperCase();
                      if (algo.includes('CTR') || algo.includes('ASCON')) 
                        return 'Processes data as a continuous stream';
                      return 'Processes data in fixed-size blocks';
                    })()}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Parallelization</p>
                  <Badge variant={(() => {
                    const algo = keyDetails.algorithm.toUpperCase();
                    return (algo.includes('GCM') || algo.includes('CTR')) ? 'default' : 'outline';
                  })()} className="text-base">
                    {(() => {
                      const algo = keyDetails.algorithm.toUpperCase();
                      return (algo.includes('GCM') || algo.includes('CTR')) ? 'Yes' : 'No';
                    })()}
                  </Badge>
                  <p className="text-xs text-muted-foreground pt-1">
                    {(() => {
                      const algo = keyDetails.algorithm.toUpperCase();
                      if (algo.includes('GCM') || algo.includes('CTR'))
                        return 'Can encrypt/decrypt in parallel';
                      return 'Sequential processing required';
                    })()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Devices Tab */}
        <TabsContent value="devices" className="space-y-4">
          <KeyDevicesLookupCard keyId={keyDetails.id} />
        </TabsContent>

        {/* Encrypt Tab */}
        <TabsContent value="encrypt" className="space-y-4">
          {/* Configuration Section */}
          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Encryption Format</Label>
                <Select value={encryptFormat} onValueChange={(value) => {
                  setEncryptFormat(value as 'ciphertext' | 'pkcs7' | '');
                  // Clear encrypted results when format changes
                  setEncryptedText(null);
                  setEncryptedFiles([]);
                  setCustomIv('');
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select encryption format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ciphertext">Hex Format</SelectItem>
                    <SelectItem value="pkcs7">PKCS7/CMS format</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Hex format uses hex encoding for ciphertext, PKCS7/CMS format uses standard PKCS7/CMS structure.
                </p>
              </div>

              {encryptFormat && (
                <div className="space-y-2">
                  <Label>Custom IV (optional, hex-encoded)</Label>
                  <Input
                    placeholder="Leave empty for auto-generated IV"
                    value={customIv}
                    onChange={(e) => setCustomIv(e.target.value)}
                    disabled={encryptFormat === 'pkcs7'}
                  />
                  <p className="text-sm text-muted-foreground">
                    {encryptFormat === 'pkcs7' 
                      ? 'IV is automatically included in PKCS7/CMS format'
                      : 'If not provided, a random IV will be generated'
                    }
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Encrypt Text Section */}
          <Card>
            <CardHeader className="bg-primary text-primary-foreground">
              <CardTitle>Encrypt Text</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {encryptFormat && (
                <>
                  <div className="space-y-2">
                    <Label>Text to Encrypt</Label>
                    <Textarea
                      placeholder="Enter text to encrypt..."
                      value={textToEncrypt}
                      onChange={(e) => setTextToEncrypt(e.target.value)}
                      rows={4}
                    />
                  </div>

                  {textToEncrypt.trim() && (
                    <Button
                      onClick={handleEncryptText}
                      disabled={isEncrypting}
                      className="w-full"
                    >
                      {isEncrypting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Encrypting Text...
                        </>
                      ) : (
                        <>
                          <Lock className="mr-2 h-4 w-4" />
                          Encrypt Text
                        </>
                      )}
                    </Button>
                  )}

                  {encryptedText && (
                    <div className="space-y-2 mt-4">
                      <Label>Encrypted Text Result</Label>
                      <div className="border rounded-lg p-4 space-y-3">
                        <div>
                          <p className="text-sm font-medium mb-1">Ciphertext ({encryptFormat === 'ciphertext' ? 'HEX' : 'PKCS7/CMS'} format):</p>
                          <p className="text-xs font-mono bg-muted p-2 rounded break-all whitespace-pre-wrap">
                            {encryptFormat === 'pkcs7' 
                              ? encryptedText.ciphertext.match(/.{1,64}/g)?.join('\n') || encryptedText.ciphertext
                              : encryptedText.ciphertext
                            }
                          </p>
                        </div>
                        {encryptFormat !== 'pkcs7' && (
                          <div>
                            <p className="text-sm font-medium mb-1">IV (hex):</p>
                            <p className="text-xs font-mono bg-muted p-2 rounded break-all">{encryptedText.iv}</p>
                          </div>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={downloadEncryptedText}
                          className="w-full"
                        >
                          <Download className="mr-2 h-3 w-3" />
                          Download Encrypted Text
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
              {!encryptFormat && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Please select an encryption format in the Configuration section above to encrypt text.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Encrypt Files Section */}
          <Card>
            <CardHeader className="bg-primary text-primary-foreground">
              <CardTitle>Encrypt Files</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {encryptFormat && (
                <>
                  <div className="space-y-2">
                    <Label>Select Files to Encrypt</Label>
                    <div
                      {...getRootProps()}
                      className={`p-6 border-2 border-dashed rounded-md cursor-pointer transition-colors
                        ${isDragActive ? 'border-primary bg-primary/10' : 'border-border hover:border-muted-foreground/50'}
                      `}
                    >
                      <input {...getInputProps()} />
                      <div className="flex flex-col items-center justify-center text-center">
                        <UploadCloud className={`w-12 h-12 mb-2 ${
                          isDragActive ? 'text-primary' : 'text-muted-foreground'
                        }`} />
                        {isDragActive ? (
                          <p className="text-primary">Drop the files here...</p>
                        ) : (
                          <p className="text-muted-foreground">
                            Drag & drop files here, or click to select files
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {filesToEncrypt.length > 0 && (
                    <div className="space-y-2">
                      <Label>Files to Encrypt ({filesToEncrypt.length})</Label>
                      <div className="border rounded-lg divide-y max-h-40 overflow-y-auto">
                        {filesToEncrypt.map(file => (
                          <div key={file.id} className="flex items-center justify-between p-3">
                            <div className="flex-1">
                              <p className="font-medium text-sm">{file.name}</p>
                              <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(2)} KB</p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeFileToEncrypt(file.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                      <Button
                        onClick={handleEncryptFiles}
                        disabled={isEncrypting}
                        className="w-full"
                      >
                        {isEncrypting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Encrypting Files...
                          </>
                        ) : (
                          <>
                            <Lock className="mr-2 h-4 w-4" />
                            Encrypt Files
                          </>
                        )}
                      </Button>
                    </div>
                  )}

                  {encryptedFiles.length > 0 && (
                    <div className="space-y-2 mt-4">
                      <Label>Encrypted Files ({encryptedFiles.length})</Label>
                      <div className="border rounded-lg divide-y">
                        {encryptedFiles.map(file => (
                          <div key={file.id} className="p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <p className="font-medium text-sm">{file.name}</p>
                                {encryptFormat !== 'pkcs7' && (
                                  <p className="text-xs text-muted-foreground font-mono">IV: {file.iv}</p>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => downloadEncryptedFile(file)}
                                className="flex-1"
                              >
                                <Download className="mr-2 h-3 w-3" />
                                Download Encrypted
                              </Button>
                              {encryptFormat !== 'pkcs7' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => downloadIvFile(file)}
                                  className="flex-1"
                                >
                                  <Download className="mr-2 h-3 w-3" />
                                  Download IV
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
              {!encryptFormat && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Please select an encryption format in the Configuration section above to encrypt files.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Decrypt Tab */}
        <TabsContent value="decrypt" className="space-y-4">
          {/* Configuration Section */}
          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Decryption Format</Label>
                <Select value={decryptFormat} onValueChange={(value) => {
                  setDecryptFormat(value as 'ciphertext' | 'pkcs7' | '');
                  // Clear decrypted results when format changes
                  setDecryptedText('');
                  setDecryptedFiles([]);
                  setTextToDecrypt('');
                  setIvForTextDecrypt('');
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select decryption format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ciphertext">Hex Format</SelectItem>
                    <SelectItem value="pkcs7">PKCS7/CMS format</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Select the format used when encrypting (hex or PKCS7/CMS)
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Decrypt Text Section */}
          <Card>
            <CardHeader className="bg-primary text-primary-foreground">
              <CardTitle>Decrypt Text</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {decryptFormat && (
                <>
                  <div className="space-y-2">
                    <Label>Ciphertext ({decryptFormat === 'ciphertext' ? 'HEX' : 'PKCS7/CMS'} format)</Label>
                    <Textarea
                      placeholder="Enter ciphertext to decrypt..."
                      value={textToDecrypt}
                      onChange={(e) => setTextToDecrypt(e.target.value)}
                      rows={3}
                    />
                  </div>

                  {decryptFormat !== 'pkcs7' && (
                    <div className="space-y-2">
                      <Label>IV (hex-encoded)</Label>
                      <Input
                        placeholder="Enter initialization vector (IV)..."
                        value={ivForTextDecrypt}
                        onChange={(e) => setIvForTextDecrypt(e.target.value)}
                      />
                    </div>
                  )}

                  {textToDecrypt.trim() && (decryptFormat === 'pkcs7' || ivForTextDecrypt.trim()) && (
                    <Button
                      onClick={handleDecryptText}
                      disabled={isDecrypting}
                      className="w-full"
                    >
                      {isDecrypting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Decrypting Text...
                        </>
                      ) : (
                        <>
                          <FileText className="mr-2 h-4 w-4" />
                          Decrypt Text
                        </>
                      )}
                    </Button>
                  )}

                  {decryptedText && (
                    <div className="space-y-2 mt-4">
                      <Label>Decrypted Text Result</Label>
                      <div className="border rounded-lg p-4">
                        <p className="text-sm font-mono whitespace-pre-wrap">{decryptedText}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={downloadDecryptedText}
                        className="w-full"
                      >
                        <Download className="mr-2 h-3 w-3" />
                        Download Decrypted Text
                      </Button>
                    </div>
                  )}
                </>
              )}
              {!decryptFormat && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Please select a decryption format in the Configuration section above to decrypt text.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Decrypt Files Section */}
          <Card>
            <CardHeader className="bg-primary text-primary-foreground">
              <CardTitle>Decrypt Files</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {decryptFormat && (
                <>
                  <div className="space-y-2">
                    <Label>Select Encrypted Files</Label>
                    <div
                      {...getDecryptRootProps()}
                      className={`p-6 border-2 border-dashed rounded-md cursor-pointer transition-colors
                        ${isDecryptDragActive ? 'border-primary bg-primary/10' : 'border-border hover:border-muted-foreground/50'}
                      `}
                    >
                      <input {...getDecryptInputProps()} />
                      <div className="flex flex-col items-center justify-center text-center">
                        <UploadCloud className={`w-12 h-12 mb-2 ${
                          isDecryptDragActive ? 'text-primary' : 'text-muted-foreground'
                        }`} />
                        {isDecryptDragActive ? (
                          <p className="text-primary">Drop the encrypted files here...</p>
                        ) : (
                          <p className="text-muted-foreground">
                            Drag & drop encrypted files here, or click to select files
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {filesToDecrypt.length > 0 && (
                    <div className="space-y-2">
                      <Label>Files to Decrypt ({filesToDecrypt.length})</Label>
                      <div className="border rounded-lg divide-y">
                        {filesToDecrypt.map(file => (
                          <div key={file.id} className="p-3 space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <p className="font-medium text-sm">{file.name}</p>
                                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(2)} KB</p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeFileToDecrypt(file.id)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs">IV (hex-encoded)</Label>
                              <div className="flex gap-2">
                                <Input
                                  placeholder="Enter IV or upload .iv file"
                                  value={file.iv}
                                  onChange={(e) => updateFileIv(file.id, e.target.value)}
                                  className="flex-1 font-mono text-xs"
                                  disabled={decryptFormat === 'pkcs7'}
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => document.getElementById(`iv-file-${file.id}`)?.click()}
                                  disabled={decryptFormat === 'pkcs7'}
                                >
                                  <Upload className="h-4 w-4" />
                                </Button>
                                <input
                                  id={`iv-file-${file.id}`}
                                  type="file"
                                  accept=".iv,text/plain"
                                  className="hidden"
                                  onChange={(e) => handleIvFileUpload(e, file.id)}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <Button
                        onClick={handleDecryptFiles}
                        disabled={isDecrypting || filesToDecrypt.some(f => decryptFormat !== 'pkcs7' && !f.iv.trim())}
                        className="w-full"
                      >
                        {isDecrypting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Decrypting Files...
                          </>
                        ) : (
                          <>
                            <FileText className="mr-2 h-4 w-4" />
                            Decrypt Files
                          </>
                        )}
                      </Button>
                    </div>
                  )}

                  {decryptedFiles.length > 0 && (
                    <div className="space-y-2 mt-4">
                      <Label>Decrypted Files ({decryptedFiles.length})</Label>
                      <div className="border rounded-lg divide-y">
                        {decryptedFiles.map(file => (
                          <div key={file.id} className="flex items-center justify-between p-3">
                            <div className="flex-1">
                              <p className="font-medium text-sm">{file.name}</p>
                              <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(2)} KB</p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => downloadDecryptedFile(file)}
                            >
                              <Download className="mr-2 h-3 w-3" />
                              Download
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
              {!decryptFormat && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Please select a decryption format in the Configuration section above to decrypt files.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* MAC Tab */}
        <TabsContent value="mac" className="space-y-6">
          {/* Configuration Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                MAC Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="mac-algorithm">MAC Algorithm</Label>
                <Select 
                  value={macAlgorithm} 
                  onValueChange={(v) => {
                    setMacAlgorithm(v as 'HMAC-SHA3-256' | 'AES-CMAC' | 'ASCON-MAC' | '');
                    setComputedMac(null);
                    setMacVerifyResult(null);
                  }}
                >
                  <SelectTrigger id="mac-algorithm">
                    <SelectValue placeholder="Select MAC algorithm" />
                  </SelectTrigger>
                  <SelectContent>
                    {getAvailableMacAlgorithms().map(algo => (
                      <SelectItem key={algo.value} value={algo.value}>
                        {algo.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {keyDetails?.algorithm.toUpperCase().startsWith('AES') 
                    ? 'AES keys support HMAC-SHA3-256 and AES-CMAC algorithms.'
                    : 'Ascon keys support ASCON-MAC algorithm.'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Compute MAC Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Compute MAC
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {macAlgorithm ? (
                <>
                  {/* Text Input */}
                  <div className="space-y-2">
                    <Label htmlFor="mac-data">Text Data {macDataFile && <span className="text-xs text-muted-foreground">(file will be used instead)</span>}</Label>
                    <Textarea
                      id="mac-data"
                      placeholder="Enter the text data to compute MAC for..."
                      value={macDataInput}
                      onChange={(e) => setMacDataInput(e.target.value)}
                      rows={4}
                      className={macDataFile ? 'opacity-50' : ''}
                    />
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex-1 border-t border-muted" />
                    <span className="text-xs text-muted-foreground">OR drop a file (takes priority)</span>
                    <div className="flex-1 border-t border-muted" />
                  </div>

                  {/* File Drop Zone */}
                  <div className="space-y-2">
                    <Label>File Input (drag & drop)</Label>
                    <div
                      {...getMacComputeRootProps()}
                      className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                        isMacComputeDragActive 
                          ? 'border-primary bg-primary/5' 
                          : macDataFile 
                            ? isMacDataFileLoading 
                              ? 'border-yellow-500 bg-yellow-500/5' 
                              : 'border-green-500 bg-green-500/5' 
                            : 'border-muted-foreground/25 hover:border-primary/50'
                      }`}
                    >
                      <input {...getMacComputeInputProps()} />
                      {macDataFile ? (
                        <div className="flex items-center justify-center gap-2">
                          {isMacDataFileLoading ? (
                            <Loader2 className="h-5 w-5 text-yellow-500 animate-spin" />
                          ) : (
                            <FileIcon className="h-5 w-5 text-green-500" />
                          )}
                          <span className="font-medium">{macDataFile.name}</span>
                          <span className="text-xs text-muted-foreground">
                            ({(macDataFile.size / 1024 / 1024).toFixed(2)} MB)
                            {isMacDataFileLoading && (
                              <Badge variant="outline" className="ml-2 text-yellow-600">Loading...</Badge>
                            )}
                            {!isMacDataFileLoading && macDataFile.size > 2 * 1024 * 1024 && (
                              <Badge variant="outline" className="ml-2">Stream</Badge>
                            )}
                            {!isMacDataFileLoading && macDataFile.size <= 2 * 1024 * 1024 && (
                              <Badge variant="outline" className="ml-2 text-green-600">Ready</Badge>
                            )}
                          </span>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              setMacDataFile(null); 
                              setMacDataFileBase64(null);
                              setIsMacDataFileLoading(false);
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="text-muted-foreground">
                          <UploadCloud className="h-8 w-8 mx-auto mb-2" />
                          <p className="text-sm">Drop a file here or click to browse</p>
                          <p className="text-xs mt-1">Files &gt;2MB use streaming endpoint</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={handleComputeMac}
                      disabled={isComputingMac || isMacDataFileLoading || (!macDataInput.trim() && !macDataFile)}
                      className="flex-1"
                    >
                    {isComputingMac ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Computing MAC...
                      </>
                    ) : (
                      <>
                        <Shield className="mr-2 h-4 w-4" />
                        Compute MAC
                      </>
                    )}
                    </Button>
                    {computeMacAbortController && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          computeMacAbortController.abort();
                          setComputeMacAbortController(null);
                          setIsComputingMac(false);
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>

                  {computedMac && (
                    <div className="space-y-2 p-4 bg-muted rounded-lg">
                      <Label>Computed MAC (hex-encoded)</Label>
                      <div className="flex gap-2">
                        <Input
                          value={computedMac}
                          readOnly
                          className="font-mono text-xs flex-1"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            navigator.clipboard.writeText(computedMac);
                            toast({ title: "Copied", description: "MAC copied to clipboard." });
                          }}
                        >
                          Copy
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Please select a MAC algorithm in the Configuration section above.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Verify MAC Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Verify MAC
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {macAlgorithm ? (
                <>
                  {/* Text Input */}
                  <div className="space-y-2">
                    <Label htmlFor="verify-data">Text Data {macVerifyFile && <span className="text-xs text-muted-foreground">(file will be used instead)</span>}</Label>
                    <Textarea
                      id="verify-data"
                      placeholder="Enter the original text data..."
                      value={macVerifyDataInput}
                      onChange={(e) => {
                        setMacVerifyDataInput(e.target.value);
                        setMacVerifyResult(null);
                      }}
                      rows={4}
                      className={macVerifyFile ? 'opacity-50' : ''}
                    />
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex-1 border-t border-muted" />
                    <span className="text-xs text-muted-foreground">OR drop a file (takes priority)</span>
                    <div className="flex-1 border-t border-muted" />
                  </div>

                  {/* File Drop Zone */}
                  <div className="space-y-2">
                    <Label>File Input (drag & drop)</Label>
                    <div
                      {...getMacVerifyRootProps()}
                      className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                        isMacVerifyDragActive 
                          ? 'border-primary bg-primary/5' 
                          : macVerifyFile 
                            ? isMacVerifyFileLoading 
                              ? 'border-yellow-500 bg-yellow-500/5' 
                              : 'border-green-500 bg-green-500/5' 
                            : 'border-muted-foreground/25 hover:border-primary/50'
                      }`}
                    >
                      <input {...getMacVerifyInputProps()} />
                      {macVerifyFile ? (
                        <div className="flex items-center justify-center gap-2">
                          {isMacVerifyFileLoading ? (
                            <Loader2 className="h-5 w-5 text-yellow-500 animate-spin" />
                          ) : (
                            <FileIcon className="h-5 w-5 text-green-500" />
                          )}
                          <span className="font-medium">{macVerifyFile.name}</span>
                          <span className="text-xs text-muted-foreground">
                            ({(macVerifyFile.size / 1024 / 1024).toFixed(2)} MB)
                            {isMacVerifyFileLoading && (
                              <Badge variant="outline" className="ml-2 text-yellow-600">Loading...</Badge>
                            )}
                            {!isMacVerifyFileLoading && macVerifyFile.size > 2 * 1024 * 1024 && (
                              <Badge variant="outline" className="ml-2">Stream</Badge>
                            )}
                            {!isMacVerifyFileLoading && macVerifyFile.size <= 2 * 1024 * 1024 && (
                              <Badge variant="outline" className="ml-2 text-green-600">Ready</Badge>
                            )}
                          </span>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              setMacVerifyFile(null); 
                              setMacVerifyFileBase64(null); 
                              setIsMacVerifyFileLoading(false);
                              setMacVerifyResult(null);
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="text-muted-foreground">
                          <UploadCloud className="h-8 w-8 mx-auto mb-2" />
                          <p className="text-sm">Drop a file here or click to browse</p>
                          <p className="text-xs mt-1">Files &gt;2MB use streaming endpoint</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mac-to-verify">MAC to Verify (hex-encoded)</Label>
                    <Input
                      id="mac-to-verify"
                      placeholder="Enter the MAC to verify..."
                      value={macToVerify}
                      onChange={(e) => {
                        setMacToVerify(e.target.value);
                        setMacVerifyResult(null);
                      }}
                      className="font-mono"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={handleVerifyMac}
                      disabled={isVerifyingMac || isMacVerifyFileLoading || (!macVerifyDataInput.trim() && !macVerifyFile) || !macToVerify.trim()}
                      className="flex-1"
                    >
                    {isVerifyingMac ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verifying MAC...
                      </>
                    ) : (
                      <>
                        <Shield className="mr-2 h-4 w-4" />
                        Verify MAC
                      </>
                    )}
                    </Button>
                    {verifyMacAbortController && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          verifyMacAbortController.abort();
                          setVerifyMacAbortController(null);
                          setIsVerifyingMac(false);
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>

                  {macVerifyResult !== null && (
                    <Alert variant={macVerifyResult ? "default" : "destructive"}>
                      <Shield className="h-4 w-4" />
                      <AlertTitle>{macVerifyResult ? "MAC Valid" : "MAC Invalid"}</AlertTitle>
                      <AlertDescription>
                        {macVerifyResult 
                          ? "The MAC is valid and matches the provided data."
                          : "The MAC does not match the provided data. The data may have been tampered with."}
                      </AlertDescription>
                    </Alert>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Please select a MAC algorithm in the Configuration section above.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </BreadcrumbPage>
  );
}