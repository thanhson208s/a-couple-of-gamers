import { IsInt, Min } from 'class-validator';

export class MaintenanceAnnouncementDto {
  @IsInt()
  @Min(1)
  maintenanceAfter: number;

  @IsInt()
  @Min(1)
  maintenanceDuration: number;
}
