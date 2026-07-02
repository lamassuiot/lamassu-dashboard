
'use client';

import React from 'react';
import Image from 'next/image';
import { DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import LogoWhite from '@/app/lamassu_logo_white.svg';

interface DialogBrandHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function DialogBrandHeader({ title, subtitle, action }: DialogBrandHeaderProps) {
  return (
    <div className="bg-header text-header-foreground flex items-center justify-between px-5 py-4 border-b border-header-foreground/15">
      <div className="flex items-center gap-3">
        <Image
          src={LogoWhite}
          width={28}
          height={28}
          alt=""
          aria-hidden="true"
          className="shrink-0"
        />
        <div>
          {subtitle && (
            <p className="text-[10px] font-semibold uppercase tracking-widest text-header-foreground/60 leading-none mb-1">
              {subtitle}
            </p>
          )}
          <DialogTitle className="text-sm font-semibold text-header-foreground leading-none">
            {title}
          </DialogTitle>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {action}
        <DialogClose asChild>
          <Button variant="ghost" size="icon-sm">
            <X />
            <span className="sr-only">Close</span>
          </Button>
        </DialogClose>
      </div>
    </div>
  );
}
