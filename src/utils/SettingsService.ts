import { PrismaClient } from '@prisma/client';

// Define the allowed keys for settings
export const allowedKeys = [
  'torrentClientBasePath',
  'torrentClientSavePath',
  'destinationSavePath',
  'previewSavePath',
  'defaultTorrentCategory',
  'defaultRenameTemplate',
  'eventLoopInterval',
  'minDlSpeed',
  'sequentialDownload'
] as const;

export type AllowedKey = (typeof allowedKeys)[number];

class SettingsService {
  private settings: { [key: string]: string } = {};
  private prisma = new PrismaClient();

  async initialize() {
    const settingsArray = await this.prisma.globalSettings.findMany();
    settingsArray.forEach(setting => {
      this.settings[setting.key] = setting.value;
    });
  }

  getSetting(key: AllowedKey): string | undefined {
    return this.settings[key];
  }

  async setSetting(key: AllowedKey, value: string): Promise<void> {
    await this.prisma.globalSettings.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
    this.settings[key] = value;
  }

  getAllSettings(): { [key: string]: string } {
    return this.settings;
  }
}

const settingsService = new SettingsService();
export default settingsService;
