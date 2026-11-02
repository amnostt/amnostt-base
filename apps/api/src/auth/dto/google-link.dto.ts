import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class GoogleLinkDto {
  @IsUUID()
  challengeId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(8192)
  credential!: string;
}
