

'use client';

import './globals.css';
import { ThemedToaster } from '@/components/shared/ThemedToaster';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ConfigProvider } from '@/contexts/ConfigContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import Script from 'next/script';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { matchAndGetGlobalCapabilities } from '@/lib/authz-api';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarGroupLabel,
  useSidebar,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { useConfig } from '@/contexts/ConfigContext';
import { IdentifierDisplayProvider, useIdentifierDisplay } from '@/contexts/IdentifierDisplayContext';
import { FileText, Users, Landmark, ShieldCheck, HomeIcon, ChevronsLeft, ChevronsRight, Router, KeyRound, ScrollTextIcon, LogIn, LogOut, Loader2, Cpu, Info, User, Blocks, Binary, GitCommit, PlaySquare, Layers, ClipboardCheck, ClipboardList, Workflow, BookOpen, Lock, UserCheck, Database, TestTube2, Network } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { jwtDecode } from 'jwt-decode';
import Image from 'next/image'
import LogoFullWhite from './lamassu_full_white.svg'
import LogoFullBlue from './lamassu_full_blue.svg'
import LogoBlue from './lamassu_logo_blue.svg'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { BackendStatusDialog } from '@/components/shared/BackendStatusDialog';
import { VersionInfoDialog } from '@/components/shared/VersionInfoDialog';
import { VERSION_INFO } from '@/lib/version';
import { InitializationWizard } from '@/components/home/InitializationWizard';
import { fetchCaStatsSummary } from '@/lib/ca-data';
import { Roboto, Inter } from "next/font/google";
import { cn } from "@/lib/utils";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});


interface DecodedAccessToken {
  realm_access?: {
    roles?: string[];
  };
}

const PATH_SEGMENT_TO_LABEL_MAP: Record<string, string> = {
  'certificates': "Certificates",
  'certificate-authorities': "Certification Authorities",
  'signing-profiles': "Issuance Profiles",
  'registration-authorities': "Registration Authorities",
  'verification-authorities': "Verification Authorities",
  'new': "New",
  'details': "Details",
  'issue-certificate': "Issue Certificate",
  'kms': "KMS",
  'keys': "Keys",
  'devices': "Devices",
  'device-groups': "Device Groups",
  'integrations': "Platform Integrations",
  'crypto-engines': "Crypto Engines",
  'alerts': "Alerts",
  'tools': "Tools",
  'certificate-viewer': "Certificate Viewer",
  'job-manager': "Job Manager",
  'jobs': "Jobs",
  'workflows': "Workflows",
  'authz': "Authorization",
  'principals': "Principals",
  'policies': "Policies",
  'test': "Authorization Test",
};

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  devOnly?: boolean;
  /** If set, the item is only shown when the user has "ui" in global_actions for this capability key (e.g. "pki.ca.ca_certificate") */
  uiAuthzCapabilities?: string;
}

interface NavGroup {
  label?: string;
  items: NavItem[];
  devOnly?: boolean;
}

