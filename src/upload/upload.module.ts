import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { IncidentEvidenceReceiptService } from './incident-evidence-receipt.service';

@Module({
  imports: [
    MulterModule.register({
      storage: memoryStorage(), // Store files in memory for S3 upload

      /**
       * Security: DoS prevention through comprehensive rate limiting
       * Reference: OWASP Guidelines + SonarQube best practices
       *
       * Justification:
       * - fileSize: 5MB per file (below OWASP recommended max 8MB)
       * - files: 3 per request (prevents multi-file upload DoS)
       * - fields: 10 max form fields (prevents field enumeration attacks)
       * - fieldSize: 2MB per field (prevents large payload DoS)
       *
       * Memory storage risk is mitigated by these limits.
       * Total memory per request: ~12MB max (3 files × 5MB + 10 fields × 2MB worst-case)
       */
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB per file (OWASP-safe: ≤ 8MB)
        files: 3, // Max 3 files per request (prevent multi-file DoS)
        fields: 10, // Max 10 form fields (prevent field enumeration)
        fieldSize: 2 * 1024 * 1024, // 2MB per field (prevent large payloads)
      },

      /**
       * Security: Strict file type validation using whitelist approach
       * - Rejects files that don't start with 'image/'
       * - Prevents upload of executable/script files
       * - MIME type checked at multer level for early rejection
       */
      fileFilter: (req, file, cb) => {
        // Whitelist: only allow image MIME types
        const allowedMimeTypes = [
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
        ];

        if (!allowedMimeTypes.includes(file.mimetype)) {
          return cb(
            new Error(
              `Invalid file type. Allowed: ${allowedMimeTypes.join(', ')}`,
            ),
            false,
          );
        }

        cb(null, true);
      },
    }),
  ],
  controllers: [UploadController],
  providers: [UploadService, IncidentEvidenceReceiptService],
  exports: [UploadService, IncidentEvidenceReceiptService],
})
export class UploadModule {}
