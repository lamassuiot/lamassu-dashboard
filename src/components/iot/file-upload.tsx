// src/components/iot/file-upload.tsx
"use client";

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, File as FileIcon, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UploadProgressBar, type UploadProgressInfo } from '@/components/shared/UploadProgressBar';
import { formatBytes } from '@/lib/utils';

interface FileUploadProps {
  // Returns true on success, false on failure. Uploads that are worth a progress bar report through
  // the callback; handlers that only read the file locally can ignore it.
  onFileUpload: (file: File, onProgress: (progress: UploadProgressInfo) => void) => Promise<boolean>;
  maxFileSize?: number; // in bytes
  label: string;
}

export function FileUpload({ 
  onFileUpload, 
  maxFileSize = 50 * 1024 * 1024, // Default 50MB
  label,
}: FileUploadProps) {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressInfo | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[], fileRejections: any[]) => {
    setErrorMessage(null);
    setUploadStatus('idle');
    setUploadedFile(null);
    setUploadProgress(null);

    if (fileRejections.length > 0) {
      const errors = fileRejections[0].errors.map((err: any) => err.message).join(', ');
      setErrorMessage(`File rejected: ${errors}`);
      setUploadStatus('error');
      return;
    }

    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      setUploadedFile(file);
      setUploadStatus('uploading');
      
      try {
        const success = await onFileUpload(file, setUploadProgress);
        if (success) {
          setUploadStatus('success');
        } else {
          setUploadStatus('error');
          setErrorMessage('Upload failed. Please try again.');
        }
      } catch (error) {
        setUploadStatus('error');
        setErrorMessage( (error as Error).message || 'An unknown error occurred during upload.');
        console.error("Upload error:", error);
      } finally {
        setUploadProgress(null);
      }
    }
  }, [onFileUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: undefined, // Allow all file types
    maxSize: maxFileSize,
    multiple: false,
  });

  const clearFile = () => {
    setUploadedFile(null);
    setUploadProgress(null);
    setUploadStatus('idle');
    setErrorMessage(null);
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <div
        {...getRootProps()}
        className={`p-6 border-2 border-dashed rounded-md cursor-pointer transition-colors
          ${isDragActive ? 'border-primary bg-primary/10' : 'border-border hover:border-muted-foreground/50'}
          ${uploadStatus === 'error' ? 'border-destructive bg-destructive/10' : ''}
          ${uploadStatus === 'success' ? 'border-green-500 bg-green-500/10' : ''}
        `}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center justify-center text-center">
          <UploadCloud className={`w-12 h-12 mb-2 ${
            isDragActive ? 'text-primary' : 
            uploadStatus === 'error' ? 'text-destructive' : 
            uploadStatus === 'success' ? 'text-green-500' : 'text-muted-foreground'
          }`} />
          {isDragActive ? (
            <p className="text-primary">Drop the file here...</p>
          ) : uploadedFile && uploadStatus !== 'error' ? (
            <div className="text-sm text-foreground">
              <FileIcon className="w-4 h-4 inline mr-1" />
              {uploadedFile.name} ({formatBytes(uploadedFile.size, 2)})
            </div>
          ) : (
            <p className="text-muted-foreground">
              Drag & drop file here, or click to select file
            </p>
          )}
          {/* Removed display of acceptedFileTypes */}
          {maxFileSize && <p className="text-xs text-muted-foreground/80 mt-1">Max size: {formatBytes(maxFileSize, 0)}</p>}
        </div>
      </div>

      {uploadStatus === 'uploading' && (
        <UploadProgressBar progress={uploadProgress} className="mt-2" />
      )}
      
      {uploadStatus === 'success' && (
        <div className="flex items-center text-sm text-green-600 mt-2">
          <CheckCircle className="w-4 h-4 mr-2" />
          File uploaded successfully!
          <Button variant="link" size="sm" onClick={clearFile} className="ml-auto text-primary">Upload another</Button>
        </div>
      )}

      {uploadStatus === 'error' && errorMessage && (
        <div className="flex items-center text-sm text-destructive mt-2">
          <XCircle className="w-4 h-4 mr-2" />
          {errorMessage}
           <Button variant="link" size="sm" onClick={clearFile} className="ml-auto">Try again</Button>
        </div>
      )}
    </div>
  );
}