const navigationConfig: NavGroup[] = [
  { items: [{ href: '/', label: 'Home', icon: HomeIcon }] },
  {
    label: 'KMS',
    items: [
      { href: '/kms/keys', label: 'Keys', icon: KeyRound, devOnly: false, uiAuthzCapabilities: 'pki.kms.kms_key' },
      { href: '/crypto-engines', label: 'Crypto Engines', icon: Cpu },
    ],
  },
  {
    label: 'PKI',
    items: [
      { href: '/certificates', label: 'Certificates', icon: FileText, uiAuthzCapabilities: 'pki.ca.certificate' },
      { href: '/certificate-authorities', label: 'Certification Authorities', icon: Landmark, uiAuthzCapabilities: 'pki.ca.ca_certificate' },
      { href: '/signing-profiles', label: 'Issuance Profiles', icon: ScrollTextIcon, uiAuthzCapabilities: 'pki.ca.issuance_profile' },
      { href: '/registration-authorities', label: 'Registration Authorities', icon: ClipboardCheck, uiAuthzCapabilities: 'pki.dmsmanager.dms' },
    ],
  },
  {
    label: 'IoT',
    items: [
      { href: '/devices', label: 'Devices', icon: Router, uiAuthzCapabilities: 'pki.devicemanager.device' },
      { href: '/device-groups', label: 'Device Groups', icon: Layers, uiAuthzCapabilities: 'pki.devicemanager.device_group' },
      { href: '/integrations', label: 'Platform Integrations', icon: Blocks },
    ],
  },
  {
    label: 'JOB MANAGER',
    items: [
      { href: '/job-manager/jobs', label: 'Jobs', icon: ClipboardList },
      { href: '/job-manager/workflows', label: 'Workflows', icon: Workflow },
    ],
  },
  {
    label: 'AUTHZ & SECURITY',
    items: [
      { href: '/authz/principals', label: 'Principals', icon: UserCheck },
      { href: '/authz/policies', label: 'Policies', icon: Lock },
      { href: '/authz/test', label: 'Authorization Test', icon: TestTube2 },
    ],
  },
  {
    label: 'NOTIFICATIONS',
    items: [{ href: '/alerts', label: 'Alerts', icon: Info, uiAuthzCapabilities: 'pki.alerts.subscription' }],
  },
  {
    label: 'TOOLS',
    items: [
      { href: '/tools/certificate-viewer', label: 'Certificate Viewer', icon: Binary },
      { href: '/openapi-spec', label: 'OpenAPI Spec', icon: BookOpen },
    ],
  },
];


const LoadingState = () => (
  <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground w-full p-6 text-center">
    <Loader2 className="h-16 w-16 animate-spin text-primary" />
    <p className="mt-6 text-lg text-muted-foreground">
      Loading application...
    </p>
  </div>
);

const CustomFooter = () => {
  const { config } = useConfig();
  const [footerContent, setFooterContent] = useState('');
  const [showFooter, setShowFooter] = useState(false);

  useEffect(() => {
    if (config) {
      const footerEnabled = config.LAMASSU_FOOTER_ENABLED === true;
      setShowFooter(footerEnabled);

      if (footerEnabled) {
        fetch('/footer.html')
          .then(response => response.text())
          .then(html => setFooterContent(html))
          .catch(error => {
            console.error("Footer load error:", error);
            setFooterContent('<p style="color: red; text-align: center;">Error: footer.html not found or failed to load.</p>');
          });
      }
    }
  }, [config]);

  if (!showFooter) {
    return null;
  }

  return (
    <footer
      className="mt-auto"
      dangerouslySetInnerHTML={{ __html: footerContent }}
    />
  );
};

const UnauthenticatedLayoutContent = () => {
  const { login } = useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground w-full">
      <header className="flex h-header items-center justify-between border-b border-header-foreground/30 bg-header px-4 py-2 text-header-foreground sticky top-0 z-30 md:px-6">
        <div className="flex items-center gap-4 h-full">
          <div className="secondary-logo-container">
            <div
              className="secondary-logo h-full w-auto aspect-[200/60]"
              data-ai-hint="logo"
              role="img"
              aria-label="Secondary Logo"
            />
            <Separator orientation="vertical" className="h-full bg-header-foreground/30" />
          </div>
          <Image
            src={LogoFullWhite}
            height={60}
            width={280}
            alt="LamassuIoT Logo"
            className="hidden md:block h-full w-auto"
          />
          <Image
            src={LogoBlue}
            height={60}
            width={60}
            alt="LamassuIoT Logo"
            className="block md:hidden h-full w-auto invert brightness-0"
          />
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="ghost" onClick={login} className="text-header-foreground hover:bg-header/80 hover:text-header-foreground">
            <LogIn className="mr-0 sm:mr-2 h-4 w-4" /> <span className="hidden sm:inline">Login</span>
          </Button>
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
        <Image
          src={LogoBlue}
          height={75}
          width={75}
          alt="LamassuIoT Logo"
          className="lamassu-logo-theme-filter"
        />
        <h1 className="text-3xl font-bold mt-3 mb-3">Welcome to LamassuIoT</h1>
        <p className="text-lg text-muted-foreground mb-8 max-w-md">
          Securely manage your X.509 certificates and IoT device identities. Please log in to access the system.
        </p>
        <Button onClick={login} className="px-8 py-6 text-lg">
          <LogIn className="mr-2 h-5 w-5" /> Login with Lamassu Identity
        </Button>
      </div>
    </div>
  );
};

