import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString, Max, Min } from 'class-validator';

export class AdjustTrustScoreDto {
  @ApiProperty({
    description: 'Score delta to apply. Positive values restore/boost score.',
    example: -10,
    minimum: -150,
    maximum: 150,
  })
  @IsNumber()
  @Min(-150)
  @Max(150)
  delta: number;

  @ApiProperty({
    description: 'Required admin reason for audit trail',
    example: 'Confirmed severe vehicle-damage dispute',
  })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
