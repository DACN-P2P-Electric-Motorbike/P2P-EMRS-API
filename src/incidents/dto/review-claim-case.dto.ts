import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClaimCaseOutcome } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewClaimCaseDto {
  @ApiProperty({
    enum: ClaimCaseOutcome,
    description:
      'Four-eyes claim outcome. The second reviewer must submit the same outcome as the first reviewer.',
  })
  @IsEnum(ClaimCaseOutcome)
  decision: ClaimCaseOutcome;

  @ApiPropertyOptional({
    description: 'Admin review notes for this review step',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
