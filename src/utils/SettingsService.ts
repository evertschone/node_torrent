import { GlobalSettings } from '../models/GlobalSettings'; // Adjust the path as necessary
export const allowedKeys = [
  'torrentClientBasePath',
  'torrentClientSavePath',
  'destinationSavePath',
  'previewSavePath',
  'defaultTorrentCategory',
  'defaultRenameTemplate',
  'eventLoopInterval',
  'minDlSpeed'
] as const;

export type AllowedKey = (typeof allowedKeys)[number];

class SettingsService {
  private settings: { [key: string]: string } = {};

  async initialize() {
    const settingsArray = await GlobalSettings.findAll();
    settingsArray.forEach(setting => {
      this.settings[setting.key] = setting.value;
    });
  }

  getSetting(key: AllowedKey): string | undefined {
    return this.settings[key];
  }

  async setSetting(key: AllowedKey, value: string): Promise<void> {
    await GlobalSettings.upsert({ key, value });
    this.settings[key] = value;
  }

  getAllSettings(): { [key: string]: string } {
    return this.settings;
  }
}

const settingsService = new SettingsService();
export default settingsService;
