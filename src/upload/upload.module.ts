import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

@Module({
  imports: [
    MulterModule.register({
      storage: memoryStorage(), // Store files in memory for S3 upload
      // Security: DoS protection with comprehensive rate limiting
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB per file
        files: 5, // Max 5 files per request (prevent multi-file DoS)
        fields: 10, // Limit form fields (prevent field enumeration attacks)
        fieldSize: 1 * 1024 * 1024, // 1MB per field (prevent large field payloads)
      },
      // Security: Strict file type validation (whitelist, not blacklist)
      fileFilter: (req, file, cb) => {
        // Only allow image MIME types
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
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
