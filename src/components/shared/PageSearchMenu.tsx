"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { accentStyles, type PageSearchAccent } from "@/lib/page-search-accents";

export type { PageSearchAccent };

export interface PageSearchNavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  description?: string;
  accent?: PageSearchAccent;
  devOnly?: boolean;
}

export interface PageSearchNavGroup {
  label?: string;
  items: PageSearchNavItem[];
  accent?: PageSearchAccent;
  devOnly?: boolean;
}

interface PageSearchMenuProps {
  navGroups: PageSearchNavGroup[];
  isDeveloperMode?: boolean;
}

interface SearchablePage extends PageSearchNavItem {
  groupLabel: string;
  accent: PageSearchAccent;
}

const GENERAL_GROUP_LABEL = "General";

function normalize(value: string) {
  return value.toLowerCase().trim();
}

function getSearchablePages(navGroups: PageSearchNavGroup[], isDeveloperMode?: boolean) {
  return navGroups.flatMap(group => {
    if (group.devOnly && !isDeveloperMode) return [];

    const groupLabel = group.label || GENERAL_GROUP_LABEL;

    return group.items
      .filter(item => !(item.devOnly && !isDeveloperMode))
      .map(item => ({
        ...item,
        groupLabel,
        accent: item.accent || group.accent || "general",
      }));
  });
}

function pageMatches(page: SearchablePage, query: string) {
  if (!query) return true;

  const haystack = normalize([
    page.label,
    page.groupLabel,
    page.href,
    page.description || "",
  ].join(" "));

  return query.split(/\s+/).every(part => haystack.includes(part));
}

