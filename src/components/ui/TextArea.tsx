import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { CONTROL, controlBorder, Field, fieldId } from './Field';

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  function TextArea(
    { label, error, helperText, className = '', id, ...props },
    ref,
  ) {
    const textareaId = fieldId(id, label);

    return (
      <Field
        id={textareaId}
        label={label}
        error={error}
        helperText={helperText}
      >
        <textarea
          ref={ref}
          id={textareaId}
          aria-invalid={error ? true : undefined}
          className={`${CONTROL} py-2.5 resize-none ${controlBorder(error)} ${className}`}
          {...props}
        />
      </Field>
    );
  },
);
