
'use client';

import React, { useEffect, useRef, useState } from 'react';
import '@scalar/api-reference/style.css';

const servicesToCheck = [
    { name: 'KMS Service', url: 'http://localhost:5500/docs/kms-openapi.yaml' },
];

export default function OpenAPISpecPage() {
    const apiReferenceRef = useRef<HTMLDivElement>(null);
    const scalarInstanceRef = useRef<any>(null);
    const [theme, setTheme] = useState<'light' | 'dark'>('light');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        // Detect initial theme from cookie or system preference
        const cookieValue = document.cookie.match(/theme=(light|dark)/)?.[1];
        const isDark = document.documentElement.classList.contains('dark');
        
        if (isDark || cookieValue === 'dark' || (cookieValue !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            setTheme('dark');
        } else {
            setTheme('light');
        }

        setMounted(true);

        // Watch for theme changes via MutationObserver
        const observer = new MutationObserver(() => {
            const isDark = document.documentElement.classList.contains('dark');
            console.log('Theme changed to:', isDark ? 'dark' : 'light');
            setTheme(isDark ? 'dark' : 'light');
        });

        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class'],
        });

        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!apiReferenceRef.current || !mounted) return;

        console.log('Rendering Scalar with theme:', theme);

        // Dynamically import and initialize the Scalar API Reference
        import('@scalar/api-reference').then((module) => {
            if (apiReferenceRef.current) {
                // Clear previous instance
                apiReferenceRef.current.innerHTML = '';
                
                const container = document.createElement('div');
                apiReferenceRef.current.appendChild(container);
                
                // Store the instance
                scalarInstanceRef.current = module.createApiReference(container, {
                    url: servicesToCheck[0].url,
                    darkMode: theme === 'dark',
                });
            }
        }).catch(error => {
            console.error('Failed to load API Reference:', error);
        });
    }, [theme, mounted]);

    return (
        <div className="container mx-auto p-6 max-w-full">
            <div ref={apiReferenceRef} className="min-h-[calc(100vh-100px)]" />
        </div>
    );
}
