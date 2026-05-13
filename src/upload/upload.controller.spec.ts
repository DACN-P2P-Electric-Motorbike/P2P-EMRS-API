import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

describe('UploadController', () => {
  let controller: UploadController;
  let uploadService: jest.Mocked<UploadService>;

  const file = { originalname: 'bike.jpg' } as Express.Multer.File;
  const uploadResult = {
    url: 'https://cdn.example.com/vehicles/bike.jpg',
    key: 'vehicles/bike.jpg',
    fileName: 'bike.jpg',
  };

  beforeEach(() => {
    uploadService = {
      uploadFile: jest.fn().mockResolvedValue(uploadResult),
      uploadFiles: jest.fn().mockResolvedValue([uploadResult]),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<UploadService>;
    controller = new UploadController(uploadService);
  });

  it('uploads a single vehicle image to the vehicles folder', async () => {
    await expect(controller.uploadVehicleImage(file)).resolves.toBe(
      uploadResult,
    );

    expect(uploadService.uploadFile).toHaveBeenCalledWith(file, 'vehicles');
  });

  it('uploads multiple vehicle images to the vehicles folder', async () => {
    await expect(controller.uploadVehicleImages([file])).resolves.toEqual([
      uploadResult,
    ]);

    expect(uploadService.uploadFiles).toHaveBeenCalledWith([file], 'vehicles');
  });

  it('uploads license images to the licenses folder', async () => {
    await expect(controller.uploadLicenseImage(file)).resolves.toBe(
      uploadResult,
    );

    expect(uploadService.uploadFile).toHaveBeenCalledWith(file, 'licenses');
  });

  it('deletes an uploaded file and returns a user-facing message', async () => {
    await expect(controller.deleteFile('vehicles/bike.jpg')).resolves.toEqual({
      message: 'File deleted successfully',
    });

    expect(uploadService.deleteFile).toHaveBeenCalledWith('vehicles/bike.jpg');
  });
});
