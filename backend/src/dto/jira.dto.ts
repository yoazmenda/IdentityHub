import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateJiraTicketDto {
  @IsString()
  @IsNotEmpty({ message: 'must not be empty' })
  project_key!: string;

  @IsString()
  @IsNotEmpty({ message: 'must not be empty' })
  issue_type_id!: string;

  /** Optional overrides — default to the finding's title/description when omitted. */
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'must not be empty' })
  summary?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
