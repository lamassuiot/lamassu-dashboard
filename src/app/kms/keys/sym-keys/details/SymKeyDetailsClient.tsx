'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDropzone } from 'react-dropzone';
import { ArrowLeft, Lock, Info, FileText, Loader2, AlertTriangle, Upload, Download, Plus, X, UploadCloud, File as FileIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';
import { DetailItem } from '@/components/shared/DetailItem';
import { 
  fetchSymmetricKeys, 
  encryptWithSymmetricKey, 
  decryptWithSymmetricKey,
  type SymmetricKey,
  type EncryptRequest,
  type DecryptRequest 
} from '@/lib/symkms-api';
import { formatDistanceToNow } from 'date-fns';

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
      const allKeys = await fetchSymmetricKeys(userId, user.access_token);
      const key = allKeys.find(k => k.id === keyId);

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

        const response = await encryptWithSymmetricKey(request, user.access_token);
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

      const response = await encryptWithSymmetricKey(request, user.access_token);
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

      const response = await decryptWithSymmetricKey(request, user.access_token);
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

        const response = await decryptWithSymmetricKey(request, user.access_token);
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
    <div className="space-y-6 w-full pb-8">
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
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">
            <Info className="mr-2 h-4 w-4" /> Overview
          </TabsTrigger>
          <TabsTrigger value="encrypt">
            <Lock className="mr-2 h-4 w-4" /> Encrypt
          </TabsTrigger>
          <TabsTrigger value="decrypt">
            <FileText className="mr-2 h-4 w-4" /> Decrypt
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Key Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <DetailItem label="Key ID" value={keyDetails.id} />
              <DetailItem label="Algorithm" value={<Badge variant="outline">{keyDetails.algorithm}</Badge>} />
              <DetailItem label="User ID" value={keyDetails.user_id} />
              {keyDetails.created_at && (
                <DetailItem 
                  label="Created" 
                  value={formatDistanceToNow(new Date(keyDetails.created_at), { addSuffix: true })} 
                />
              )}
            </CardContent>
          </Card>
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
                    <SelectItem value="ciphertext">Hex Format (ciphertext)</SelectItem>
                    <SelectItem value="pkcs7">PKCS7/CMS format</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Hex format uses hex encoding for ciphertext, PKCS7/CMS format uses base64 encoding
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
                    <SelectItem value="ciphertext">Hex Format (ciphertext)</SelectItem>
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
      </Tabs>
    </div>
  );
}


