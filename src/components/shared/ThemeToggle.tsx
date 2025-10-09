
"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const [theme, setThemeState] = React.useState<"light" | "dark">("light")
  const [mounted, setMounted] = React.useState(false)

  // Function to set theme and cookie
  const setTheme = (newTheme: "light" | "dark") => {
    setThemeState(newTheme);
    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    // Set cookie that expires in 1 year
    document.cookie = `theme=${newTheme}; path=/; max-age=31536000; samesite=lax`;
  };
  
  React.useEffect(() => {
    setMounted(true);
    // On mount, check for the cookie first, then system preference
    const cookieValue = document.cookie.match(/theme=(light|dark)/)?.[1];
    if (cookieValue === 'dark' || (cookieValue !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        setTheme('dark');
    } else {
        setTheme('light');
    }
  }, []);

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  // To avoid hydration mismatch, we don't render the button until the component has mounted on the client
  if (!mounted) {
    return <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary/80 hover:text-primary-foreground" disabled />
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className="text-primary-foreground hover:bg-primary/80 hover:text-primary-foreground"
      aria-label="Toggle theme"
    >
      {theme === "light" ? (
        <Sun className="h-5 w-5" />
      ) : (
        <Moon className="h-5 w-5" />
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
