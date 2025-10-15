'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { TourOverlay, type TourStep } from '@/components/ui/tour-overlay';

interface TourState {
    isActive: boolean;
    currentStep: number;
    tourType: 'overview' | 'interactive' | null;
    tourId: string | null;
    tourSteps: TourStep[];
}

interface TourContextType {
    tourState: TourState;
    startTour: (tourType: 'overview' | 'interactive', tourId: string, steps: TourStep[]) => void;
    endTour: () => void;
    nextStep: () => void;
    prevStep: () => void;
    setCurrentStep: (step: number) => void;
    isTourActive: (tourId?: string) => boolean;
}

const TourContext = createContext<TourContextType | undefined>(undefined);

const TOUR_STORAGE_KEY = 'lamassu-tour-state';

export const TourProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const router = useRouter();
    const pathname = usePathname();
    
    const [tourState, setTourState] = useState<TourState>({
        isActive: false,
        currentStep: 0,
        tourType: null,
        tourId: null,
        tourSteps: [],
    });

    // Load tour state from session storage on mount
    useEffect(() => {
        const savedState = sessionStorage.getItem(TOUR_STORAGE_KEY);
        if (savedState) {
            try {
                const parsedState = JSON.parse(savedState);
                setTourState(parsedState);
            } catch (error) {
                console.warn('Failed to parse saved tour state:', error);
                sessionStorage.removeItem(TOUR_STORAGE_KEY);
            }
        }
    }, []);

    // Save tour state to session storage whenever it changes
    useEffect(() => {
        if (tourState.isActive) {
            sessionStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(tourState));
        } else {
            sessionStorage.removeItem(TOUR_STORAGE_KEY);
        }
    }, [tourState]);

    const startTour = (tourType: 'overview' | 'interactive', tourId: string, steps: TourStep[]) => {
        setTourState({
            isActive: true,
            currentStep: 0,
            tourType,
            tourId,
            tourSteps: steps,
        });
    };

    const endTour = () => {
        setTourState({
            isActive: false,
            currentStep: 0,
            tourType: null,
            tourId: null,
            tourSteps: [],
        });
        sessionStorage.removeItem(TOUR_STORAGE_KEY);
    };

    const nextStep = () => {
        setTourState(prev => ({
            ...prev,
            currentStep: prev.currentStep + 1,
        }));
    };

    const prevStep = () => {
        setTourState(prev => ({
            ...prev,
            currentStep: Math.max(0, prev.currentStep - 1),
        }));
    };

    const setCurrentStep = (step: number) => {
        setTourState(prev => ({
            ...prev,
            currentStep: step,
        }));
    };

    const isTourActive = (tourId?: string) => {
        if (!tourState.isActive) return false;
        if (tourId) return tourState.tourId === tourId;
        return true;
    };

    return (
        <TourContext.Provider
            value={{
                tourState,
                startTour,
                endTour,
                nextStep,
                prevStep,
                setCurrentStep,
                isTourActive,
            }}
        >
            {children}
            
            {/* Global Tour Overlay */}
            {tourState.isActive && tourState.tourSteps.length > 0 && (
                <TourOverlay
                    steps={tourState.tourSteps}
                    isVisible={tourState.isActive}
                    currentStep={tourState.currentStep}
                    onNextStep={nextStep}
                    onPrevStep={prevStep}
                    onComplete={endTour}
                    onSkip={endTour}
                />
            )}
        </TourContext.Provider>
    );
};

export const useTourContext = () => {
    const context = useContext(TourContext);
    if (context === undefined) {
        throw new Error('useTourContext must be used within a TourProvider');
    }
    return context;
};