const MainLayoutContent = ({ children, isWizardMode }: { children: React.ReactNode, isWizardMode?: boolean }) => {
  const { user, logout } = useAuth();
  const { mode: identifierMode, toggleMode: toggleIdentifierMode, displayTime, toggleDisplayTime } = useIdentifierDisplay();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isVersionModalOpen, setIsVersionModalOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [globalCapabilities, setGlobalCapabilities] = useState<Record<string, string[]> | null>(null);
  const [capabilitiesLoaded, setCapabilitiesLoaded] = useState(false);

  useEffect(() => {
    setCapabilitiesLoaded(false);

    if (!user?.access_token) {
      setGlobalCapabilities(null);
      setCapabilitiesLoaded(true);
      return;
    }

    matchAndGetGlobalCapabilities({ auth_type: 'oidc', auth_material: user.access_token })
      .then(res => setGlobalCapabilities(res.global_actions))
      .catch(() => setGlobalCapabilities(null))
      .finally(() => setCapabilitiesLoaded(true));
  }, [user?.access_token]);

  const isNavItemVisible = useCallback((item: NavItem): boolean => {
    if (!item.uiAuthzCapabilities) return true;
    if (globalCapabilities === null) return true;
    return (globalCapabilities[item.uiAuthzCapabilities] ?? []).includes('ui');
  }, [globalCapabilities]);

  // Redirect to home if the current route requires a capability the user lacks
  useEffect(() => {
    if (globalCapabilities === null) return;
    const allItems = navigationConfig.flatMap(g => g.items);
    const currentItem = allItems.find(item =>
      item.href !== '/' && pathname.startsWith(item.href)
    );
    if (currentItem && !isNavItemVisible(currentItem)) {
      router.replace('/');
    }
  }, [globalCapabilities, isNavItemVisible, pathname, router]);

  let userRoles: string[] = [];
  if (user?.access_token) {
    try {
      const decodedToken = jwtDecode<DecodedAccessToken>(user.access_token);
      if (decodedToken.realm_access && Array.isArray(decodedToken.realm_access.roles)) {
        userRoles = decodedToken.realm_access.roles;
      }
    } catch (error) {
      console.error("Error decoding access token:", error);
    }
  }

  const handleRunWizard = () => {
    if (typeof document !== 'undefined') {
      // Clear completion cookie
      document.cookie = 'lamassu_wizard_completed=; path=/; max-age=0';
      // Set a short-lived cookie to force the wizard to open
      document.cookie = 'force_wizard_open=true; path=/; max-age=5'; // Expires in 5 seconds
      window.location.reload();
    }
  };

  if (!capabilitiesLoaded) {
    return <LoadingState />;
  }

  return (
    <TooltipProvider>
    <SidebarProvider defaultOpen>
      <div className="flex flex-col h-screen bg-background text-foreground w-full">
        <header className="flex h-header items-center justify-between border-b border-header-foreground/30 bg-header text-header-foreground px-4 md:px-6 sticky top-0 z-30">
          <div className="flex items-center gap-4 h-full py-2">
            <SidebarTrigger className="md:hidden text-header-foreground hover:bg-header/80 hover:text-header-foreground" />
            <div className="secondary-logo-container">
              <div
                className="secondary-logo h-full w-auto aspect-[200/60]"
                data-ai-hint="logo"
                role="img"
                aria-label="Secondary Logo"
              />
              <Separator orientation="vertical" className="h-full bg-header-foreground/30" />
            </div>
            <Image
              src={LogoFullWhite}
              height={60}
              width={280}
              alt="LamassuIoT Logo"
              className="hidden md:block h-full w-auto"
            />
            <Image
              src={LogoBlue}
              height={60}
              width={60}
              alt="LamassuIoT Logo"
              className="block md:hidden h-full w-auto invert brightness-0"
            />
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 p-1 h-auto text-header-foreground hover:bg-header/80 hover:text-header-foreground">
                  <span className='hidden sm:inline'>{user?.profile.name || user?.profile.email}</span>
                  {user?.profile.picture && !avatarError ? (
                    <img
                      src={user.profile.picture}
                      alt={user.profile.name || user.profile.email || 'User'}
                      referrerPolicy="no-referrer"
                      className="h-8 w-8 rounded-full object-cover"
                      onError={() => setAvatarError(true)}
                    />
                  ) : (
                    <div className='flex items-center justify-center bg-header-foreground/20 rounded-full h-8 w-8'>
                      <User className="h-5 w-5 text-header-foreground" />
                    </div>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">My Account</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user?.profile.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="px-2 py-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="identifier-display-mode" className="text-sm cursor-pointer">
                      ID Separators
                    </Label>
                    <Switch
                      id="identifier-display-mode"
                      checked={identifierMode === 'with-separators'}
                      onCheckedChange={toggleIdentifierMode}
                    />
                  </div>
                </div>
                <div className="px-2 py-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="display-time-mode" className="text-sm cursor-pointer">
                      Display Time
                    </Label>
                    <Switch
                      id="display-time-mode"
                      checked={displayTime}
                      onCheckedChange={toggleDisplayTime}
                    />
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setIsProfileModalOpen(true)}>
                  <User className="mr-2 h-4 w-4" />
                  <span>Profile / Token Claims</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setIsVersionModalOpen(true)}>
                  <GitCommit className="mr-2 h-4 w-4" />
                  <span>Version Info</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setIsStatusModalOpen(true)}>
                  <Info className="mr-2 h-4 w-4" />
                  <span>Backend Services</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleRunWizard}>
                  <PlaySquare className="mr-2 h-4 w-4" />
                  <span>Run Setup Wizard</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Logout</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {isWizardMode ? (
          <div className="flex-1 overflow-y-auto">
            {children}
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            <Sidebar collapsible="icon" className="border-r bg-sidebar text-sidebar-foreground">
              <SidebarHeader className="p-4">
                <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
                  <div className="secondary-logo-container group-data-[collapsible=icon]:hidden">
                    <div className="secondary-logo h-[30px] w-auto aspect-[200/60]" />
                  </div>
                  <Image
                    src={LogoFullBlue}
                    height={30}
                    width={140}
                    alt="LamassuIoT Logo"
                    className="group-data-[collapsible=icon]:hidden dark:hidden"
                  />
                  <Image
                    src={LogoFullWhite}
                    height={30}
                    width={140}
                    alt="LamassuIoT Logo"
                    className="group-data-[collapsible=icon]:hidden hidden dark:block"
                  />
                  <Image
                    src={LogoBlue}
                    height={30}
                    width={30}
                    alt="LamassuIoT Logo"
                    className="hidden group-data-[collapsible=icon]:block"
                  />
                </div>
              </SidebarHeader>
              <SidebarContent className="p-2">
                <SidebarMenu>
                  {navigationConfig.map((group, groupIndex) => {
                    if (group.devOnly && !(process.env.NODE_ENV == 'development' || process.env.NEXT_FORCE_DEV_OPTIONS)) {
                      return null;
                    }

                    const filteredItems = group.items.filter(item =>
                      !(item.devOnly && !(process.env.NODE_ENV == 'development' || process.env.NEXT_FORCE_DEV_OPTIONS)) &&
                      isNavItemVisible(item)
                    );

                    if (filteredItems.length === 0) {
                      return null;
                    }

                    return (
                      <React.Fragment key={group.label || `group-${groupIndex}`}>
                        {group.label && (
                          <SidebarGroupLabel className="px-2 pt-2 group-data-[collapsible=icon]:pt-0 group-data-[collapsible=icon]:hidden">
                            {group.label}
                          </SidebarGroupLabel>
                        )}
                        {filteredItems.map(item => (
                          <SidebarMenuItem key={item.href}>
                            <SidebarMenuButton
                              asChild
                              isActive={pathname.startsWith(item.href) && (item.href !== '/' || pathname === '/')}
                              tooltip={{ children: item.label, side: 'right', align: 'center' }}
                            >
                              <Link href={item.href} className="flex items-center w-full justify-start">
                                <item.icon className="mr-2 h-5 w-5 flex-shrink-0" />
                                <span className="group-data-[collapsible=icon]:hidden whitespace-nowrap">{item.label}</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </SidebarMenu>
              </SidebarContent>
              <SidebarFooter className="p-2 pb-4 mt-auto border-t border-sidebar-border">
                <CustomSidebarToggle />
                <div className="w-full group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">

                </div>
              </SidebarFooter>
            </Sidebar>

            <SidebarInset className="flex-1 overflow-y-auto flex flex-col">
              <div className="flex-1 p-4 md:p-6 pb-8 md:pb-12">
                {children}
              </div>
              <CustomFooter />
            </SidebarInset>
          </div>
        )}
      </div>

      <Dialog open={isProfileModalOpen} onOpenChange={setIsProfileModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>User Profile & Token Claims</DialogTitle>
            <DialogDescription>
              This is the decoded information from your ID and Access tokens.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-2">Assigned Roles</h4>
              <div className="flex flex-wrap gap-2">
                {userRoles.length > 0 ? (
                  userRoles.map(role => <Badge key={role} variant="secondary">{role}</Badge>)
                ) : (
                  <p className="text-xs text-muted-foreground italic">No roles found in access token.</p>
                )}
              </div>
            </div>
            <Separator />
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-2">ID Token Claims</h4>
              <ScrollArea className="h-60 w-full rounded-md border p-4 bg-muted/30">
                <pre className="text-xs whitespace-pre-wrap break-all">
                  {user ? JSON.stringify(user.profile, null, 2) : "No user profile data available."}
                </pre>
              </ScrollArea>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setIsProfileModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <BackendStatusDialog isOpen={isStatusModalOpen} onOpenChange={setIsStatusModalOpen} />
      <VersionInfoDialog isOpen={isVersionModalOpen} onOpenChange={setIsVersionModalOpen} versionInfo={VERSION_INFO} />
    </SidebarProvider>
    </TooltipProvider>
  );
};


const InnerLayout = ({ children }: { children: React.ReactNode }) => {
  const { isLoading: authIsLoading, isLoggedIn, user } = useAuth();
  const [clientMounted, setClientMounted] = React.useState(false);
  const pathname = usePathname();
  const authenticatedAppKey = isLoggedIn
    ? `${user?.profile.iss ?? 'unknown'}:${user?.profile.sub ?? 'unknown'}`
    : 'anonymous';

  // State to determine if the wizard should be shown
  const [isWizardMode, setIsWizardMode] = useState(false);
  const [isCheckingSystem, setIsCheckingSystem] = useState(true);

  const checkSystemStatus = useCallback(async () => {
    if (!isLoggedIn) {
      setIsCheckingSystem(false);
      return;
    }

    // Check for the force-open cookie first
    const forceOpen = document.cookie.includes('force_wizard_open=true');
    if (forceOpen) {
      document.cookie = 'force_wizard_open=; path=/; max-age=0'; // Delete the cookie after reading
      setIsWizardMode(true);
      setIsCheckingSystem(false);
      return;
    }

    // Only check CA stats on the homepage
    if (pathname !== '/') {
      setIsWizardMode(false);
      setIsCheckingSystem(false);
      return;
    }

    // Check if the completion cookie is set
    const wizardCompleted = document.cookie.includes('lamassu_wizard_completed=true');
    if (wizardCompleted) {
      setIsWizardMode(false);
      setIsCheckingSystem(false);
      return;
    }

    try {
      const stats = await fetchCaStatsSummary();
      if (stats.cas.total === 0) {
        setIsWizardMode(true);
      } else {
        // If CAs exist, set the completion cookie and don't show the wizard.
        document.cookie = "lamassu_wizard_completed=true; path=/; max-age=315360000"; // 10 years
        setIsWizardMode(false);
      }
    } catch (error) {
      console.error("Failed to fetch system stats for wizard check:", error);
      setIsWizardMode(false); // Default to showing dashboard on error
    } finally {
      setIsCheckingSystem(false);
    }
  }, [isLoggedIn, pathname]);

  useEffect(() => {
    setClientMounted(true);
    if (!authIsLoading && isLoggedIn) {
      checkSystemStatus();
    } else if (!authIsLoading && !isLoggedIn) {
      // If not authenticated, not in wizard mode and not checking
      setIsWizardMode(false);
      setIsCheckingSystem(false);
    }
  }, [authenticatedAppKey, authIsLoading, checkSystemStatus, isLoggedIn]);


  const isCallbackPage =
    pathname === '/signin-callback' ||
    pathname === '/silent-renew-callback' ||
    pathname === '/signout-callback';

  if (isCallbackPage) {
    return <>{children}</>;
  }

  if (!clientMounted) {
    return <LoadingState />;
  }

  if (authIsLoading || isCheckingSystem) {
    return <LoadingState />;
  }

  if (!isLoggedIn) {
    return <UnauthenticatedLayoutContent />;
  }

  if (isWizardMode) {
    return <MainLayoutContent key={`${authenticatedAppKey}:wizard`} isWizardMode={true}><InitializationWizard /></MainLayoutContent>;
  }

  return <MainLayoutContent key={authenticatedAppKey}>{children}</MainLayoutContent>;
};


export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", inter.variable)}>
      <head>
        <Script src="/config.js" strategy="beforeInteractive" />
        <title>LamassuIoT Certificate Manager</title>
        <meta name="description" content="Manage and verify your X.509 certificates with LamassuIoT." />
        <link rel="manifest" href="/manifest.json" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="/custom-theme.css"></link>
      </head>
      <body className="font-body antialiased">
        <ConfigProvider>
          <AuthProvider>
            <ThemeProvider>
              <IdentifierDisplayProvider>
                <React.Suspense fallback={<LoadingState />}>
                  <InnerLayout>{children}</InnerLayout>
                </React.Suspense>
                <ThemedToaster offset={{ top: 40 }} />
              </IdentifierDisplayProvider>
            </ThemeProvider>
          </AuthProvider>
        </ConfigProvider>
      </body>
    </html>
  );
}

function CustomSidebarToggle() {
  const { open, toggleSidebar, isMobile } = useSidebar();

  if (isMobile) {
    return null;
  }

  return (
    <SidebarMenuButton
      onClick={toggleSidebar}
      className="w-full flex items-center group-data-[collapsible=icon]:justify-center mb-2"
      tooltip={{ children: open ? "Collapse sidebar" : "Expand sidebar", side: 'right', align: 'center' }}
    >
      {open ? <ChevronsLeft /> : <ChevronsRight />}
      <span className="ml-2 group-data-[collapsible=icon]:hidden whitespace-nowrap">{open ? "Collapse" : ""}</span>
    </SidebarMenuButton>
  );
}
