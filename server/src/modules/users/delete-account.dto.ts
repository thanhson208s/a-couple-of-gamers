import { IsNotEmpty, IsString } from "class-validator";

export class DeleteAccountDto {
  @IsString()
  @IsNotEmpty()
  idToken: string;
}