import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SubmitKycDto {
  @ApiProperty({
    description: 'Selfie photo URL',
    example: 'https://bucket.s3.ap-southeast-1.amazonaws.com/kyc/selfie.jpg',
  })
  @IsString()
  @IsNotEmpty()
  selfieUrl: string;

  @ApiProperty({
    description: 'Front side of the national ID card',
    example: 'https://bucket.s3.ap-southeast-1.amazonaws.com/kyc/id-front.jpg',
  })
  @IsString()
  @IsNotEmpty()
  idCardFrontUrl: string;

  @ApiProperty({
    description: 'Back side of the national ID card',
    example: 'https://bucket.s3.ap-southeast-1.amazonaws.com/kyc/id-back.jpg',
  })
  @IsString()
  @IsNotEmpty()
  idCardBackUrl: string;
}
