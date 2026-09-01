import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'must be a valid email address' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'must be at least 8 characters' })
  password!: string;

  @IsString()
  @MinLength(1, { message: 'must not be empty' })
  name!: string;
}

export class LoginDto {
  @IsEmail({}, { message: 'must be a valid email address' })
  email!: string;

  @IsString()
  @MinLength(1, { message: 'must not be empty' })
  password!: string;
}
