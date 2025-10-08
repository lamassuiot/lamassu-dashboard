import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { ChevronDown, ChevronUp } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative w-full rounded-lg border-l-4 bg-muted/50 transition-colors",
  {
    variants: {
      variant: {
        default: "bg-background text-foreground border-l-border [&>svg]:text-muted-foreground",
        destructive:
          "border-l-destructive bg-destructive/10 text-destructive dark:border-l-destructive dark:bg-destructive/10 [&>svg]:text-destructive",
        warning:
          "border-l-orange-500 bg-orange-50 text-orange-700 dark:border-l-orange-500/80 dark:bg-orange-950/20 [&>svg]:text-orange-500",
        success:
          "border-l-primary bg-primary/5 text-foreground dark:border-l-primary/70 dark:bg-primary/5 [&>svg]:text-primary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

interface AlertProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {
  expandable?: boolean;
  defaultExpanded?: boolean;
  children?: React.ReactNode;
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, expandable = false, defaultExpanded = false, children, onClick, ...props }, ref) => {
    const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);
    
    if (!expandable) {
      return (
        <div
          ref={ref}
          role="alert"
          className={cn(alertVariants({ variant }), "p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4", className)}
          {...props}
        >
          {children}
        </div>
      );
    }

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      setIsExpanded(!isExpanded);
      console.log('Alert clicked, isExpanded:', !isExpanded); // Debug log
      onClick?.(e);
    };

    return (
      <div
        ref={ref}
        role="alert"
        className={cn(alertVariants({ variant }), "cursor-pointer hover:bg-muted/70", className)}
        onClick={handleClick}
        {...props}
      >
        <div className="flex items-center justify-between p-4">
          <div className="flex items-start space-x-3 flex-1 min-w-0">
            {/* Render icon first */}
            {React.Children.map(children, (child) => {
              if (React.isValidElement(child) && 
                  child.type !== AlertTitle && 
                  child.type !== AlertDescription &&
                  child.type !== AlertExpandableContent) {
                console.log('Rendering as icon:', child.type); // Debug log
                return child;
              }
              return null;
            })}
            {/* Then render title and description in a column */}
            <div className="flex flex-col space-y-1 flex-1">
              {React.Children.map(children, (child) => {
                if (React.isValidElement(child) && (child.type === AlertTitle || child.type === AlertDescription)) {
                  return child;
                }
                return null;
              })}
            </div>
          </div>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 ml-4 flex-shrink-0">
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
        {/* Expandable content with smooth transition */}
        <div 
          className={cn(
            "overflow-hidden transition-all duration-300 ease-in-out",
            isExpanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
          )}
        >
          <div className="px-4 pb-4">
            {React.Children.map(children, (child) => {
              if (React.isValidElement(child) && child.type === AlertExpandableContent) {
                console.log('Rendering AlertExpandableContent'); // Debug log
                return child;
              }
              return null;
            })}
          </div>
        </div>
      </div>
    );
  }
);
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement> & {
    variant?: "default" | "destructive" | "warning" | "success"
  }
>(({ className, variant, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn(
      "font-medium font-semibold leading-none tracking-tight ",
      variant === "default" && "text-foreground",
      variant === "destructive" && "text-destructive",
      variant === "warning" && "text-orange-700 dark:text-orange-400",
      variant === "success" && "text-primary",
      className
    )}
    {...props}
  />
))
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground [&_p]:leading-relaxed", className)}
    {...props}
  />
))
AlertDescription.displayName = "AlertDescription"

// Export expandable content wrapper for children that should only show when expanded
const AlertExpandableContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, onClick, ...props }, ref) => {
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Prevent event bubbling to avoid collapsing the alert when clicking inside the content
    e.stopPropagation();
    onClick?.(e);
  };

  return (
    <div
      ref={ref}
      className={cn("space-y-4", className)}
      onClick={handleClick}
      {...props}
    />
  );
})
AlertExpandableContent.displayName = "AlertExpandableContent"

export { Alert, AlertTitle, AlertDescription, AlertExpandableContent }
