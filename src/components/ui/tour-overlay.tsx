'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X, ChevronLeft, ChevronRight, SkipForward } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TourStep {
    id: string;
    target: string; // CSS selector for the element to highlight
    title: string;
    content: string;
    position?: 'top' | 'bottom' | 'left' | 'right';
    offset?: { x: number; y: number };
    targetPadding?: number; // Extra padding around the highlighted element
    interactive?: {
        type: 'click' | 'form' | 'wait' | 'navigate';
        action?: string; // CSS selector for element to interact with
        waitForSelector?: string; // Wait for this element to appear
        waitForNavigation?: string; // Wait for navigation to this path
        formFields?: { selector: string; value?: string; type?: 'input' | 'select' | 'textarea' }[];
        skipNextButton?: boolean; // Hide next button - user must complete action
        completionText?: string; // Text to show when action is completed
        autoAdvance?: boolean; // Automatically advance to next step when action is completed
        autoAdvanceDelay?: number; // Delay in ms before auto-advancing (default: 1500ms)
    };
}

interface TourOverlayProps {
    steps: TourStep[];
    isVisible: boolean;
    onComplete: () => void;
    onSkip: () => void;
    currentStep?: number; // External step control
    onNextStep?: () => void; // External next step handler
    onPrevStep?: () => void; // External previous step handler
}

