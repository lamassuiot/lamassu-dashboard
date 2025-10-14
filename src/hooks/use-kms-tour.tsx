'use client';

import { useState, useEffect } from 'react';
import type { TourStep } from '@/components/ui/tour-overlay';

const TOUR_COOKIE_KEY = 'lamassu-kms-tour-completed';

// Cookie utility functions
const setCookie = (name: string, value: string, days: number = 365) => {
    const expires = new Date();
    expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
};

const getCookie = (name: string): string | null => {
    const nameEQ = name + '=';
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
};

const deleteCookie = (name: string) => {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
};

interface UseKmsTourProps {
    isAuthenticated?: boolean;
    authLoading?: boolean;
}

export const useKmsTour = (props?: UseKmsTourProps) => {
    const [isTourVisible, setIsTourVisible] = useState(false);
    const [tourCompleted, setTourCompleted] = useState(false);

    // Define tour steps for the KMS page
    const tourSteps: TourStep[] = [
        {
            id: 'welcome',
            target: 'body',
            title: 'Welcome to Key Management Service',
            content: 'Welcome to the KMS section! This tour will help you understand how to manage asymmetric keys used for signing, verification, and other cryptographic operations in your PKI infrastructure.',
            position: 'bottom'
        },
        {
            id: 'page-header',
            target: '[data-tour="kms-page-header"]',
            title: 'KMS Overview',
            content: 'This page manages asymmetric keys in your Key Management Service. These keys are essential for PKI operations like certificate signing and digital signatures.',
            position: 'bottom',
            offset: { x: 0, y: -20 }
        },
        {
            id: 'create-key-button',
            target: '[data-tour="create-key-button"]',
            title: 'Create New Keys',
            content: 'Click here to create new asymmetric key pairs. You can generate RSA or ECDSA keys with various sizes and configurations to meet your security requirements.',
            position: 'left',
            offset: { x: -10, y: -20 }
        },
        {
            id: 'refresh-button',
            target: '[data-tour="kms-refresh-button"]',
            title: 'Refresh Keys',
            content: 'Use this button to refresh the key list and get the latest information from your KMS. This is useful when keys are created or modified outside the dashboard.',
            position: 'left',
            offset: { x: -10, y: -20 }
        },
        {
            id: 'filter-section',
            target: '[data-tour="kms-filter-section"]',
            title: 'Filter Keys',
            content: 'Use the search filter to quickly find specific keys by their alias. This is particularly useful when managing large numbers of keys.',
            position: 'right',
            offset: { x: 10, y: -20 }
        },
        {
            id: 'keys-table',
            target: '[data-tour="kms-keys-table"]',
            title: 'Keys Overview',
            content: 'This table shows all your asymmetric keys with their alias, type (RSA/ECDSA), strength indicator, and the crypto engine where they are stored. Click on any key alias to view detailed information.',
            position: 'top',
            offset: { x: 0, y: -30 }
        },
        {
            id: 'key-actions',
            target: '[data-tour="kms-key-actions"]',
            title: 'Key Operations',
            content: 'Each key has actions available: view details, generate Certificate Signing Requests (CSR), perform sign/verify operations, or delete the key. These operations depend on whether the key has a private component.',
            position: 'left',
            offset: { x: -10, y: -20 }
        },
        {
            id: 'crypto-engine-info',
            target: '[data-tour="kms-crypto-engine"]',
            title: 'Crypto Engine Information',
            content: 'This column shows which crypto engine stores the key. Different engines (like AWS KMS, PKCS#11, etc.) provide different security and management capabilities.',
            position: 'top',
            offset: { x: 0, y: -30 }
        },
        {
            id: 'pagination-controls',
            target: '[data-tour="kms-pagination"]',
            title: 'Pagination Controls',
            content: 'Navigate through large numbers of keys using these pagination controls. You can also adjust the page size to show more or fewer keys per page.',
            position: 'top',
            offset: { x: 0, y: -30 }
        },
        {
            id: 'completion',
            target: 'body',
            title: 'KMS Tour Complete!',
            content: 'You now understand the Key Management Service interface! Use this section to create, manage, and operate your cryptographic keys. Remember that these keys are crucial for your PKI security.',
            position: 'bottom'
        }
    ];

    useEffect(() => {
        // Check if tour has been completed before using cookies
        const completed = getCookie(TOUR_COOKIE_KEY) === 'true';
        setTourCompleted(completed);

        // Show tour automatically if not completed, user is authenticated, and not loading
        if (!completed && props?.isAuthenticated && !props?.authLoading) {
            // Small delay to ensure page is fully loaded
            const timer = setTimeout(() => {
                setIsTourVisible(true);
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [props?.isAuthenticated, props?.authLoading]);

    const startTour = () => {
        setTourCompleted(false);
        deleteCookie(TOUR_COOKIE_KEY);
        setIsTourVisible(true);
    };

    const completeTour = () => {
        setIsTourVisible(false);
        setTourCompleted(true);
        setCookie(TOUR_COOKIE_KEY, 'true');
    };

    const skipTour = () => {
        setIsTourVisible(false);
        setTourCompleted(true);
        setCookie(TOUR_COOKIE_KEY, 'true');
    };

    const resetTour = () => {
        setTourCompleted(false);
        deleteCookie(TOUR_COOKIE_KEY);
    };

    return {
        isTourVisible,
        tourCompleted,
        tourSteps,
        startTour,
        completeTour,
        skipTour,
        resetTour,
    };
};