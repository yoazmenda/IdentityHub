import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

const SCHEDULES = ['manual', 'hourly', 'daily', 'weekly'] as const;

export class UpdateAutomationDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsIn(SCHEDULES, { message: `must be one of: ${SCHEDULES.join(', ')}` })
  schedule?: (typeof SCHEDULES)[number];

  @IsOptional()
  @IsString()
  project_key?: string;

  @IsOptional()
  @IsString()
  issue_type_id?: string;
}
