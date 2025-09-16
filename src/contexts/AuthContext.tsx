
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode, useMemo, useCallback } from 'react';
import { User, UserManager, WebStorageStateStore, Log, UserProfile } from 'oidc-client-ts';
import { useRouter } from 'next/navigation';
import { useConfig } from './ConfigContext';

// Optional: Configure oidc-client-ts logging
Log.setLogger(console);
Log.setLevel(Log.DEBUG);


const createUserManager = (): UserManager | null => {
  // Check moved inside the function to be safe.
  if (typeof window !== 'undefined' && (window as any).lamassuConfig?.LAMASSU_AUTH_ENABLED !== false) {
    const config = (window as any).lamassuConfig;
    const authority = config?.LAMASSU_AUTH_AUTHORITY;
    const clientId = config?.LAMASSU_AUTH_CLIENT_ID || 'frontend';

    if (!authority) {
      console.warn('LAMASSU_AUTH_AUTHORITY not found in config');
      return null;
    }

    return new UserManager({
      authority: authority,
      client_id: clientId,
      redirect_uri: `${window.location.origin}/signin-callback`,
      silent_redirect_uri: `${window.location.origin}/silent-renew-callback`,
      post_logout_redirect_uri: `${window.location.origin}/signout-callback`,
      response_type: 'code',
      scope: 'openid profile email', // Standard scopes
      userStore: new WebStorageStateStore({ store: window.localStorage }), // Persist user session
      automaticSilentRenew: true, // Proactively renew tokens
      monitorSession: true, // Monitor for session changes with the IdP
    });
  }
  return null;
};

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: () => boolean;
  userManager: UserManager | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const router = useRouter();
  const { config, isConfigLoaded } = useConfig();
  const [authMode, setAuthMode] = useState<'loading' | 'enabled' | 'disabled'>('loading');

  // OIDC specific state that will only be used if authMode is 'enabled'
  const userManagerInstance = useMemo(() => {
    if (authMode === 'enabled' && config) {
      return createUserManager();
    }
    return null;
  }, [authMode, config]);

  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Wait for config to be loaded before determining auth mode
    if (isConfigLoaded && config) {
      const isEnabled = config.LAMASSU_AUTH_ENABLED !== false;
      setAuthMode(isEnabled ? 'enabled' : 'disabled');
    }
  }, [config, isConfigLoaded]);

  const logout = useCallback(async () => {
    if (userManagerInstance) {
      try {
        setUser(null);
        const logoutEndpoint = await userManagerInstance.metadataService.getEndSessionEndpoint();
        if (logoutEndpoint && await userManagerInstance.getUser()) {
          if (logoutEndpoint.includes('amazoncognito')) {
            await signoutRedirectCognito();
          } else {
            await userManagerInstance.signoutRedirect();
          }
        } else {
          router.push('/');
        }
      } catch (error) {
        console.error("AuthContext: Logout redirect error:", error);
        setUser(null);
        await userManagerInstance.removeUser();
        router.push('/');
      }
    }
  }, [userManagerInstance, router]);

  const signoutRedirectCognito = useCallback(async () => {
    if (!userManagerInstance) {
      router.push('/');
      return;
    }

    const clientId = userManagerInstance.settings.client_id;
    const logoutUri = `${window.location.origin}/signout-callback`;

    await userManagerInstance?.signoutRedirect({
      extraQueryParams: {
        client_id: clientId,
        logout_uri: logoutUri
      }
    })

  }, [userManagerInstance, router]);


  useEffect(() => {
    if (!userManagerInstance) {
      // If there's no user manager (because auth is disabled or we're loading),
      // we are not loading a real user.
      if (authMode !== 'loading') {
        setIsLoading(false);
      }
      return;
    }

    const loadUser = async () => {
      try {
        const loadedUser = await userManagerInstance.getUser();
        setUser(loadedUser);
      } catch (error) {
        console.error("AuthContext: Error loading user:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();

    const onUserLoaded = (loadedUser: User) => setUser(loadedUser);
    const onUserUnloaded = () => setUser(null);
    const onSilentRenewError = (error: Error) => { console.error("AuthContext: Silent renew error:", error); logout(); };

    userManagerInstance.events.addUserLoaded(onUserLoaded);
    userManagerInstance.events.addUserUnloaded(onUserUnloaded);
    userManagerInstance.events.addSilentRenewError(onSilentRenewError);

    return () => {
      userManagerInstance.events.removeUserLoaded(onUserLoaded);
      userManagerInstance.events.removeUserUnloaded(onUserUnloaded);
      userManagerInstance.events.removeSilentRenewError(onSilentRenewError);
    };
  }, [userManagerInstance, authMode, logout]);

  const login = useCallback(async () => {
    if (userManagerInstance) {
      try {
        await userManagerInstance.signinRedirect();
      } catch (error) {
        console.error("AuthContext: Login redirect error:", error);
      }
    }
  }, [userManagerInstance]);

  const isAuthenticated = useCallback(() => {
    return !!user && !user.expired;
  }, [user]);

  // If auth is disabled, provide the mock context.
  if (authMode === 'disabled') {
    const mockUser = new User({
      id_token: 'mock_id_token',
      access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyZWFsbV9hY2Nlc3MiOnsicm9sZXMiOlsiYXBwLWFkbWluIiwib2ZmbGluZV9hY2Nlc3MiXX0sIm5hbWUiOiJEZXYgVXNlciJ9.mockSignature',
      scope: 'openid profile email',
      token_type: 'Bearer',
      profile: {
        sub: 'mock-user-id',
        name: 'Dev User',
        email: 'dev@lamassu.io',
        iss: 'mock-issuer',
        aud: 'mock-client',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
      } as UserProfile,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      session_state: 'mock-session-state',
    });

    const value: AuthContextType = {
      user: mockUser,
      isLoading: false,
      login: async () => console.warn('Auth disabled: login action suppressed.'),
      logout: async () => console.warn('Auth disabled: logout action suppressed.'),
      isAuthenticated: () => true,
      userManager: null,
    };
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
  }

  // If auth is enabled (or still loading), provide the real OIDC context.
  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, isAuthenticated, userManager: userManagerInstance }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const getClientUserManager = createUserManager;
