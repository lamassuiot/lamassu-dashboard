
'use client';

import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ConfigProvider } from '@/contexts/ConfigContext';
import Script from 'next/script';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams }
  from 'next/navigation';
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
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { useConfig } from '@/contexts/ConfigContext';
import { FileText, Users, Landmark, ShieldCheck, HomeIcon, ChevronsLeft, ChevronsRight, Router, KeyRound, ScrollTextIcon, LogIn, LogOut, Loader2, Cpu, Info, User, Blocks, Binary } from 'lucide-react';
import { Breadcrumbs, type BreadcrumbItem } from '@/components/ui/breadcrumbs';
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
  'requests': "CA Requests",
  'alerts': "Alerts",
  'tools': "Tools",
  'certificate-viewer': "Certificate Viewer",
};

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  devOnly?: boolean;
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
      { href: '/kms/keys', label: 'Keys', icon: KeyRound, devOnly: true },
      { href: '/crypto-engines', label: 'Crypto Engines', icon: Cpu },
    ],
  },
  {
    label: 'PKI',
    items: [
      { href: '/certificates', label: 'Certificates', icon: FileText },
      { href: '/certificate-authorities', label: 'Certification Authorities', icon: Landmark },
      { href: '/signing-profiles', label: 'Issuance Profiles', icon: ScrollTextIcon, devOnly: true },
      { href: '/registration-authorities', label: 'Registration Authorities', icon: Users },
      { href: '/verification-authorities', label: 'Verification Authorities', icon: ShieldCheck, devOnly: true },
    ],
  },
  {
    label: 'IoT',
    items: [
      { href: '/devices', label: 'Devices', icon: Router },
      { href: '/integrations', label: 'Platform Integrations', icon: Blocks },
    ],
  },
  {
    label: 'NOTIFICATIONS',
    items: [{ href: '/alerts', label: 'Alerts', icon: Info }],
  },
  {
    label: 'TOOLS',
    items: [
      { href: '/tools/certificate-viewer', label: 'Certificate Viewer', icon: Binary },
    ],
  },
];

function generateBreadcrumbs(pathname: string, queryParams: URLSearchParams): BreadcrumbItem[] {
  const pathSegments = pathname.split('/').filter(segment => segment);
  const breadcrumbItems: BreadcrumbItem[] = [{ label: 'Home', href: '/' }];

  if (pathname === '/') {
    return [{ label: 'Home' }];
  }

  let currentHref = '';

  for (let i = 0; i < pathSegments.length; i++) {
    const segment = pathSegments[i];
    let label = PATH_SEGMENT_TO_LABEL_MAP[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);

    currentHref += `/${segment}`;
    const isLastSegment = i === pathSegments.length - 1;
    let hrefWithQuery = currentHref;

    if (segment === 'details') {
      if (queryParams.get('caId')) hrefWithQuery += `?caId=${queryParams.get('caId')}`;
      else if (queryParams.get('certificateId')) hrefWithQuery += `?certificateId=${queryParams.get('certificateId')}`;
      else if (queryParams.get('keyId')) hrefWithQuery += `?keyId=${queryParams.get('keyId')}`;
      else if (queryParams.get('deviceId')) hrefWithQuery += `?deviceId=${queryParams.get('deviceId')}`;
    } else if (segment === 'issue-certificate' && queryParams.get('caId')) {
      hrefWithQuery += `?caId=${queryParams.get('caId')}`;
    }


    if (isLastSegment) {
      breadcrumbItems.push({ label });
    } else {
      breadcrumbItems.push({ label, href: hrefWithQuery });
    }
  }
  return breadcrumbItems;
}


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