export function PageSearchMenu({ navGroups, isDeveloperMode }: PageSearchMenuProps) {
  const router = useRouter();
  const desktopInputRef = React.useRef<HTMLInputElement>(null);
  const mobileInputRef = React.useRef<HTMLInputElement>(null);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);

  const pages = React.useMemo(
    () => getSearchablePages(navGroups, isDeveloperMode),
    [navGroups, isDeveloperMode]
  );

  const normalizedQuery = normalize(query);
  const matchedPages = React.useMemo(
    () => pages.filter(page => pageMatches(page, normalizedQuery)),
    [pages, normalizedQuery]
  );

  const groupedVisiblePages = React.useMemo(() => {
    const grouped = new Map<string, SearchablePage[]>();

    matchedPages.forEach(page => {
      const groupPages = grouped.get(page.groupLabel) || [];
      groupPages.push(page);
      grouped.set(page.groupLabel, groupPages);
    });

    return Array.from(grouped.entries());
  }, [matchedPages]);

  React.useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        window.requestAnimationFrame(() => {
          if (window.matchMedia("(min-width: 768px)").matches) {
            desktopInputRef.current?.focus();
            return;
          }

          mobileInputRef.current?.focus();
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const selectPage = React.useCallback((page: SearchablePage) => {
    setOpen(false);
    setQuery("");
    router.push(page.href);
  }, [router]);

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex(index => Math.min(index + 1, Math.max(matchedPages.length - 1, 0)));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(index => Math.max(index - 1, 0));
      return;
    }

    if (event.key === "Enter" && matchedPages[activeIndex]) {
      event.preventDefault();
      selectPage(matchedPages[activeIndex]);
      return;
    }

    if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="flex w-full max-w-xl justify-center">
          <div className="relative hidden w-full md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-header-foreground/70" />
            <Input
              ref={desktopInputRef}
              value={query}
              onChange={event => {
                setQuery(event.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={handleInputKeyDown}
              placeholder="Search pages..."
              className="h-9 rounded-md border-header-foreground/30 bg-header-foreground/10 pl-9 pr-20 text-header-foreground placeholder:text-header-foreground/70 focus-visible:border-header-foreground/50 focus-visible:ring-header-foreground/20"
              aria-label="Search pages"
            />
            {query ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-header-foreground/80 hover:bg-header-foreground/10 hover:text-header-foreground"
                onClick={() => {
                  setQuery("");
                  desktopInputRef.current?.focus();
                }}
                aria-label="Clear page search"
              >
                <X className="h-4 w-4" />
              </Button>
            ) : (
              <span className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-sm border border-header-foreground/20 px-1.5 py-0.5 text-[11px] leading-none text-header-foreground/70 lg:inline">
                Ctrl K
              </span>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="md:hidden text-header-foreground hover:bg-header/80 hover:text-header-foreground"
            aria-label="Search pages"
            onClick={() => {
              setOpen(true);
              window.requestAnimationFrame(() => mobileInputRef.current?.focus());
            }}
          >
            <Search className="h-5 w-5" />
          </Button>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="center"
        sideOffset={6}
        onOpenAutoFocus={event => event.preventDefault()}
        className="w-[calc(100vw-2rem)] gap-0 overflow-hidden rounded-lg border bg-popover p-0 text-popover-foreground shadow-sm md:w-[720px] xl:w-[900px]"
      >
        <div className="border-b p-3 md:hidden">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={mobileInputRef}
              value={query}
              onChange={event => setQuery(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Search pages..."
              className="h-9 rounded-md border-input bg-background pl-9 pr-9"
              aria-label="Search pages"
            />
            {query && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                onClick={() => {
                  setQuery("");
                  mobileInputRef.current?.focus();
                }}
                aria-label="Clear page search"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <div>
          <div className="min-w-0">
            <div className="flex h-12 items-center justify-between border-b px-4">
              <span className="truncate text-sm text-muted-foreground">
                {query ? `Search results for "${query}"` : "Search pages"}
              </span>
              <span className="hidden text-xs text-muted-foreground md:inline">
                {matchedPages.length} result{matchedPages.length === 1 ? "" : "s"}
              </span>
            </div>
            <ScrollArea className="h-[min(520px,calc(100vh-9rem))]">
              {matchedPages.length > 0 ? (
                <div className="p-1">
                  {groupedVisiblePages.map(([groupLabel, groupPages]) => (
                    <div key={groupLabel} className="overflow-hidden p-1 text-foreground">
                      <div className="flex h-7 items-center gap-2 px-2 text-xs font-medium text-muted-foreground">
                        <span className={cn(
                          "h-1.5 w-1.5 shrink-0 rounded-full",
                          accentStyles[groupPages[0]?.accent || "general"].marker
                        )} />
                        <span>{groupLabel}</span>
                      </div>
                      <div className="grid gap-1 md:grid-cols-2 xl:grid-cols-3">
                        {groupPages.map(page => {
                          const pageIndex = matchedPages.findIndex(item => item.href === page.href);
                          const Icon = page.icon;
                          const styles = accentStyles[page.accent];
                          const isSelected = pageIndex === activeIndex;

                          return (
                            <button
                              key={page.href}
                              type="button"
                              data-selected={isSelected}
                              className={cn(
                                "group flex w-full cursor-default select-none items-center gap-3 rounded-sm px-2 py-2 text-left text-sm outline-none transition-colors",
                                styles.row,
                                isSelected && styles.rowSelected
                              )}
                              onMouseEnter={() => setActiveIndex(pageIndex)}
                              onClick={() => selectPage(page)}
                            >
                              <span className={cn(
                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors",
                                styles.icon,
                                isSelected && styles.iconSelected
                              )}>
                                <Icon className="h-4 w-4" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className={cn(
                                  "block truncate text-sm font-medium leading-none text-foreground transition-colors",
                                  "group-hover:text-foreground group-data-[selected=true]:text-foreground"
                                )}>
                                  {page.label}
                                </span>
                                <span className="mt-1 block truncate text-xs text-muted-foreground transition-colors group-hover:text-muted-foreground group-data-[selected=true]:text-muted-foreground">
                                  {page.description || page.href}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-40 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                  No pages match your search.
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
