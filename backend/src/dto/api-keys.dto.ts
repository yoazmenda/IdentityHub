import { IsNotEmpty, IsString } from 'class-validator';

export class CreateApiKeyDto {
  @IsString()
  @IsNotEmpty({ message: 'must not be empty' })
  label!: string;
}
