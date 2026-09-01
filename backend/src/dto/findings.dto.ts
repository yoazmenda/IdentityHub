import { Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
const STATUSES = ['open', 'resolved'] as const;

export class CreateFindingJiraDto {
  @IsString()
  @IsNotEmpty({ message: 'must not be empty' })
  project_key!: string;

  @IsString()
  @IsNotEmpty({ message: 'must not be empty' })
  issue_type_id!: string;
}

export class CreateFindingDto {
  @IsString()
  @IsNotEmpty({ message: 'must not be empty' })
  title!: string;

  @IsString()
  @IsNotEmpty({ message: 'must not be empty' })
  description!: string;

  @IsIn(SEVERITIES, { message: `must be one of: ${SEVERITIES.join(', ')}` })
  severity!: (typeof SEVERITIES)[number];

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateFindingJiraDto)
  jira?: CreateFindingJiraDto;
}

export class UpdateFindingDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'must not be empty' })
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'must not be empty' })
  description?: string;

  @IsOptional()
  @IsIn(SEVERITIES, { message: `must be one of: ${SEVERITIES.join(', ')}` })
  severity?: (typeof SEVERITIES)[number];

  @IsOptional()
  @IsIn(STATUSES, { message: `must be one of: ${STATUSES.join(', ')}` })
  status?: (typeof STATUSES)[number];
}
