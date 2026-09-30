'use client';

import React, { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { CERTIFICATE_FILE_EXTENSIONS, CERTIFICATE_MAX_FILE_SIZE, loadCertificateFilesAsPem } from '@/lib/certificate-files';

type CertificatePemTextareaProps = Omit<React.ComponentProps<'textarea'>, 'value'> & {
  value: string;
  onValueChange: (value: string) => void;
  allowedExtensions?: string[];
  maxFileSize?: number;
  multipleFiles?: boolean;
};

export function CertificatePemTextarea({
  value,
  onValueChange,
  allowedExtensions = CERTIFICATE_FILE_EXTENSIONS,
  maxFileSize = CERTIFICATE_MAX_FILE_SIZE,
  multipleFiles = false,
  className,
  disabled,
  readOnly,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  ...props
}: CertificatePemTextareaProps) {
  const [isDragging, setIsDragging] = useState(false);

  const canAcceptDrop = !disabled && !readOnly;

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    onValueChange(event.target.value);
    props.onChange?.(event);
  };

  const handleDragEnter = (event: React.DragEvent<HTMLTextAreaElement>) => {
    onDragEnter?.(event);
    if (!canAcceptDrop || event.defaultPrevented) return;
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLTextAreaElement>) => {
    onDragLeave?.(event);
    if (!canAcceptDrop || event.defaultPrevented) return;
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLTextAreaElement>) => {
    onDragOver?.(event);
    if (!canAcceptDrop || event.defaultPrevented) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsDragging(true);
  };

  const handleDrop = async (event: React.DragEvent<HTMLTextAreaElement>) => {
    onDrop?.(event);
    if (!canAcceptDrop || event.defaultPrevented) return;

    event.preventDefault();
    setIsDragging(false);

    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length > 0) {
      const selectedFiles = multipleFiles ? files : files.slice(0, 1);
      const pem = await loadCertificateFilesAsPem(selectedFiles, { allowedExtensions, maxFileSize });
      if (pem !== null) onValueChange(pem);
      return;
    }

    const droppedText = event.dataTransfer.getData('text/plain');
    if (droppedText) onValueChange(droppedText);
  };

  return (
    <Textarea
      {...props}
      value={value}
      onChange={handleChange}
      disabled={disabled}
      readOnly={readOnly}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={cn(
        'transition-colors',
        isDragging && 'border-primary bg-primary/5 ring-3 ring-ring/30',
        className
      )}
    />
  );
}
