import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Vehicle, Settings, DailyStats } from '@/types/parking';
import { 
  loadVehicles, 
  saveVehicles, 
  loadSettings, 
  saveSettings, 
  loadDailyStats, 
  saveDailyStats,
  loadPermanentClients,
  savePermanentClients,
  getDefaultSettings
} from '@/utils/storage';
import { apiService } from '@/services/api';
import { calculateParkingFee, getTodayString } from '@/utils/calculations';

interface ParkingContextType {
  vehicles: Vehicle[];
  permanentClients: Vehicle[];
  settings: Settings;
  dailyStats: DailyStats[];
  isAuthenticated: boolean;
  login: (username: string, password: string) => boolean;
  logout: () => void;
  addVehicle: (vehicle: Omit<Vehicle, 'id'>) => Promise<string>;
  exitVehicle: (vehicleId: string) => Promise<void>;
  addPermanentClient: (client: Omit<Vehicle, 'id'>) => void;
  updatePermanentClient: (clientId: string, updates: Partial<Vehicle>) => void;
  removePermanentClient: (clientId: string) => void;
  updateSettings: (newSettings: Settings) => void;
  getCurrentlyParked: () => Vehicle[];
  getTodayStats: () => DailyStats;
}

const ParkingContext = createContext<ParkingContextType | undefined>(undefined);

export const useParkingContext = () => {
  const context = useContext(ParkingContext);
  if (!context) {
    throw new Error('useParkingContext must be used within a ParkingProvider');
  }
  return context;
};

