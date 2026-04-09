import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

export class EnableGameDto {
  @IsString()
  @IsNotEmpty()
  slug: string;

  @IsBoolean()
  enabled: boolean;
}
