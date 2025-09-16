'use client';

import { useState, useEffect } from 'react';
import type { TourStep } from '@/components/ui/tour-overlay';

const TOUR_COOKIE_KEY = 'lamassu-dashboard-tour-completed';

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

interface UseHomeTourProps {
  isAuthenticated?: boolean;
  authLoading?: boolean;
}

export const useHomeTour = (props?: UseHomeTourProps) => {
  const [isTourVisible, setIsTourVisible] = useState(false);
  const [tourCompleted, setTourCompleted] = useState(false);

  // Define tour steps for the home page
  const tourSteps: TourStep[] = [
    {
      id: 'welcome',
      target: 'body',
      title: 'Welcome to Lamassu Dashboard',
      content: 'Welcome! This quick tour will help you understand the key features of your Lamassu PKI dashboard. Let\'s explore the main components together.',
      position: 'bottom'
    },
    {
      id: 'refresh-button',
      target: '[data-tour="refresh-button"]',
      title: 'Refresh Data',
      content: 'Use this button to refresh all dashboard data and get the latest information from your PKI infrastructure.',
      position: 'bottom'
    },
    {
      id: 'summary-stats',
      target: '[data-tour="summary-stats"]',
      title: 'Summary Statistics',
      content: 'This card shows key metrics of your PKI infrastructure: total certificates, certificate authorities (CAs), registration authorities (RAs), and connected devices. Click any metric to navigate to its detailed view.',
      position: 'right'
    },
    {
      id: 'device-chart',
      target: '[data-tour="device-chart"]',
      title: 'Device Status Overview',
      content: 'This chart visualizes the status distribution of all your managed devices. You can see how many devices are active, expiring soon, need renewal, or have other status conditions.',
      position: 'left'
    },
    {
      id: 'ca-timeline',
      target: '[data-tour="ca-timeline"]',
      title: 'CA Expiry Timeline',
      content: 'This timeline shows when your Certificate Authorities will expire. It helps you plan certificate renewals and maintain continuous PKI operations. The timeline is color-coded by crypto engine type.',
      position: 'top'
    },
    {
      id: 'navigation',
      target: '[data-tour="navigation"]',
      title: 'Navigation Menu',
      content: 'Use the navigation menu to access different sections of the dashboard: manage CAs, view certificates, configure devices, and more. Each section provides detailed management capabilities.',
      position: 'right',
      offset: { x: 20, y: 0 }
    },
    {
      id: 'completion',
      target: 'body',
      title: 'Tour Complete!',
      content: 'You\'re all set! You now know the key features of the Lamassu dashboard. Explore each section to manage your PKI infrastructure effectively. You can always retake this tour from the settings.',
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
