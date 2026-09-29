import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

// Two badge styles, matching the certificate details header:
// - Primary (default, destructive, success, warning, info, muted): the
//   relevant value (status, entity identity, outcome). Bordered, medium weight.
// - Secondary: supporting attributes (algorithms, tags, usages, counts).
//   Borderless muted pill.
// Geometry (h-6, rounded-md, px-2, text-xs, size-3 icons) is shared and must not
// be overridden at call sites.
const primaryBadge = "gap-1.5 border font-medium"

const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center overflow-hidden rounded-md px-2 text-xs whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&>svg]:pointer-events-none [&>svg]:size-3! [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: cn(primaryBadge, "border-primary/20 bg-primary/10 text-primary [a]:hover:bg-primary/15"),
        destructive: cn(primaryBadge, "border-destructive/20 bg-destructive/10 text-destructive [a]:hover:bg-destructive/15"),
        success: cn(primaryBadge, "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 [a]:hover:bg-emerald-500/15"),
        warning: cn(primaryBadge, "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400 [a]:hover:bg-amber-500/15"),
        info: cn(primaryBadge, "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-400 [a]:hover:bg-sky-500/15"),
        muted: cn(primaryBadge, "border-border bg-muted text-muted-foreground [a]:hover:bg-muted/70"),
        secondary: "gap-1 bg-muted text-muted-foreground [a]:hover:bg-muted/70",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>

function Badge({
  className,
  variant = "default",
  asChild = false,
  dot = false,
  children,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean; dot?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    >
      {dot && !asChild && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />}
      {children}
    </Comp>
  )
}

export { Badge, badgeVariants, type BadgeVariant }
