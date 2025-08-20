import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useParkingContext } from '@/contexts/ParkingContext';
import { useToast } from '@/hooks/use-toast';
import { loadVehicles, loadPermanentClients, loadSettings, loadDailyStats } from '@/utils/storage';
import { Settings, DollarSign, User } from 'lucide-react';

const AdminSettings: React.FC = () => {
  const { settings, updateSettings } = useParkingContext();
  const { toast } = useToast();
  
  const [siteName, setSiteName] = useState(settings.siteName);
  const [pricing, setPricing] = useState(settings.pricing);
  const [credentials, setCredentials] = useState(settings.credentials);
  const [viewMode, setViewMode] = useState(settings.viewMode);

  const handleSave = () => {
    updateSettings({
      siteName,
      pricing,
      credentials,
      viewMode
    });
    
    toast({
      title: "Settings saved",
      description: "Your changes have been saved successfully",
    });
  };

  // Double confirmation for enabling Active Operator (disables passive polling behavior on this device)
  const handleToggleActiveOperator = async () => {
    if (!activeOperator) {
      if (!window.confirm('Mark this device as Active Operator? Passive devices will mirror this device automatically.')) return;
      const input = window.prompt('Type ACTIVE to confirm setting this device as Active Operator:');
      if (input !== 'ACTIVE') {
        toast({ title: 'Active Operator not enabled', description: 'Confirmation failed.', variant: 'destructive' });
        return;
      }
      setActiveOperator(true);
      localStorage.setItem('activeOperator', 'true');
      toast({ title: 'Active Operator enabled', description: 'This device will not perform passive polling.' });
    } else {
      setActiveOperator(false);
      localStorage.setItem('activeOperator', 'false');
      toast({ title: 'Active Operator disabled' });
    }
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="pricing" className="w-full">
        <TabsList>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="view">View Settings</TabsTrigger>
          <TabsTrigger value="login">Login Settings</TabsTrigger>
        </TabsList>
        
        <TabsContent value="pricing">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <DollarSign className="h-5 w-5 mr-2" />
                Dynamic Pricing Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {Object.entries(pricing).map(([vehicleType, rates]) => (
                <div key={vehicleType} className="space-y-3">
                  <h3 className="font-semibold capitalize">{vehicleType} Pricing</h3>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <Label>Base Hours</Label>
                      <Input
                        type="number"
                        value={rates.baseHours}
                        onChange={(e) => setPricing({
                          ...pricing,
                          [vehicleType]: { ...rates, baseHours: parseInt(e.target.value) || 0 }
                        })}
                      />
                    </div>
                    <div>
                      <Label>Base Fee (PKR)</Label>
                      <Input
                        type="number"
                        value={rates.baseFee}
                        onChange={(e) => setPricing({
                          ...pricing,
                          [vehicleType]: { ...rates, baseFee: parseInt(e.target.value) || 0 }
                        })}
                      />
                    </div>
                    <div>
                      <Label>Extra Hour Fee (PKR)</Label>
                      <Input
                        type="number"
                        value={rates.extraHourFee}
                        onChange={(e) => setPricing({
                          ...pricing,
                          [vehicleType]: { ...rates, extraHourFee: parseInt(e.target.value) || 0 }
                        })}
                      />
                    </div>
                  </div>
                </div>
              ))}
              <Button onClick={handleSave} className="w-full">Save Pricing</Button>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="view">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Settings className="h-5 w-5 mr-2" />
                View Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Site Name</Label>
                <Input
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  placeholder="Smart Parking System"
                />
              </div>
              <div>
                <Label>Default View Mode</Label>
                <Select value={viewMode} onValueChange={(value: 'grid' | 'list') => setViewMode(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="list">List View</SelectItem>
                    <SelectItem value="grid">Grid View</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleSave} className="w-full">Save Settings</Button>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="login">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <User className="h-5 w-5 mr-2" />
                Login Credentials
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Username</Label>
                <Input
                  value={credentials.username}
                  onChange={(e) => setCredentials({
                    ...credentials,
                    username: e.target.value
                  })}
                />
              </div>
              <div>
                <Label>Password</Label>
                <Input
                  type="password"
                  value={credentials.password}
                  onChange={(e) => setCredentials({
                    ...credentials,
                    password: e.target.value
                  })}
                />
              </div>
              <Button onClick={handleSave} className="w-full">Update Credentials</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <div className="flex flex-col gap-2 mt-8">
        {/* Auto Sync/Restore toggles */}
        <AutoSyncRestoreToggles />
        {/* Manual sync/restore buttons */}
        <Button
          variant="outline"
          onClick={async () => {
            try {
              // Gather all data from localStorage
              const vehicles = JSON.parse(localStorage.getItem('parking_vehicles') || '[]');
              const permanentClients = JSON.parse(localStorage.getItem('parking_permanent_clients') || '[]');
              const settings = JSON.parse(localStorage.getItem('parking_settings') || '{}');
              const dailyStats = JSON.parse(localStorage.getItem('parking_daily_stats') || '[]');
              const backup = { vehicles, permanentClients, settings, dailyStats, backupDate: new Date().toISOString() };
              const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://final-pa.onrender.com/api';
              const res = await fetch(`${API_BASE_URL}/backup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(backup)
              });
              if (!res.ok) throw new Error('Backup failed');
              toast({ title: 'Backup Successful', description: 'Data synced to server.' });
            } catch (e) {
              toast({ title: 'Backup Failed', description: (e as Error).message, variant: 'destructive' });
            }
          }}
        >Sync (Backup) Data to Server</Button>
        <Button
          variant="outline"
          onClick={async () => {
            try {
              // Load fresh data from API instead of backup endpoint
              const freshVehicles = await loadVehicles();
              const freshClients = await loadPermanentClients();
              const freshSettings = await loadSettings();
              const freshStats = await loadDailyStats();
              
              // Update localStorage with fresh API data
              localStorage.setItem('parking_vehicles', JSON.stringify(freshVehicles));
              localStorage.setItem('parking_permanent_clients', JSON.stringify(freshClients));
              localStorage.setItem('parking_settings', JSON.stringify(freshSettings));
              localStorage.setItem('parking_daily_stats', JSON.stringify(freshStats));
              
              toast({ title: 'Restore Successful', description: 'Latest data loaded from server.' });
              window.location.reload();
            } catch (e) {
              toast({ title: 'Restore Failed', description: (e as Error).message, variant: 'destructive' });
            }
          }}
        >Restore Data from Server</Button>
      </div>
      <p className="text-sm text-muted-foreground mt-2">
        Hint: Other devices may need to refresh the page or use "Restore Data from Server" to see the latest changes.
      </p>
    </div>
  );
};

// --- Auto Sync/Restore Toggles ---
import { useEffect, useRef } from 'react';

const AutoSyncRestoreToggles: React.FC = () => {
  const { toast } = useToast();
  const [autoSync, setAutoSync] = useState(() => localStorage.getItem('autoSync') === 'true');
  const [autoRestore, setAutoRestore] = useState(() => localStorage.getItem('autoRestore') === 'true');
  const [activeOperator, setActiveOperator] = useState(() => localStorage.getItem('activeOperator') === 'true');
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const restoreIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Double confirmation for enabling auto sync
  const handleToggleSync = async () => {
    if (!autoSync) {
      if (!window.confirm('Auto Sync will periodically overwrite the server backup with your current data. Are you sure you want to enable it?')) return;
      const input = window.prompt('Type SYNC to confirm enabling Auto Sync:');
      if (input !== 'SYNC') {
        toast({ title: 'Auto Sync not enabled', description: 'Confirmation failed.', variant: 'destructive' });
        return;
      }
      setAutoSync(true);
      localStorage.setItem('autoSync', 'true');
      toast({ title: 'Auto Sync enabled', description: 'Your data will now be backed up every 2 minutes.' });
    } else {
      setAutoSync(false);
      localStorage.setItem('autoSync', 'false');
      toast({ title: 'Auto Sync disabled' });
    }
  };

  // Double confirmation for enabling auto restore
  const handleToggleRestore = async () => {
    if (!autoRestore) {
      if (!window.confirm('Auto Restore will periodically overwrite your local data with the latest server backup. Are you sure you want to enable it?')) return;
      const input = window.prompt('Type RESTORE to confirm enabling Auto Restore:');
      if (input !== 'RESTORE') {
        toast({ title: 'Auto Restore not enabled', description: 'Confirmation failed.', variant: 'destructive' });
        return;
      }
      setAutoRestore(true);
      localStorage.setItem('autoRestore', 'true');
      toast({ title: 'Auto Restore enabled', description: 'Your data will now be restored every 2 minutes.' });
    } else {
      setAutoRestore(false);
      localStorage.setItem('autoRestore', 'false');
      toast({ title: 'Auto Restore disabled' });
    }
  };

  // Auto Sync effect
  useEffect(() => {
    if (autoSync) {
      syncIntervalRef.current = setInterval(async () => {
        try {
          // Build backup from fresh API data (same sources as manual/auto restore)
          const vehicles = await loadVehicles();
          const permanentClients = await loadPermanentClients();
          const settings = await loadSettings();
          const dailyStats = await loadDailyStats();
          const backup = { vehicles, permanentClients, settings, dailyStats, backupDate: new Date().toISOString() };
          const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://final-pa.onrender.com/api';
          await fetch(`${API_BASE_URL}/backup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(backup)
          });
        } catch {}
      }, 2 * 60 * 1000); // 2 minutes
    } else if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
    }
    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [autoSync]);

  // Auto Restore effect
  useEffect(() => {
    if (autoRestore) {
      restoreIntervalRef.current = setInterval(async () => {
        try {
          // Load fresh data from API (same as manual restore)
          const freshVehicles = await loadVehicles();
          const freshClients = await loadPermanentClients();
          const freshSettings = await loadSettings();
          const freshStats = await loadDailyStats();

          localStorage.setItem('parking_vehicles', JSON.stringify(freshVehicles));
          localStorage.setItem('parking_permanent_clients', JSON.stringify(freshClients));
          localStorage.setItem('parking_settings', JSON.stringify(freshSettings));
          localStorage.setItem('parking_daily_stats', JSON.stringify(freshStats));
          window.location.reload();
        } catch {}
      }, 2 * 60 * 1000); // 2 minutes
    } else if (restoreIntervalRef.current) {
      clearInterval(restoreIntervalRef.current);
    }
    return () => {
      if (restoreIntervalRef.current) clearInterval(restoreIntervalRef.current);
    };
  }, [autoRestore]);

  return (
    <div className="flex flex-col gap-2 mb-2">
      <div className="flex items-center gap-2">
        <Label className="font-semibold">Auto Sync (Backup)</Label>
        <Button variant={autoSync ? 'destructive' : 'outline'} onClick={handleToggleSync}>
          {autoSync ? 'Disable' : 'Enable'}
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Label className="font-semibold">Auto Restore</Label>
        <Button variant={autoRestore ? 'destructive' : 'outline'} onClick={handleToggleRestore}>
          {autoRestore ? 'Disable' : 'Enable'}
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Label className="font-semibold">Active Operator (this device)</Label>
        <Button variant={activeOperator ? 'destructive' : 'outline'} onClick={handleToggleActiveOperator}>
          {activeOperator ? 'Disable' : 'Enable'}
        </Button>
      </div>
    </div>
  );
};

export default AdminSettings;