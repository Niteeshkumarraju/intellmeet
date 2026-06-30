import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cn } from "@/lib/utils"

const Button = React.forwardRef(({ className, variant = "default", size = "default", asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  
  const baseStyles = "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
  
  const variants = {
    default: "bg-indigo-600 text-white shadow hover:bg-indigo-500",
    destructive: "bg-red-600 text-white shadow-sm hover:bg-red-500",
    outline: "border border-slate-700 bg-transparent shadow-sm hover:bg-slate-800 text-slate-300",
    secondary: "bg-slate-800 text-slate-100 shadow-sm hover:bg-slate-700",
    ghost: "hover:bg-slate-800 text-slate-300 hover:text-white",
    link: "text-indigo-400 underline-offset-4 hover:underline"
  }

  const sizes = {
    default: "h-9 px-4 py-2",
    sm: "h-8 rounded-md px-3 text-xs",
    lg: "h-10 rounded-md px-8",
    icon: "h-9 w-9"
  }

  return (
    <Comp
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      ref={ref}
      {...props}
    />
  )
})
Button.displayName = "Button"

export { Button }
