"use client"

import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTheme } from "@/contexts/ThemeContext"

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const toggleButtonClassName =
    "text-header-foreground/85 hover:bg-header-foreground/10 hover:text-header-foreground focus-visible:ring-header-foreground/30"

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className={toggleButtonClassName}
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