export const TourOverlay: React.FC<TourOverlayProps> = ({
    steps,
    isVisible,
    onComplete,
    onSkip,
    currentStep: externalCurrentStep,
    onNextStep,
    onPrevStep,
}) => {
    const [internalCurrentStep, setInternalCurrentStep] = useState(0);
    const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
    const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
    const [tooltipSize, setTooltipSize] = useState({ width: 350, height: 220 });
    
    // Interactive tour state
    const [isWaitingForAction, setIsWaitingForAction] = useState(false);
    const [actionCompleted, setActionCompleted] = useState(false);
    const [interactiveMessage, setInteractiveMessage] = useState('');

    // Use external step control if provided, otherwise use internal
    const currentStep = externalCurrentStep !== undefined ? externalCurrentStep : internalCurrentStep;

    const calculateTooltipPosition = useCallback((element: HTMLElement, step: TourStep) => {
        const tooltip = tooltipSize; // Use dynamic tooltip size
        const offset = step.offset || { x: 0, y: 0 };

        // Special handling for welcome/completion steps - center on screen
        if (step.id === 'welcome' || step.id === 'completion' || step.target === 'body') {
            const x = (window.innerWidth - tooltip.width) / 2 + offset.x;
            const y = (window.innerHeight - tooltip.height) / 2 + offset.y;
            return { x, y };
        }

        if (!element) return { x: 0, y: 0 };

        const rect = element.getBoundingClientRect();
        let x = 0;
        let y = 0;

        switch (step.position || 'bottom') {
            case 'top':
                x = rect.left + rect.width / 2 - tooltip.width / 2 + offset.x;
                y = rect.top - tooltip.height - 10 + offset.y;
                break;
            case 'bottom':
                x = rect.left + rect.width / 2 - tooltip.width / 2 + offset.x;
                y = rect.bottom + 10 + offset.y;
                break;
            case 'left':
                x = rect.left - tooltip.width - 10 + offset.x;
                y = rect.top + rect.height / 2 - tooltip.height / 2 + offset.y;
                break;
            case 'right':
                x = rect.right + 10 + offset.x;
                y = rect.top + rect.height / 2 - tooltip.height / 2 + offset.y;
                break;
        }

        // Keep tooltip within viewport bounds
        const padding = 10;
        x = Math.max(padding, Math.min(x, window.innerWidth - tooltip.width - padding));
        y = Math.max(padding, Math.min(y, window.innerHeight - tooltip.height - padding));

        return { x, y };
    }, [tooltipSize]);

    const highlightElement = useCallback((selector: string, step: TourStep) => {
        // For welcome/completion steps, don't highlight any specific element
        if (step.id === 'welcome' || step.id === 'completion' || step.target === 'body') {
            setTargetElement(null);
            const position = calculateTooltipPosition(null as any, step);
            setTooltipPosition(position);
            return;
        }

        const element = document.querySelector(selector) as HTMLElement;
        if (element) {
            setTargetElement(element);
            const position = calculateTooltipPosition(element, step);
            setTooltipPosition(position);

            // Scroll element into view if needed
            element.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'center'
            });
        }
    }, [calculateTooltipPosition]);

    useEffect(() => {
        if (isVisible && steps[currentStep]) {
            // Small delay to ensure DOM is ready
            const timer = setTimeout(() => {
                highlightElement(steps[currentStep].target, steps[currentStep]);

                // Calculate tooltip size after DOM update
                const tooltipElement = document.querySelector('[data-tour-tooltip]') as HTMLElement;
                if (tooltipElement) {
                    const rect = tooltipElement.getBoundingClientRect();
                    setTooltipSize({ width: rect.width, height: rect.height });
                }
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [currentStep, isVisible, steps, highlightElement]);

    useEffect(() => {
        const handleResize = () => {
            if (targetElement && steps[currentStep]) {
                // Recalculate tooltip size on resize
                const tooltipElement = document.querySelector('[data-tour-tooltip]') as HTMLElement;
                if (tooltipElement) {
                    const rect = tooltipElement.getBoundingClientRect();
                    setTooltipSize({ width: rect.width, height: rect.height });
                }

                const position = calculateTooltipPosition(targetElement, steps[currentStep]);
                setTooltipPosition(position);
            }
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [targetElement, currentStep, steps, calculateTooltipPosition]);

    // Step navigation functions (defined early to avoid circular dependency)
    const nextStep = useCallback(() => {
        // Reset interactive state when moving to next step
        setIsWaitingForAction(false);
        setActionCompleted(false);
        setInteractiveMessage('');

        if (onNextStep) {
            // Use external step handler
            onNextStep();
        } else {
            // Use internal step management
            if (currentStep < steps.length - 1) {
                setInternalCurrentStep(currentStep + 1);
            } else {
                onComplete();
            }
        }
    }, [onNextStep, currentStep, steps.length, onComplete]);

    const prevStep = useCallback(() => {
        if (onPrevStep) {
            // Use external step handler
            onPrevStep();
        } else {
            // Use internal step management
            if (currentStep > 0) {
                setInternalCurrentStep(currentStep - 1);
            }
        }
    }, [onPrevStep, currentStep]);

    // Helper function to handle action completion with auto-advance
    const handleActionCompletion = useCallback((step: TourStep, completionMessage?: string) => {
        setActionCompleted(true);
        const message = completionMessage || step.interactive?.completionText || 'Action completed!';
        setInteractiveMessage(message);

        // Auto-advance if enabled
        if (step.interactive?.autoAdvance) {
            const delay = step.interactive.autoAdvanceDelay || 1500; // Default 1.5 seconds
            setTimeout(() => {
                nextStep();
            }, delay);
        }
    }, [nextStep]);

    // Interactive tour handlers
    const setupInteractiveStep = useCallback((step: TourStep) => {
        if (!step.interactive) return;

        setIsWaitingForAction(true);
        setActionCompleted(false);
        setInteractiveMessage('');

        const { type, action, waitForSelector, waitForNavigation, formFields } = step.interactive;

        if (type === 'click' && action) {
            // Set up click listener
            const handleClick = (event: Event) => {
                const target = event.target as HTMLElement;
                const actionElement = document.querySelector(action);
                if (actionElement && (target === actionElement || actionElement.contains(target))) {
                    handleActionCompletion(step);
                    document.removeEventListener('click', handleClick, true);
                }
            };
            document.addEventListener('click', handleClick, true);

            // Cleanup function
            return () => document.removeEventListener('click', handleClick, true);
        }

        if (type === 'wait' && waitForSelector) {
            // Wait for element to appear
            const observer = new MutationObserver(() => {
                if (document.querySelector(waitForSelector)) {
                    handleActionCompletion(step, 'Element appeared!');
                    observer.disconnect();
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });

            // Cleanup function
            return () => observer.disconnect();
        }

        if (type === 'navigate' && waitForNavigation) {
            // Wait for navigation
            const checkNavigation = () => {
                if (window.location.pathname === waitForNavigation) {
                    handleActionCompletion(step, 'Navigation completed!');
                    return true;
                }
                return false;
            };

            // Check immediately
            if (!checkNavigation()) {
                // Poll for navigation change
                const interval = setInterval(() => {
                    if (checkNavigation()) {
                        clearInterval(interval);
                    }
                }, 500);

                // Cleanup function
                return () => clearInterval(interval);
            }
        }

        if (type === 'form' && formFields) {
            // Track which fields have been interacted with
            const fieldInteractions = new Set<string>();
            
            // Monitor form fields
            const checkFormCompletion = () => {
                const allFieldsCompleted = formFields.every(field => {
                    const element = document.querySelector(field.selector) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
                    if (!element) {
                        console.warn(`Tour: Form element not found for selector: ${field.selector}`);
                        return false;
                    }
                    
                    // Check if field has expected value (if specified) or just non-empty value
                    if (field.value !== undefined) {
                        const matches = element.value === field.value;
                        if (!matches) {
                            console.log(`Tour: Field ${field.selector} has value "${element.value}", expected "${field.value}"`);
                        }
                        return matches;
                    } else {
                        // For fields without expected values, require both a value AND user interaction
                        const hasValue = element.value.trim() !== '';
                        const hasInteraction = fieldInteractions.has(field.selector);
                        console.log(`Tour: Field ${field.selector} has value "${element.value}", non-empty: ${hasValue}, interacted: ${hasInteraction}`);
                        return hasValue && hasInteraction;
                    }
                });

                if (allFieldsCompleted) {
                    handleActionCompletion(step, 'Form completed!');
                    return true;
                }
                return false;
            };

            // Check immediately
            if (!checkFormCompletion()) {
                // Set up listeners for form changes
                const handleFormChange = (field: typeof formFields[0]) => () => {
                    // Mark this field as interacted with
                    fieldInteractions.add(field.selector);
                    
                    // Small delay to allow React state updates to complete
                    setTimeout(() => {
                        checkFormCompletion();
                    }, 100);
                };

                // For fields without expected values, also set up periodic checking
                const fieldsWithoutExpectedValues = formFields.filter(f => f.value === undefined);
                let periodicCheck: NodeJS.Timeout | null = null;
                
                if (fieldsWithoutExpectedValues.length > 0) {
                    periodicCheck = setInterval(() => {
                        // Check if any field without expected value now has a value
                        let hasNewValue = false;
                        fieldsWithoutExpectedValues.forEach(field => {
                            const element = document.querySelector(field.selector) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
                            if (element && element.value.trim() !== '' && !fieldInteractions.has(field.selector)) {
                                console.log(`Tour: Detected value change in ${field.selector}: "${element.value}"`);
                                fieldInteractions.add(field.selector);
                                hasNewValue = true;
                            }
                        });
                        
                        if (hasNewValue) {
                            checkFormCompletion();
                        }
                    }, 500);
                }

                formFields.forEach(field => {
                    const element = document.querySelector(field.selector);
                    if (element) {
                        const changeHandler = handleFormChange(field);
                        
                        // Standard form events
                        element.addEventListener('input', changeHandler);
                        element.addEventListener('change', changeHandler);
                        
                        // For ShadCN Select components, listen to more events
                        element.addEventListener('click', changeHandler);
                        element.addEventListener('focus', changeHandler);
                        element.addEventListener('mousedown', changeHandler);
                        
                        // Also try to find associated select elements or hidden inputs
                        const parentContainer = element.closest('[role="combobox"]') || element.closest('.relative');
                        if (parentContainer) {
                            const hiddenInput = parentContainer.querySelector('input[type="hidden"]');
                            const selectElement = parentContainer.querySelector('select');
                            
                            if (hiddenInput) {
                                hiddenInput.addEventListener('input', changeHandler);
                                hiddenInput.addEventListener('change', changeHandler);
                            }
                            if (selectElement) {
                                selectElement.addEventListener('input', changeHandler);
                                selectElement.addEventListener('change', changeHandler);
                            }
                        }
                        
                        // Listen for ShadCN Select value changes using MutationObserver
                        const observer = new MutationObserver(() => {
                            setTimeout(changeHandler, 50);
                        });
                        observer.observe(element, { 
                            attributes: true, 
                            attributeFilter: ['data-state', 'data-placeholder', 'aria-expanded'],
                            subtree: true,
                            childList: true
                        });
                    }
                });

                // Cleanup function
                return () => {
                    if (periodicCheck) {
                        clearInterval(periodicCheck);
                    }
                    formFields.forEach(field => {
                        const element = document.querySelector(field.selector);
                        if (element) {
                            const changeHandler = handleFormChange(field);
                            element.removeEventListener('input', changeHandler);
                            element.removeEventListener('change', changeHandler);
                            element.removeEventListener('click', changeHandler);
                            element.removeEventListener('focus', changeHandler);
                            element.removeEventListener('mousedown', changeHandler);
                        }
                    });
                };
            }
        }
    }, [handleActionCompletion]);

    // Set up interactive step when step changes
    useEffect(() => {
        if (isVisible && steps[currentStep]) {
            const step = steps[currentStep];
            if (step.interactive) {
                const cleanup = setupInteractiveStep(step);
                return cleanup;
            } else {
                setIsWaitingForAction(false);
                setActionCompleted(false);
                setInteractiveMessage('');
            }
        }
    }, [currentStep, isVisible, steps, setupInteractiveStep]);

    const getHighlightStyle = () => {
        if (!targetElement) return {};

        const rect = targetElement.getBoundingClientRect();
        const currentStepData = steps[currentStep];
        const padding = currentStepData?.targetPadding || 0;
        
        return {
            top: rect.top + window.scrollY - padding,
            left: rect.left + window.scrollX - padding,
            width: rect.width + (padding * 2),
            height: rect.height + (padding * 2),
        };
    };

    if (!isVisible || !steps[currentStep]) return null;

    const currentStepData = steps[currentStep];

    return (
        <div className="fixed inset-0 z-50" style={{margin: 0, padding: 0, pointerEvents: 'none'}}>
            {/* Highlight cutout - show for non-welcome/completion steps */}
            {targetElement && (
                <div
                    className="absolute border-2 border-primary rounded-lg shadow-lg transition-all duration-300 ease-in-out"
                    style={{
                        ...getHighlightStyle(),
                        boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.8)',
                        backgroundColor: 'transparent',
                        zIndex: 51,
                        pointerEvents: 'none', // Allow clicks to pass through the highlighted area
                    }}
                />
            )}

            {/* Base overlay background for non-highlighted areas */}
            {!targetElement && (
                <div className="absolute inset-0 bg-black/50" style={{pointerEvents: 'none'}} />
            )}

            {/* Tooltip */}
            <Card
                data-tour-tooltip
                className="absolute w-[350px] bg-background shadow-xl border-2 transition-all duration-300 ease-in-out z-52 opacity-100"
                style={{
                    left: tooltipPosition.x,
                    top: tooltipPosition.y,
                    backgroundColor: 'hsl(var(--background))',
                    boxShadow: 'rgb(255, 255, 255) 0px 0px 0px 0px;',
                    zIndex: 52,
                    opacity: 1,
                    pointerEvents: 'auto', // Allow interactions with the tooltip
                }}
            >
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-lg font-semibold">
                            {currentStepData.title}
                        </CardTitle>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onSkip}
                            className="h-8 w-8 p-0"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="text-xs text-muted-foreground">
                        Step {currentStep + 1} of {steps.length}
                    </div>
                </CardHeader>
                <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground mb-4">
                        {currentStepData.content}
                    </p>

                    {/* Interactive status */}
                    {currentStepData.interactive && (
                        <div className="mb-4 p-3 rounded-lg border bg-muted/30">
                            {isWaitingForAction && !actionCompleted && (
                                <div className="flex items-center gap-2 text-sm">
                                    <div className="animate-pulse w-2 h-2 bg-yellow-500 rounded-full"></div>
                                    <span className="text-yellow-700 dark:text-yellow-300">
                                        {currentStepData.interactive.type === 'click' && 'Click the highlighted element to continue'}
                                        {currentStepData.interactive.type === 'form' && 'Fill out the form fields to continue'}
                                        {currentStepData.interactive.type === 'wait' && 'Waiting for element to appear...'}
                                        {currentStepData.interactive.type === 'navigate' && 'Navigate to the specified page...'}
                                    </span>
                                </div>
                            )}
                            {actionCompleted && (
                                <div className="flex items-center gap-2 text-sm">
                                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                    <span className="text-green-700 dark:text-green-300">
                                        {interactiveMessage || 'Action completed!'}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Progress bar */}
                    <div className="w-full bg-muted rounded-full h-1 mb-4">
                        <div
                            className="bg-primary h-1 rounded-full transition-all duration-300"
                            style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={prevStep}
                                disabled={currentStep === 0}
                                className="text-xs"
                            >
                                <ChevronLeft className="h-3 w-3 mr-1" />
                                Previous
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={onSkip}
                                className="text-xs"
                            >
                                <SkipForward className="h-3 w-3 mr-1" />
                                Skip Tour
                            </Button>
                        </div>
                        <Button
                            size="sm"
                            onClick={nextStep}
                            disabled={currentStepData.interactive?.skipNextButton && isWaitingForAction && !actionCompleted}
                            className="text-xs"
                        >
                            {currentStep === steps.length - 1 ? 'Finish' : 'Next'}
                            {currentStep !== steps.length - 1 && (
                                <ChevronRight className="h-3 w-3 ml-1" />
                            )}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};