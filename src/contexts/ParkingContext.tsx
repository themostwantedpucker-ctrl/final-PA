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
import { calculateParkingFee, getTodayString } from '@/utils/calculations';

interface ParkingContextType {
  vehicles: Vehicle[];
  permanentClients: Vehicle[];
  settings: Settings;
  dailyStats: DailyStats[];
  isAuthenticated: boolean;
  login: (username: string, password: string) => boolean;
  logout: () => void;
  addVehicle: (vehicle: Omit<Vehicle, 'id'>) => string;
  exitVehicle: (vehicleId: string) => void;
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

  const login = (username: string, password: string): boolean => {
    if (username === settings.credentials.username && password === settings.credentials.password) {
      setIsAuthenticated(true);
      return true;
    }
    return false;
  };

  const logout = () => {
    setIsAuthenticated(false);
  };

  const addVehicle = (vehicle: Omit<Vehicle, 'id'>): string => {
    const newVehicle: Vehicle = {
      ...vehicle,
      id: Date.now().toString()
    };
    
    const updatedVehicles = [...vehicles, newVehicle];
    setVehicles(updatedVehicles);
    saveVehicles(updatedVehicles);
    updateDailyStats(updatedVehicles);
    
    return newVehicle.id;
  };

  const exitVehicle = (vehicleId: string) => {
    const exitTime = new Date();
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
    setPermanentClients(updatedClients);
    savePermanentClients(updatedClients);
  };

  const updatePermanentClient = (clientId: string, updates: Partial<Vehicle>) => {
    const updatedClients = permanentClients.map(client =>
      client.id === clientId ? { ...client, ...updates } : client
    );
    
    setPermanentClients(updatedClients);
    savePermanentClients(updatedClients);
  };

  const removePermanentClient = (clientId: string) => {
    const updatedClients = permanentClients.filter(client => client.id !== clientId);
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