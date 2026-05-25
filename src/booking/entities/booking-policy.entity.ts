import { ApiProperty } from '@nestjs/swagger';
import { ProtectionPlanType } from '@prisma/client';

export class BookingProtectionPlanPolicyEntity {
  @ApiProperty({ enum: ProtectionPlanType })
  protectionPlan: ProtectionPlanType;

  @ApiProperty()
  feeRate: number;

  @ApiProperty()
  deductible: number;

  @ApiProperty()
  coverageLimit: number;

  @ApiProperty()
  isDefault: boolean;

  constructor(partial: BookingProtectionPlanPolicyEntity) {
    Object.assign(this, partial);
  }
}

export class BookingPrepaidChargingPolicyEntity {
  @ApiProperty()
  fee: number;

  @ApiProperty()
  creditPercent: number;

  @ApiProperty()
  requiresBatteryReturnMinimum: boolean;

  constructor(partial: BookingPrepaidChargingPolicyEntity) {
    Object.assign(this, partial);
  }
}

export class BookingRoadsideSupportPolicyEntity {
  @ApiProperty()
  fee: number;

  @ApiProperty()
  creditAmount: number;

  constructor(partial: BookingRoadsideSupportPolicyEntity) {
    Object.assign(this, partial);
  }
}

export class BookingPolicyEntity {
  @ApiProperty({ enum: ProtectionPlanType })
  defaultProtectionPlan: ProtectionPlanType;

  @ApiProperty({ type: [BookingProtectionPlanPolicyEntity] })
  protectionPlans: BookingProtectionPlanPolicyEntity[];

  @ApiProperty({ type: BookingPrepaidChargingPolicyEntity })
  prepaidCharging: BookingPrepaidChargingPolicyEntity;

  @ApiProperty({ type: BookingRoadsideSupportPolicyEntity })
  roadsideSupport: BookingRoadsideSupportPolicyEntity;

  constructor(partial: BookingPolicyEntity) {
    Object.assign(this, partial);
  }
}
