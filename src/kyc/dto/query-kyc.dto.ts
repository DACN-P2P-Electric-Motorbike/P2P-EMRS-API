import { ApiPropertyOptional } from '@nestjs/swagger';
import { KycStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsInt, Min, Max } from 'class-validator';

export class QueryKycDto {
  @ApiPropertyOptional({
    description: 'Filter by KYC status',
    enum: KycStatus,
    example: KycStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(KycStatus)
  status?: KycStatus;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Page size', default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
