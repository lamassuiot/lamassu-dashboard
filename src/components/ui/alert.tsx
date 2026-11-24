import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

// Minimalist by default: a tinted background, no border, and the text colour inherited by the icon,
// title and description. Same look as `InlineNote` (components/shared/InlineNote.tsx).
const alertVariants = cva(
  "group/alert relative grid w-full gap-0.5 rounded-md px-2.5 py-2 text-left text-xs has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-14 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2 *:[svg]:row-span-2 *:[svg]:translate-y-px *:[svg]:text-current *:[svg]:size-3.5",
  {
    variants: {
      variant: {
        default: "bg-muted text-muted-foreground *:data-[slot=alert-title]:text-foreground",
        destructive:
          "bg-destructive/10 text-destructive *:data-[slot=alert-description]:text-current *:data-[slot=alert-description]:opacity-90",
        success:
          "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 *:data-[slot=alert-description]:text-current *:data-[slot=alert-description]:opacity-90",
        warning:
          "bg-amber-500/10 text-amber-700 dark:text-amber-400 *:data-[slot=alert-description]:text-current *:data-[slot=alert-description]:opacity-90",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

interface AlertProps extends React.ComponentProps<"div">, VariantProps<typeof alertVariants> {
  expandable?: boolean;
  defaultExpanded?: boolean;
}

function Alert({
  className,
  variant,
  expandable,
  defaultExpanded = true,
  children,
  ...props
}: AlertProps) {
  const [expanded, setExpanded] = React.useState(defaultExpanded ?? true)

  if (!expandable) {
    return (
      <div
        data-slot="alert"
        role="alert"
        className={cn(alertVariants({ variant }), className)}
        {...props}
      >
        {children}
      </div>
    )
  }

  const childArray = React.Children.toArray(children)
  const mainContent = childArray.filter(
    c => !React.isValidElement(c) || c.type !== AlertExpandableContent
  )
  const expandableContent = childArray.filter(
    c => React.isValidElement(c) && c.type === AlertExpandableContent
  )

  return (
    <div
      data-slot="alert"
      role="alert"
      data-expanded={expanded}
      className={cn(alertVariants({ variant }), "block", className)}
      {...props}
    >
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        className="w-full text-left flex items-center gap-2"
      >
        {mainContent}
        <ChevronDown
          className={cn(
            "ml-auto size-4 shrink-0 transition-transform duration-200",
            expanded && "rotate-180"
          )}
        />
      </button>
      {expanded && <div className="mt-2">{expandableContent}</div>}
    </div>
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "font-medium group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-xs text-balance text-muted-foreground md:text-pretty group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4",
        className
      )}
      {...props}
    />
  )
}

function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-action"
      className={cn("absolute top-1.5 right-2", className)}
      {...props}
    />
  )
}

function AlertExpandableContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-expandable-content"
      className={cn("text-xs", className)}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription, AlertAction, AlertExpandableContent }
