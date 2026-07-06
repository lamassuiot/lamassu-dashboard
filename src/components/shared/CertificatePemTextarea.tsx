'use client';

import React, { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { sileo } from '@/lib/toast';

const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024;
const DEFAULT_ALLOWED_EXTENSIONS = ['.pem', '.crt', '.cer'];

type CertificatePemTextareaProps = Omit<React.ComponentProps<'textarea'>, 'value'> & {
  value: string;
  onValueChange: (value: string) => void;
  allowedExtensions?: string[];
  maxFileSize?: number;
  multipleFiles?: boolean;
};

const extensionFor = (fileName: string) => {
  const index = fileName.lastIndexOf('.');
  return index >= 0 ? fileName.slice(index).toLowerCase() : '';
};

export function CertificatePemTextarea({
  value,
  onValueChange,
  allowedExtensions = DEFAULT_ALLOWED_EXTENSIONS,
  maxFileSize = DEFAULT_MAX_FILE_SIZE,
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
      const invalidFile = selectedFiles.find(file => !allowedExtensions.includes(extensionFor(file.name)));
      if (invalidFile) {
        sileo.error({
          title: 'Invalid File Type',
          description: `Only ${allowedExtensions.join(', ')} files are supported.`,
        });
        return;
      }

      const oversizedFile = selectedFiles.find(file => file.size > maxFileSize);
      if (oversizedFile) {
        sileo.error({
          title: 'File Too Large',
          description: `File size must be less than ${maxFileSize / 1024 / 1024}MB.`,
        });
        return;
      }

      try {
        const contents = await Promise.all(selectedFiles.map(file => file.text()));
        onValueChange(contents.join('\n'));
      } catch {
        sileo.error({ title: 'File Read Error', description: 'Could not read the certificate file.' });
      }
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
