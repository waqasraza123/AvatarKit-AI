import type { ButtonHTMLAttributes, ReactNode } from "react"

type ButtonVariant = "primary" | "secondary"

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  variant?: ButtonVariant
}

const variantClassNames: Record<ButtonVariant, string> = {
  primary: "avatarkit-button avatarkit-button-primary",
  secondary: "avatarkit-button avatarkit-button-secondary"
}

export function Button({ children, className, variant = "primary", ...props }: ButtonProps) {
  const classNames = [variantClassNames[variant], className].filter(Boolean).join(" ")

  return (
    <button className={classNames} type="button" {...props}>
      {children}
    </button>
  )
}
