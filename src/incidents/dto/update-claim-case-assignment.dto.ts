import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export enum ClaimCaseAssignmentAction {
  ASSIGN_SELF = 'ASSIGN_SELF',
  RELEASE = 'RELEASE',
}

export class UpdateClaimCaseAssignmentDto {
  @ApiProperty({
    enum: ClaimCaseAssignmentAction,
    description: 'Assign the claim case to the current Admin or release it',
  })
  @IsEnum(ClaimCaseAssignmentAction)
  action: ClaimCaseAssignmentAction;
}
