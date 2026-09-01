import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

interface FieldWrapperProps {
  label: string;
  htmlFor: string;
  helperText?: string;
  error?: string;
  children: React.ReactNode;
}

function FieldWrapper({ label, htmlFor, helperText, error, children }: FieldWrapperProps) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-sm text-red-600">{error}</p>
      ) : helperText ? (
        <p className="mt-1.5 text-sm text-gray-500">{helperText}</p>
      ) : null}
    </div>
  );
}

const inputClasses = (hasError?: string) =>
  `block w-full rounded-lg border px-3 py-2 text-sm shadow-sm placeholder:text-gray-400
   focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-accent-500
   ${hasError ? 'border-red-300' : 'border-gray-300'}`;

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  helperText?: string;
  error?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, helperText, error, id, className = '', ...props }, ref) => (
    <FieldWrapper label={label} htmlFor={id!} helperText={helperText} error={error}>
      <input ref={ref} id={id} className={`${inputClasses(error)} ${className}`} {...props} />
    </FieldWrapper>
  ),
);
TextField.displayName = 'TextField';

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  helperText?: string;
  error?: string;
}

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(
  ({ label, helperText, error, id, className = '', ...props }, ref) => (
    <FieldWrapper label={label} htmlFor={id!} helperText={helperText} error={error}>
      <textarea ref={ref} id={id} className={`${inputClasses(error)} ${className}`} {...props} />
    </FieldWrapper>
  ),
);
TextAreaField.displayName = 'TextAreaField';

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  helperText?: string;
  error?: string;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  ({ label, helperText, error, id, className = '', children, ...props }, ref) => (
    <FieldWrapper label={label} htmlFor={id!} helperText={helperText} error={error}>
      <select ref={ref} id={id} className={`${inputClasses(error)} bg-white ${className}`} {...props}>
        {children}
      </select>
    </FieldWrapper>
  ),
);
SelectField.displayName = 'SelectField';
