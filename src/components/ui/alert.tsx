import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

const alertVariants = cva(
  "group/alert relative grid w-full gap-0.5 rounded-2xl border px-4 py-3 text-left text-sm has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2.5 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground",
        destructive:
          "bg-red-50 text-red-900 border-red-300 *:data-[slot=alert-description]:text-red-800 dark:bg-card dark:text-destructive dark:border-border dark:*:data-[slot=alert-description]:text-destructive/90 *:[svg]:text-current",
        success:
          "bg-green-50 text-green-900 border-green-300 dark:bg-card dark:text-green-400 dark:border-green-800 *:data-[slot=alert-description]:text-green-800 dark:*:data-[slot=alert-description]:text-green-400/90",
        warning:
          "bg-yellow-50 text-yellow-900 border-yellow-300 dark:bg-card dark:text-yellow-400 dark:border-yellow-800 *:data-[slot=alert-description]:text-yellow-800 dark:*:data-[slot=alert-description]:text-yellow-400/90",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const alertTitleVariants = cva("font-medium group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground", {
  variants: {
    variant: {
      default: "",
      warning: "text-yellow-900 dark:text-yellow-400",
      success: "text-green-900 dark:text-green-400",
      destructive: "text-red-900 dark:text-destructive",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

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
        className="w-full text-left flex items-center gap-2.5"
      >
        {mainContent}
        <ChevronDown
          className={cn(
            "ml-auto size-4 shrink-0 transition-transform duration-200",
            expanded && "rotate-180"
          )}
        />
      </button>
      {expanded && <div className="mt-3">{expandableContent}</div>}
    </div>
  )
}

function AlertTitle({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertTitleVariants>) {
  return (
    <div
      data-slot="alert-title"
      className={cn(alertTitleVariants({ variant }), className)}
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
        "text-sm text-balance text-muted-foreground md:text-pretty [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4",
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
      className={cn("absolute top-2.5 right-3", className)}
      {...props}
    />
  )
}

function AlertExpandableContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-expandable-content"
      className={cn("text-sm", className)}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription, AlertAction, AlertExpandableContent }