export const ParkingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [permanentClients, setPermanentClients] = useState<Vehicle[]>([]);
  const [settings, setSettings] = useState<Settings>(getDefaultSettings());
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Load data from API with fallback to localStorage
    const loadData = async () => {
      try {
        // Load vehicles and convert string dates back to Date objects
        const loadedVehicles = (await loadVehicles()).map(vehicle => ({
          ...vehicle,
          entryTime: new Date(vehicle.entryTime),
          exitTime: vehicle.exitTime ? new Date(vehicle.exitTime) : undefined,
          paymentDate: vehicle.paymentDate ? new Date(vehicle.paymentDate) : undefined
        }));
        setVehicles(loadedVehicles);
        
        const loadedClients = (await loadPermanentClients()).map(client => ({
          ...client,
          entryTime: new Date(client.entryTime),
          exitTime: client.exitTime ? new Date(client.exitTime) : undefined,
          paymentDate: client.paymentDate ? new Date(client.paymentDate) : undefined
        }));
        setPermanentClients(loadedClients);
        
        // Load settings from API
        const loadedSettings = await loadSettings();
        setSettings(loadedSettings);

        // After settings are loaded, auto-auth if credentials unchanged
        try {
          const storedAuth = localStorage.getItem('auth_logged_in') === 'true';
          const storedSig = localStorage.getItem('auth_cred_sig') || '';
          const currentSig = `${loadedSettings.credentials.username}|${loadedSettings.credentials.password}`;
          // Update stored signature to current backend settings
          localStorage.setItem('auth_cred_sig', currentSig);
          if (storedAuth && storedSig === currentSig) {
            setIsAuthenticated(true);
          } else {
            setIsAuthenticated(false);
            localStorage.setItem('auth_logged_in', 'false');
          }
        } catch {}
        
        // Rebuild all daily stats from loaded vehicles instead of just loading from storage
        if (loadedVehicles.length > 0) {
          rebuildAllDailyStats(loadedVehicles);
        } else {
          const stats = await loadDailyStats();
          setDailyStats(stats);
        }
      } catch (error) {
        console.error('Failed to load data:', error);
      }
    };
    
    loadData();
    
    // Reset daily stats at midnight
    const checkMidnight = setInterval(() => {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        updateDailyStats();
      }
    }, 60000); // Check every minute

    return () => clearInterval(checkMidnight);
  }, []);

  // Global Auto Restore poll (works even when not on Admin Settings page)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        if (localStorage.getItem('autoRestore') !== 'true') return;
        // Fetch live data directly from API
        const freshVehicles = await apiService.getVehicles();
        const freshClients = await apiService.getPermanentClients();
        const freshSettings = await apiService.getSettings();
        const freshStats = await apiService.getDailyStats();

        const sigVehicles = (arr: any[]) => JSON.stringify(
          arr.map((v: any) => ({ id: v.id, exit: !!v.exitTime })).sort((a: any, b: any) => a.id.localeCompare(b.id))
        );
        const sigClients = (arr: any[]) => JSON.stringify(arr.map((c: any) => c.id).sort());
        const sigSettings = (s: any) => JSON.stringify({
          username: s?.credentials?.username,
          password: s?.credentials?.password,
          siteName: s?.siteName,
          viewMode: s?.viewMode,
        });

        const currentVehicles = JSON.parse(localStorage.getItem('parking_vehicles') || '[]') as any[];
        const currentClients = JSON.parse(localStorage.getItem('parking_permanent_clients') || '[]') as any[];
        const currentSettings = JSON.parse(localStorage.getItem('parking_settings') || '{}') as any;

        const changed = (
          sigVehicles(freshVehicles) !== sigVehicles(currentVehicles) ||
          sigClients(freshClients) !== sigClients(currentClients) ||
          sigSettings(freshSettings) !== sigSettings(currentSettings)
        );

        // Always replace local data with server data when Auto Restore is enabled
        localStorage.setItem('parking_vehicles', JSON.stringify(freshVehicles));
        localStorage.setItem('parking_permanent_clients', JSON.stringify(freshClients));
        localStorage.setItem('parking_settings', JSON.stringify(freshSettings));
        localStorage.setItem('parking_daily_stats', JSON.stringify(freshStats));
        
        // Only reload if there was actually a change to avoid unnecessary reloads
        if (changed) {
          window.location.reload();
        }
      } catch {}
    }, 60 * 1000);

    return () => clearInterval(interval);
  }, []);


  const login = (username: string, password: string): boolean => {
    if (username === settings.credentials.username && password === settings.credentials.password) {
      setIsAuthenticated(true);
      try {
        const sig = `${settings.credentials.username}|${settings.credentials.password}`;
        localStorage.setItem('auth_logged_in', 'true');
        localStorage.setItem('auth_cred_sig', sig);
      } catch {}
      return true;
    }
    return false;
  };

  const logout = () => {
    setIsAuthenticated(false);
    try {
      localStorage.setItem('auth_logged_in', 'false');
    } catch {}
  };

  const addVehicle = async (vehicle: Omit<Vehicle, 'id'>): Promise<string> => {
    const newVehicle: Vehicle = {
      ...vehicle,
      id: Date.now().toString()
    };
    
    // Save to API first
    try {
      await apiService.addVehicle(newVehicle);
    } catch (error) {
      console.error('Failed to save vehicle to API:', error);
    }
    
    const updatedVehicles = [...vehicles, newVehicle];
    setVehicles(updatedVehicles);
    saveVehicles(updatedVehicles);
    updateDailyStats(updatedVehicles);
    
    return newVehicle.id;
  };

  const exitVehicle = async (vehicleId: string) => {
    const exitTime = new Date();
    const vehicle = vehicles.find(v => v.id === vehicleId && !v.exitTime);
    
    if (vehicle) {
      const fee = calculateParkingFee(vehicle.entryTime, exitTime, vehicle.type, settings.pricing);
      
      // Save to API first
      try {
        await apiService.exitVehicle(vehicleId, fee);
      } catch (error) {
        console.error('Failed to exit vehicle via API (will retry once):', error);
        // Minimal retry after short delay
        try {
          await new Promise(res => setTimeout(res, 2000));
          await apiService.exitVehicle(vehicleId, fee);
        } catch (err2) {
          console.error('Retry failed to exit vehicle via API:', err2);
        }
      }
    }
    
    const updatedVehicles = vehicles.map(vehicle => {
      if (vehicle.id === vehicleId && !vehicle.exitTime) {
        const fee = calculateParkingFee(vehicle.entryTime, exitTime, vehicle.type, settings.pricing);
        return { ...vehicle, exitTime, fee };
      }
      return vehicle;
    });
    
    setVehicles(updatedVehicles);
    saveVehicles(updatedVehicles);
    updateDailyStats(updatedVehicles);
  };

  const addPermanentClient = (client: Omit<Vehicle, 'id'>) => {
    const newClient: Vehicle = {
      ...client,
      id: Date.now().toString(),
      isPermanent: true,
      paymentStatus: 'unpaid'
    };
    
    const updatedClients = [...permanentClients, newClient];
    // Attempt to persist to API (non-blocking to avoid UI lag)
    apiService.addPermanentClient(newClient).catch((err) => {
      console.error('Failed to add permanent client to API:', err);
    });
    setPermanentClients(updatedClients);
    savePermanentClients(updatedClients);
  };

  const updatePermanentClient = (clientId: string, updates: Partial<Vehicle>) => {
    const updatedClients = permanentClients.map(client =>
      client.id === clientId ? { ...client, ...updates } : client
    );
    
    // Attempt to persist to API (non-blocking)
    apiService.updatePermanentClient(clientId, updates).catch((err) => {
      console.error('Failed to update permanent client on API:', err);
    });
    setPermanentClients(updatedClients);
    savePermanentClients(updatedClients);
  };

  const removePermanentClient = (clientId: string) => {
    const updatedClients = permanentClients.filter(client => client.id !== clientId);
    // Attempt to persist to API (non-blocking)
    apiService.removePermanentClient(clientId).catch((err) => {
      console.error('Failed to remove permanent client on API:', err);
    });
    setPermanentClients(updatedClients);
    savePermanentClients(updatedClients);
  };

  const updateSettings = (newSettings: Settings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  const getCurrentlyParked = (): Vehicle[] => {
    return vehicles.filter(vehicle => !vehicle.exitTime);
  };

  const rebuildAllDailyStats = (vehiclesToUse: Vehicle[]) => {
    // Get all unique dates from vehicle entries and exits
    const allDates = new Set<string>();
    vehiclesToUse.forEach(v => {
      allDates.add(v.entryTime.toDateString());
      if (v.exitTime) {
        allDates.add(v.exitTime.toDateString());
      }
    });

    const rebuiltStats: DailyStats[] = Array.from(allDates).map(dateString => {
      // Get all vehicles that entered on this date (for counts)
      const enteredVehicles = vehiclesToUse.filter(v => 
        v.entryTime.toDateString() === dateString
      );
      
      // Get all vehicles that exited on this date (for income)
      const exitedVehicles = vehiclesToUse.filter(v => 
        v.exitTime && v.exitTime.toDateString() === dateString
      );

      return {
        date: dateString,
        totalCars: enteredVehicles.filter(v => v.type === 'car').length,
        totalBikes: enteredVehicles.filter(v => v.type === 'bike').length,
        totalRickshaws: enteredVehicles.filter(v => v.type === 'rickshaw').length,
        totalVehicles: enteredVehicles.length,
        // Income from vehicles that exited on this date
        totalIncome: exitedVehicles.reduce((sum, v) => sum + (v.fee || 0), 0),
        // Show vehicles that entered on this date
        vehicles: enteredVehicles
      };
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // Sort newest first

    setDailyStats(rebuiltStats);
    saveDailyStats(rebuiltStats);
  };

  const updateDailyStats = (updatedVehicleList?: Vehicle[]) => {
    const vehiclesToUse = updatedVehicleList || vehicles;
    rebuildAllDailyStats(vehiclesToUse);
  };

  const getTodayStats = (): DailyStats => {
    const today = getTodayString();
    return dailyStats.find(s => s.date === today) || {
      date: today,
      totalCars: 0,
      totalBikes: 0,
      totalRickshaws: 0,
      totalVehicles: 0,
      totalIncome: 0,
      vehicles: []
    };
  };

  return (
    <ParkingContext.Provider value={{
      vehicles,
      permanentClients,
      settings,
      dailyStats,
      isAuthenticated,
      login,
      logout,
      addVehicle,
      exitVehicle,
      addPermanentClient,
      updatePermanentClient,
      removePermanentClient,
      updateSettings,
      getCurrentlyParked,
      getTodayStats
    }}>
      {children}
    </ParkingContext.Provider>
  );
};