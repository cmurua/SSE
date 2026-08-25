// Puerto de las clases .card / .card-pad del prototipo (SSE.html).
// `padded` mapea a .card-pad: las pantallas que dibujan su propio padding
// interno (tablas, graficos) lo pasan en false, como en el prototipo.
import type { HTMLAttributes } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
}

export function Card({ padded = true, className = "", children, ...props }: CardProps) {
  return (
    <div className={`card ${padded ? "card-pad" : ""} ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}
