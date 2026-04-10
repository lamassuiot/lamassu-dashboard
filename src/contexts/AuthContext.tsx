
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode, useMemo, useCallback, useRef } from 'react';
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
    const monitorSession = config?.LAMASSU_AUTH_MONITOR_SESSION === true;

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
      monitorSession, // Opt-in: avoids CheckSessionIFrame errors when unsupported/blocked
    });
  }
  return null;
};

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  userManager: UserManager | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const router = useRouter();
  const { config, isConfigLoaded } = useConfig();
  const [authMode, setAuthMode] = useState<'loading' | 'enabled' | 'disabled'>('loading');
  const isHandlingExpiryRef = useRef(false);

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
  }, [router, signoutRedirectCognito, userManagerInstance]);

  const clearLocalSession = useCallback(async () => {
    if (!userManagerInstance) {
      setUser(null);
      return;
    }

    try {
      await userManagerInstance.removeUser();
    } catch (error) {
      console.error("AuthContext: Error clearing local session:", error);
    } finally {
      setUser(null);
    }
  }, [userManagerInstance]);

  const recoverSessionAfterExpiry = useCallback(async () => {
    if (!userManagerInstance || isHandlingExpiryRef.current) {
      return;
    }

    isHandlingExpiryRef.current = true;

    try {
      const currentUser = await userManagerInstance.getUser();
      if (currentUser && !currentUser.expired) {
        setUser(currentUser);
        return;
      }

      // automaticSilentRenew also runs inside oidc-client-ts. Waiting briefly lets
      // the library finish storing the renewed user before we decide the session is gone.
      await new Promise(resolve => window.setTimeout(resolve, 1500));

      const refreshedUser = await userManagerInstance.getUser();
      if (refreshedUser && !refreshedUser.expired) {
        setUser(refreshedUser);
        return;
      }

      console.warn("AuthContext: Access token remained expired after silent renew window. Clearing local session.");
      await clearLocalSession();
    } catch (error) {
      console.error("AuthContext: Error while recovering expired session:", error);
      await clearLocalSession();
    } finally {
      isHandlingExpiryRef.current = false;
    }
  }, [clearLocalSession, userManagerInstance]);


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
    const onSilentRenewError = (error: Error) => {
      console.error("AuthContext: Silent renew error:", error);
      // If silent renew cannot recover, clear only the local session so the UI
      // can fall back to the login state without triggering a full-page redirect.
      const fatalErrors = ['login_required', 'interaction_required', 'invalid_grant'];
      if (fatalErrors.some(e => error.message.includes(e))) {
        clearLocalSession();
      }
    };
    const onAccessTokenExpired = async () => {
      console.warn("AuthContext: Access token expired. Checking whether silent renew already recovered the session.");
      await recoverSessionAfterExpiry();
    }

    userManagerInstance.events.addUserLoaded(onUserLoaded);
    userManagerInstance.events.addUserUnloaded(onUserUnloaded);
    userManagerInstance.events.addSilentRenewError(onSilentRenewError);
    userManagerInstance.events.addAccessTokenExpired(onAccessTokenExpired);

    return () => {
      userManagerInstance.events.removeUserLoaded(onUserLoaded);
      userManagerInstance.events.removeUserUnloaded(onUserUnloaded);
      userManagerInstance.events.removeSilentRenewError(onSilentRenewError);
      userManagerInstance.events.removeAccessTokenExpired(onAccessTokenExpired);
    };
  }, [authMode, clearLocalSession, recoverSessionAfterExpiry, userManagerInstance]);

  const login = useCallback(async () => {
    if (userManagerInstance) {
      try {
        await userManagerInstance.signinRedirect();
      } catch (error) {
        console.error("AuthContext: Login redirect error:", error);
      }
    }
  }, [userManagerInstance]);

  const isLoggedIn = !!user && !user.expired;

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
      isLoggedIn: true,
      login: async () => console.warn('Auth disabled: login action suppressed.'),
      logout: async () => console.warn('Auth disabled: logout action suppressed.'),
      userManager: null,
    };
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
  }

  // If auth is enabled (or still loading), provide the real OIDC context.
  // Memoized to prevent a new object reference on every render, which would
  // cause all consumers of this context to re-render unnecessarily.
  const contextValue = useMemo(
    () => ({ user, isLoading, isLoggedIn, login, logout, userManager: userManagerInstance }),
    [user, isLoading, isLoggedIn, login, logout, userManagerInstance]
  );

  return (
    <AuthContext.Provider value={contextValue}>
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
