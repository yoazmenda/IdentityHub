import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';

// Shared `:id` param pipe: rejects a malformed id with 400 before it can reach the DAO and
// blow up as a raw "invalid input syntax for type uuid" 500.
export const uuidParam = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () => new BadRequestException('id must be a valid UUID'),
});
