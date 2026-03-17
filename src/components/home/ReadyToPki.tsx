
'use client';

import React from 'react';

import LogoBlue from '@/app/lamassu_logo_blue.svg';

export const ReadyToPki: React.FC = () => {
    return (
        <div className="text-center animate-fade-in w-full flex flex-col items-center">
            <img
                src={LogoBlue}
                alt="Lamassu Logo"
                width={100}
                height={100}
                className="mb-6 lamassu-logo-theme-filter"
            />
            <h2 className="text-3xl font-bold mt-6 text-foreground">
                Ready to PKI!
            </h2>
            <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                All initial setup tasks are complete. You can now proceed to manage your PKI.
            </p>
        </div>
    );
};
