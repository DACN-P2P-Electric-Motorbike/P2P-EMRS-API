import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class ReportIssueDto {
  @ApiProperty({
    description: 'Issue description',
    example: 'Vehicle has a flat tire',
  })
  @IsString()
  @IsNotEmpty()
  issueDescription: string;
}
