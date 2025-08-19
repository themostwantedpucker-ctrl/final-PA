import { Vehicle, Settings, DailyStats } from '@/types/parking';

const STORAGE_KEYS = {
  VEHICLES: 'parking_vehicles',
  SETTINGS: 'parking_settings',
  DAILY_STATS: 'parking_daily_stats',
  PERMANENT_CLIENTS: 'parking_permanent_clients'
};

export const getDefaultSettings = (): Settings => ({
  siteName: 'Smart Parking System',
  pricing: {
    car: { baseHours: 10, baseFee: 100, extraHourFee: 10 },
    bike: { baseHours: 10, baseFee: 50, extraHourFee: 5 },
    rickshaw: { baseHours: 10, baseFee: 100, extraHourFee: 10 }
  },
  credentials: {
    username: 'admin',
    password: 'admin 1234'
  },
  viewMode: 'list'
});

export const loadFromStorage = <T>(key: string, defaultValue: T): T => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
};

export const saveToStorage = <T>(key: string, data: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save to storage:', error);
  }
};

export const loadVehicles = (): Vehicle[] => 
  loadFromStorage(STORAGE_KEYS.VEHICLES, []);

export const saveVehicles = (vehicles: Vehicle[]): void => 
  saveToStorage(STORAGE_KEYS.VEHICLES, vehicles);

export const loadSettings = (): Settings => 
  loadFromStorage(STORAGE_KEYS.SETTINGS, getDefaultSettings());

export const saveSettings = (settings: Settings): void => 
  saveToStorage(STORAGE_KEYS.SETTINGS, settings);

export const loadDailyStats = (): DailyStats[] => 
  loadFromStorage(STORAGE_KEYS.DAILY_STATS, []);

export const saveDailyStats = (stats: DailyStats[]): void => 
  saveToStorage(STORAGE_KEYS.DAILY_STATS, stats);

export const loadPermanentClients = (): Vehicle[] => 
  loadFromStorage(STORAGE_KEYS.PERMANENT_CLIENTS, []);

export const savePermanentClients = (clients: Vehicle[]): void => 
  saveToStorage(STORAGE_KEYS.PERMANENT_CLIENTS, clients);