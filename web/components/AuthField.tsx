import type { ChangeEvent } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function AuthField({
  id,
  label,
  type,
  icon: Icon,
  value,
  onChange,
  placeholder,
  required,
  minLength,
  maxLength,
  autoComplete,
  readOnly,
}: {
  id: string;
  label: string;
  type: string;
  icon: LucideIcon;
  value: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  autoComplete?: string;
  readOnly?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <div
        className={cn(
          "flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3.5 shadow-sm transition-colors focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/15",
          readOnly && "opacity-60"
        )}
      >
        <Icon size={18} className="shrink-0 text-muted-foreground" />
        <input
          id={id}
          type={type}
          required={required}
          minLength={minLength}
          maxLength={maxLength}
          autoComplete={autoComplete}
          readOnly={readOnly}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
        />
      </div>
    </div>
  );
}
