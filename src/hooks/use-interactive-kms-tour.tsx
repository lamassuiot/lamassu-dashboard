'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTourContext } from '@/contexts/TourContext';
import type { TourStep } from '@/components/ui/tour-overlay';

const TOUR_COOKIE_KEY = 'lamassu-interactive-kms-tour-completed';

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

interface UseInteractiveKmsTourProps {
    isAuthenticated?: boolean;
    authLoading?: boolean;
}

export const useInteractiveKmsTour = (props?: UseInteractiveKmsTourProps) => {
    const router = useRouter();
    const tourContext = useTourContext();
    const [tourCompleted, setTourCompleted] = useState(false);
    
    const tourId = 'interactive-kms';
    const isTourVisible = tourContext.isTourActive(tourId);
    const currentStep = tourContext.tourState.currentStep;

    // Define interactive tour steps for creating a KMS key and signing data
    const tourSteps: TourStep[] = [
        {
            id: 'welcome',
            target: 'body',
            title: 'Interactive KMS Tour',
            content: 'Welcome to the interactive KMS tour! You\'ll learn how to create a new cryptographic key and use it to sign data. This tour will guide you through real actions in the interface.',
            position: 'bottom'
        },
        {
            id: 'navigate-to-create',
            target: '[data-tour="create-key-button"]',
            title: 'Create Your First Key',
            content: 'Click the "Create New Key" button to start creating a cryptographic key. This will take you to the key creation form.',
            position: 'bottom',
            offset: { x: -50, y: 10 },
            interactive: {
                type: 'click',
                action: '[data-tour="create-key-button"]',
                skipNextButton: true,
                completionText: 'Great! Now we\'ll navigate to the key creation page.',
                autoAdvance: true,
                autoAdvanceDelay: 0
            }
        },
        {
            id: 'select-creation-method',
            target: '[data-tour="key-creation-method"]',
            title: 'Choose Key Creation Method',
            content: 'Now you need to select how to create your key. Click on "Generate New Key Pair" to create a fresh cryptographic key pair.',
            position: 'bottom',
            offset: { x: 0, y: 10 },
            interactive: {
                type: 'click',
                action: '[data-tour="key-creation-method"]',
                skipNextButton: true,
                completionText: 'Great! You\'ve selected the key generation method.',
                autoAdvance: true,
                autoAdvanceDelay: 0
            }
        },
        {
            id: 'fill-key-alias',
            target: '[data-tour="key-alias-input"]',
            title: 'Enter Key Alias',
            content: 'First, let\'s give your key a memorable alias. Enter "my-signing-key" in the alias field. This helps you identify the key later.',
            position: 'bottom',
            offset: { x: 0, y: 10 },
            interactive: {
                type: 'form',
                formFields: [
                    { selector: '[data-tour="key-alias-input"]', value: 'my-signing-key', type: 'input' }
                ],
                skipNextButton: true,
                completionText: 'Excellent! Your key now has an alias.'
            }
        },
        {
            id: 'select-algorithm',
            target: '[data-tour="algorithm-select"]',
            title: 'Choose Algorithm',
            content: 'Now select the cryptographic algorithm. Any available algorithm will work for this demo.',
            position: 'bottom',
            offset: { x: 0, y: 10 },
            interactive: {
                type: 'form',
                formFields: [
                    { selector: '[data-tour="algorithm-select"]', type: 'select' }
                ],
                skipNextButton: false,
                completionText: 'Great choice! You have selected an algorithm.'
            }
        },
        {
            id: 'select-key-size',
            target: '[data-tour="key-size-select"]',
            title: 'Choose Key Size',
            content: 'Select the key size. Any available option will work for this demo.',
            position: 'bottom',
            offset: { x: 0, y: 10 },
            interactive: {
                type: 'form',
                formFields: [
                    { selector: '[data-tour="key-size-select"]', type: 'select' }
                ],
                skipNextButton: true,
                completionText: 'Great! You have selected a key size.'
            }
        },
        {
            id: 'submit-key-creation',
            target: '[data-tour="create-key-submit"]',
            title: 'Create the Key',
            content: 'Now click "Create Key" to generate your cryptographic key pair. This will create both a private key (for signing) and a public key (for verification).',
            position: 'bottom',
            offset: { x: 0, y: 10 },
            targetPadding: 8,
            interactive: {
                type: 'click',
                action: '[data-tour="create-key-submit"]',
                skipNextButton: true,
                completionText: 'Key creation initiated! Wait for it to complete.'
            }
        },
        {
            id: 'wait-for-key-created',
            target: 'body',
            title: 'Creating Your Key',
            content: 'Your key is being created. This may take a few moments...',
            position: 'bottom',
            interactive: {
                type: 'wait',
                waitForSelector: '[data-tour="key-created-success"]',
                completionText: 'Excellent! Your key has been created successfully.'
            }
        },
        {
            id: 'navigate-to-key-details',
            target: '[data-tour="view-key-details"]',
            title: 'View Key Details',
            content: 'Now let\'s look at your newly created key. Click "View Details" to see the key information and available operations.',
            position: 'bottom',
            offset: { x: 0, y: 10 },
            targetPadding: 6,
            interactive: {
                type: 'click',
                action: '[data-tour="view-key-details"]',
                skipNextButton: true,
                completionText: 'Navigating to key details...'
            }
        },
        {
            id: 'wait-for-details-page',
            target: 'body',
            title: 'Loading Key Details',
            content: 'Loading the key details page where you can perform cryptographic operations...',
            position: 'bottom',
            interactive: {
                type: 'wait',
                waitForSelector: '[data-tour="key-details-loaded"]',
                completionText: 'Perfect! Now you can see all the key information.'
            }
        },
        {
            id: 'navigate-to-sign-verify',
            target: '[data-tour="sign-verify-tab"]',
            title: 'Sign & Verify Operations',
            content: 'Click on the "Sign / Verify" tab to learn how to use your key for digital signatures.',
            position: 'bottom',
            offset: { x: 0, y: 10 },
            targetPadding: 6,
            interactive: {
                type: 'click',
                action: '[data-tour="sign-verify-tab"]',
                skipNextButton: true,
                completionText: 'Great! Now you\'re in the signing interface.'
            }
        },
        {
            id: 'enter-data-to-sign',
            target: '[data-tour="data-input"]',
            title: 'Enter Data to Sign',
            content: 'Enter some sample data to sign. Try typing "Hello, PKI world!" in the data field.',
            position: 'bottom',
            offset: { x: 0, y: 10 },
            targetPadding: 6,
            interactive: {
                type: 'form',
                formFields: [
                    { selector: '[data-tour="data-input"]', value: 'Hello, PKI world!', type: 'textarea' }
                ],
                skipNextButton: true,
                completionText: 'Perfect! You\'ve entered data to sign.'
            }
        },
        {
            id: 'sign-data',
            target: '[data-tour="sign-button"]',
            title: 'Sign the Data',
            content: 'Now click "Sign Data" to create a digital signature using your private key. This proves the data came from you and hasn\'t been tampered with.',
            position: 'bottom',
            offset: { x: 0, y: 10 },
            targetPadding: 8,
            interactive: {
                type: 'click',
                action: '[data-tour="sign-button"]',
                skipNextButton: true,
                completionText: 'Signing data with your private key...'
            }
        },
        {
            id: 'wait-for-signature',
            target: 'body',
            title: 'Creating Digital Signature',
            content: 'Creating a digital signature using your private key...',
            position: 'bottom',
            interactive: {
                type: 'wait',
                waitForSelector: '[data-tour="signature-result"]',
                completionText: 'Success! Your digital signature has been created.'
            }
        },
        {
            id: 'verify-signature',
            target: '[data-tour="verify-button"]',
            title: 'Verify the Signature',
            content: 'Finally, let\'s verify the signature we just created. Click "Verify Signature" to confirm the signature is valid using the public key.',
            position: 'bottom',
            offset: { x: 0, y: 10 },
            targetPadding: 8,
            interactive: {
                type: 'click',
                action: '[data-tour="verify-button"]',
                skipNextButton: true,
                completionText: 'Verifying signature with the public key...'
            }
        },
        {
            id: 'wait-for-verification',
            target: 'body',
            title: 'Verifying Signature',
            content: 'Verifying the digital signature using the public key...',
            position: 'bottom',
            interactive: {
                type: 'wait',
                waitForSelector: '[data-tour="verification-result"]',
                completionText: 'Excellent! The signature verification is complete.'
            }
        },
        {
            id: 'completion',
            target: 'body',
            title: 'Interactive Tour Complete! 🎉',
            content: 'Congratulations! You\'ve successfully completed the interactive KMS tour. You\'ve learned how to create a cryptographic key, sign data with the private key, and verify signatures with the public key. These are fundamental operations in PKI and digital security.',
            position: 'bottom'
        }
    ];

    useEffect(() => {
        // Check if tour has been completed before using cookies
        const completed = getCookie(TOUR_COOKIE_KEY) === 'true';
        setTourCompleted(completed);
    }, []);

    const startTour = () => {
        setTourCompleted(false);
        deleteCookie(TOUR_COOKIE_KEY);
        tourContext.startTour('interactive', tourId, tourSteps);
        
        // Navigate to KMS keys page to start the tour
        router.push('/kms/keys');
    };

    const completeTour = () => {
        tourContext.endTour();
        setTourCompleted(true);
        setCookie(TOUR_COOKIE_KEY, 'true');
    };

    const skipTour = () => {
        tourContext.endTour();
        setTourCompleted(true);
        setCookie(TOUR_COOKIE_KEY, 'true');
    };

    const resetTour = () => {
        setTourCompleted(false);
        deleteCookie(TOUR_COOKIE_KEY);
        tourContext.endTour();
    };

    const nextStep = () => {
        if (currentStep < tourSteps.length - 1) {
            tourContext.nextStep();
        } else {
            completeTour();
        }
    };

    const prevStep = () => {
        if (currentStep > 0) {
            tourContext.prevStep();
        }
    };

    return {
        isTourVisible,
        tourCompleted,
        tourSteps,
        currentStep,
        startTour,
        completeTour,
        skipTour,
        resetTour,
        nextStep,
        prevStep,
    };
};