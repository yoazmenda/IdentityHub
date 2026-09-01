import { BadRequestException, ValidationError } from '@nestjs/common';

export interface ValidationDetail {
  field: string;
  message: string;
}

/** Thrown by the global ValidationPipe. Carries the field-level details README documents. */
export class ValidationFailedException extends BadRequestException {
  constructor(details: ValidationDetail[]) {
    super({ error: 'Validation failed', details });
  }
}

/** Flattens class-validator's ValidationError tree into the flat {field, message}[] shape. */
export function toValidationDetails(errors: ValidationError[], parentPath = ''): ValidationDetail[] {
  const details: ValidationDetail[] = [];
  for (const error of errors) {
    const field = parentPath ? `${parentPath}.${error.property}` : error.property;
    if (error.constraints) {
      for (const message of Object.values(error.constraints)) {
        details.push({ field, message });
      }
    }
    if (error.children && error.children.length > 0) {
      details.push(...toValidationDetails(error.children, field));
    }
  }
  return details;
}
