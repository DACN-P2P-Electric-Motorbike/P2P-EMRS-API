import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  EvidenceAnnotation,
  EvidenceAnnotationTargetType,
} from '@prisma/client';

type EvidenceAnnotationAuthor = {
  id: string;
  fullName: string;
  email?: string;
};

type EvidenceAnnotationLike = EvidenceAnnotation & {
  author?: EvidenceAnnotationAuthor | null;
};

export class EvidenceAnnotationEntity implements EvidenceAnnotation {
  @ApiProperty()
  id: string;

  @ApiProperty()
  bookingId: string;

  @ApiPropertyOptional()
  claimCaseId: string | null;

  @ApiProperty({ enum: EvidenceAnnotationTargetType })
  targetType: EvidenceAnnotationTargetType;

  @ApiProperty()
  targetId: string;

  @ApiPropertyOptional()
  authorId: string | null;

  @ApiProperty()
  note: string;

  @ApiProperty({ type: [String] })
  tags: string[];

  @ApiPropertyOptional()
  highlight: any;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiPropertyOptional()
  author?: EvidenceAnnotationAuthor | null;

  constructor(partial: Partial<EvidenceAnnotationEntity>) {
    Object.assign(this, partial);
  }

  static fromPrisma(
    annotation: EvidenceAnnotationLike,
  ): EvidenceAnnotationEntity {
    return new EvidenceAnnotationEntity(annotation);
  }
}