const MainLayoutContent = ({ children }: { children: React.ReactNode }) => {
  console.log("MainLayoutContent: Rendering main layout content");
  useEffect(() => {
    console.log("MainLayoutContent: Mounted");
  }, []);

  const { isAuthenticated, user, login, logout } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);

  const breadcrumbItems = generateBreadcrumbs(pathname, searchParams);
  let userRoles: string[] = [];
  if (isAuthenticated() && user?.access_token) {
    try {
      const decodedToken = jwtDecode<DecodedAccessToken>(user.access_token);
      if (decodedToken.realm_access && Array.isArray(decodedToken.realm_access.roles)) {
        userRoles = decodedToken.realm_access.roles;
      }
    } catch (error) {
      console.error("Error decoding access token:", error);
    }
  }

  return (
    <SidebarProvider defaultOpen>
      <div className="flex flex-col h-screen bg-background text-foreground w-full">
        <header className="flex h-header items-center justify-between border-b border-header-foreground/30 bg-header text-header-foreground px-4 md:px-6 sticky top-0 z-30">
          <div className="flex items-center gap-4 h-full py-2">
            {isAuthenticated() && (
              <SidebarTrigger className="md:hidden text-header-foreground hover:bg-header/80 hover:text-header-foreground" />
            )}
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
            {isAuthenticated() ? (
              <>
                <ThemeToggle />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="flex items-center gap-2 p-1 h-auto text-header-foreground hover:bg-header/80 hover:text-header-foreground">
                      <span className='hidden sm:inline'>{user?.profile.name || user?.profile.email}</span>
                      <div className='flex items-center justify-center bg-header-foreground/20 rounded-full h-8 w-8'>
                        <User className="h-5 w-5 text-header-foreground" />
                      </div>
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
                    <DropdownMenuItem onSelect={() => setIsProfileModalOpen(true)}>
                      <User className="mr-2 h-4 w-4" />
                      <span>Profile / Token Claims</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setIsStatusModalOpen(true)}>
                      <Info className="mr-2 h-4 w-4" />
                      <span>Backend Services</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={logout}>
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Logout</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={login} className="text-header-foreground hover:bg-header/80 hover:text-header-foreground">
                <LogIn className="mr-0 sm:mr-2 h-4 w-4" /> <span className="hidden sm:inline">Login</span>
              </Button>
            )}
          </div>
        </header>

        {isAuthenticated() ? (
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
                      !(item.devOnly && !(process.env.NODE_ENV == 'development' || process.env.NEXT_FORCE_DEV_OPTIONS))
                    );

                    if (filteredItems.length === 0) {
                      return null;
                    }

                    return (
                      <React.Fragment key={group.label || `group-${groupIndex}`}>
                        {group.label && (
                          <SidebarGroupLabel className="px-2 pt-2 group-data-[collapsible=icon]:pt-0">
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

            <SidebarInset className="flex-1 overflow-y-auto p-4 md:p-6 pb-8 md:pb-12">
              {breadcrumbItems.length > 1 && <Breadcrumbs items={breadcrumbItems} />}
              {children}
              <CustomFooter />
            </SidebarInset>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
            <Image
              src={LogoBlue}
              height={75}
              width={75}
              alt="LamassuIoT Logo"
            />
            <h1 className="text-3xl font-bold mt-3 mb-3">Welcome to LamassuIoT</h1>
            <p className="text-lg text-muted-foreground mb-8 max-w-md">
              Securely manage your X.509 certificates and IoT device identities. Please log in to access the dashboard.
            </p>
            <Button onClick={login} size="lg" className="px-8 py-6 text-lg">
              <LogIn className="mr-2 h-5 w-5" /> Login with Lamassu Identity
            </Button>
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
    </SidebarProvider>
  );
};


const InnerLayout = ({ children }: { children: React.ReactNode }) => {
  console.log("InnerLayout: Rendering layout component");
  useEffect(() => {
    console.log("InnerLayout: Mounted");
  }, []);

  const { isLoading: authIsLoading } = useAuth();
  const [clientMounted, setClientMounted] = React.useState(false);
  const pathname = usePathname();

  React.useEffect(() => {
    setClientMounted(true);
  }, []);

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

  if (authIsLoading) {
    return <LoadingState />;
  }

  return <MainLayoutContent>{children}</MainLayoutContent>;
};


export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script src="/config.js" strategy="beforeInteractive" />
        <title>LamassuIoT Certificate Manager</title>
        <meta name="description" content="Manage and verify your X.509 certificates with LamassuIoT." />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="/custom-theme.css"></link>
      </head>
      <body className="font-body antialiased">
        <ConfigProvider>
          <AuthProvider>
            <React.Suspense fallback={<LoadingState />}>
              <InnerLayout>{children}</InnerLayout>
            </React.Suspense>
            <Toaster />
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
