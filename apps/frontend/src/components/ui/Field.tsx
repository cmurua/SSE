// Puerto de las clases .field / .label-text del prototipo (SSE.html).
// Agrupa label + input para que las pantallas no repitan el par a mano.
import { useId } from "react";
import type { InputHTMLAttributes } from "react";

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Field({ label, id, className = "", ...props }: FieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <>
      {label && (
        <label className="label-text" htmlFor={inputId}>
          {label}
        </label>
      )}
      <input id={inputId} className={`field ${className}`.trim()} {...props} />
    </>
  );
}
