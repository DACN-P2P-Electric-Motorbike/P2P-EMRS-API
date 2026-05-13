import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { UploadService } from './upload.service';

describe('UploadService', () => {
  let service: UploadService;
  let s3Send: jest.Mock;

  const makeFile = (
    overrides: Partial<Express.Multer.File> = {},
  ): Express.Multer.File =>
    ({
      originalname: 'bike.jpg',
      mimetype: 'image/jpeg',
      size: 1024,
      buffer: Buffer.from('image-bytes'),
      ...overrides,
    }) as Express.Multer.File;

  beforeEach(() => {
    const config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          AWS_REGION: 'ap-southeast-1',
          AWS_S3_BUCKET_NAME: 'dreamride-bucket',
          AWS_S3_BUCKET_URL: 'https://cdn.example.com',
          AWS_ACCESS_KEY_ID: 'access-key',
          AWS_SECRET_ACCESS_KEY: 'secret-key',
        };
        return values[key];
      }),
    } as unknown as ConfigService;

    service = new UploadService(config);
    s3Send = jest.fn().mockResolvedValue({});
    (service as any).s3Client = { send: s3Send };
  });

  it('uploads an allowed image and returns a public bucket URL', async () => {
    const result = await service.uploadFile(makeFile(), 'vehicles');

    expect(s3Send).toHaveBeenCalledWith(expect.any(PutObjectCommand));
    expect(result).toEqual({
      url: expect.stringMatching(
        /^https:\/\/cdn\.example\.com\/vehicles\/.+\.jpg$/,
      ),
      key: expect.stringMatching(/^vehicles\/.+\.jpg$/),
      fileName: 'bike.jpg',
    });
  });

  it('constructs an S3 URL when no bucket URL is configured', async () => {
    const config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          AWS_REGION: 'us-east-1',
          AWS_S3_BUCKET_NAME: 'fallback-bucket',
        };
        return values[key];
      }),
    } as unknown as ConfigService;
    service = new UploadService(config);
    s3Send = jest.fn().mockResolvedValue({});
    (service as any).s3Client = { send: s3Send };

    const result = await service.uploadFile(makeFile(), 'licenses');

    expect(result.url).toMatch(
      /^https:\/\/fallback-bucket\.s3\.us-east-1\.amazonaws\.com\/licenses\/.+\.jpg$/,
    );
  });

  it('rejects missing, invalid, and oversized files before S3 is called', async () => {
    await expect(service.uploadFile(undefined as any)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.uploadFile(makeFile({ mimetype: 'application/pdf' })),
    ).rejects.toThrow('Invalid file type');
    await expect(
      service.uploadFile(makeFile({ size: 5 * 1024 * 1024 + 1 })),
    ).rejects.toThrow('File size exceeds 5MB limit');

    expect(s3Send).not.toHaveBeenCalled();
  });

  it('wraps S3 upload errors as BadRequestException', async () => {
    s3Send.mockRejectedValueOnce(new Error('S3 unavailable'));

    await expect(service.uploadFile(makeFile())).rejects.toThrow(
      'Failed to upload file: S3 unavailable',
    );
  });

  it('uploads multiple files and rejects an empty batch', async () => {
    await expect(
      service.uploadFiles([makeFile({ originalname: 'a.png' })], 'vehicles'),
    ).resolves.toHaveLength(1);

    await expect(service.uploadFiles([])).rejects.toThrow('No files provided');
  });

  it('deletes objects and wraps delete failures', async () => {
    await service.deleteFile('vehicles/key.jpg');

    expect(s3Send).toHaveBeenCalledWith(expect.any(DeleteObjectCommand));

    s3Send.mockRejectedValueOnce(new Error('delete failed'));
    await expect(service.deleteFile('vehicles/key.jpg')).rejects.toThrow(
      'Failed to delete file: delete failed',
    );
  });
});
