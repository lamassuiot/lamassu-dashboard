
"use client"

import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(({ className, value, indicatorClassName, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn(
      "relative h-4 w-full overflow-hidden rounded-full bg-secondary shadow-inner",
      className
    )}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className={cn(
        "h-full w-full flex-1 bg-gradient-to-r from-primary via-primary to-primary/90 transition-all duration-700 ease-in-out",
        indicatorClassName
      )}
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    >
      {/* Subtle shine effect for better visual feedback */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
    </ProgressPrimitive.Indicator>
  </ProgressPrimitive.Root>
))
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }
