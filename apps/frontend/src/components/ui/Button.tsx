// Puerto de las clases .btn-dark / .btn-ghost del prototipo (SSE.html).
// El estilo vive en globals.css (que a su vez lee tokens.css): aca no hay
// colores hardcodeados, solo la eleccion de variante.
import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "dark" | "ghost";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  dark: "btn-dark",
  ghost: "btn-ghost",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({
  variant = "dark",
  type = "button",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${VARIANT_CLASS[variant]} ${className}`.trim()}
      {...props}
    />
  );
}
