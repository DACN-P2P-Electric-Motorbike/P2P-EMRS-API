import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export enum DashboardPeriod {
  THIS_MONTH = 'this_month',
  LAST_MONTH = 'last_month',
  THIS_YEAR = 'this_year',
  ALL_TIME = 'all_time',
}

export class DashboardQueryDto {
  @ApiPropertyOptional({
    enum: DashboardPeriod,
    description:
      'Predefined period filter. Ignored if startDate/endDate are provided.',
    default: DashboardPeriod.THIS_MONTH,
  })
  @IsOptional()
  @IsEnum(DashboardPeriod)
  period?: DashboardPeriod = DashboardPeriod.THIS_MONTH;

  @ApiPropertyOptional({
    description: 'Custom start date (ISO 8601). Overrides period.',
    example: '2023-10-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Custom end date (ISO 8601). Overrides period.',
    example: '2023-10-31',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
