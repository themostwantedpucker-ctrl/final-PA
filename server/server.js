const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Data file paths
const DATA_DIR = path.join(__dirname, 'data');
const VEHICLES_FILE = path.join(DATA_DIR, 'vehicles.json');
const PERMANENT_CLIENTS_FILE = path.join(DATA_DIR, 'permanent-clients.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const DAILY_STATS_FILE = path.join(DATA_DIR, 'daily-stats.json');

// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

// Helper functions for file operations
async function readJsonFile(filePath, defaultValue = []) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      await writeJsonFile(filePath, defaultValue);
      return defaultValue;
    }
    throw error;
  }
}

async function writeJsonFile(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

// Default settings
const defaultSettings = {
  siteName: "Park Master Pro",
  pricing: {
    car: { baseHours: 2, baseFee: 50, extraHourFee: 25 },
    bike: { baseHours: 2, baseFee: 20, extraHourFee: 10 },
    rickshaw: { baseHours: 2, baseFee: 30, extraHourFee: 15 }
  },
  credentials: {
    username: "admin",
    password: "admin123"
  },
  viewMode: "grid"
};

// Routes

// Authentication
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const settings = await readJsonFile(SETTINGS_FILE, defaultSettings);
    
    if (username === settings.credentials.username && password === settings.credentials.password) {
      res.json({ success: true, message: 'Login successful' });
    } else {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Vehicles
app.get('/api/vehicles', async (req, res) => {
  try {
    const vehicles = await readJsonFile(VEHICLES_FILE, []);
    res.json(vehicles);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch vehicles' });
  }
});

app.post('/api/vehicles', async (req, res) => {
  try {
    const vehicles = await readJsonFile(VEHICLES_FILE, []);
    const newVehicle = {
      ...req.body,
      id: Date.now().toString(),
      entryTime: new Date().toISOString()
    };
    vehicles.push(newVehicle);
    await writeJsonFile(VEHICLES_FILE, vehicles);
    res.json(newVehicle);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add vehicle' });
  }
});

app.put('/api/vehicles/:id/exit', async (req, res) => {
  try {
    const vehicles = await readJsonFile(VEHICLES_FILE, []);
    const vehicleIndex = vehicles.findIndex(v => v.id === req.params.id);
    
    if (vehicleIndex === -1) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }
    
    vehicles[vehicleIndex] = {
      ...vehicles[vehicleIndex],
      exitTime: new Date().toISOString(),
      fee: req.body.fee
    };
    
    await writeJsonFile(VEHICLES_FILE, vehicles);
    res.json(vehicles[vehicleIndex]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update vehicle' });
  }
});

// Permanent Clients
app.get('/api/permanent-clients', async (req, res) => {
  try {
    const clients = await readJsonFile(PERMANENT_CLIENTS_FILE, []);
    res.json(clients);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch permanent clients' });
  }
});

app.post('/api/permanent-clients', async (req, res) => {
  try {
    const clients = await readJsonFile(PERMANENT_CLIENTS_FILE, []);
    const newClient = {
      ...req.body,
      id: Date.now().toString(),
      isPermanent: true,
      paymentStatus: 'unpaid',
      entryTime: new Date().toISOString()
    };
    clients.push(newClient);
    await writeJsonFile(PERMANENT_CLIENTS_FILE, clients);
    res.json(newClient);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add permanent client' });
  }
});

app.put('/api/permanent-clients/:id', async (req, res) => {
  try {
    const clients = await readJsonFile(PERMANENT_CLIENTS_FILE, []);
    const clientIndex = clients.findIndex(c => c.id === req.params.id);
    
    if (clientIndex === -1) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    clients[clientIndex] = { ...clients[clientIndex], ...req.body };
    await writeJsonFile(PERMANENT_CLIENTS_FILE, clients);
    res.json(clients[clientIndex]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update permanent client' });
  }
});

app.delete('/api/permanent-clients/:id', async (req, res) => {
  try {
    const clients = await readJsonFile(PERMANENT_CLIENTS_FILE, []);
    const filteredClients = clients.filter(c => c.id !== req.params.id);
    await writeJsonFile(PERMANENT_CLIENTS_FILE, filteredClients);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove permanent client' });
  }
});

// Settings
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await readJsonFile(SETTINGS_FILE, defaultSettings);
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

app.put('/api/settings', async (req, res) => {
  try {
    await writeJsonFile(SETTINGS_FILE, req.body);
    res.json(req.body);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Daily Stats
app.get('/api/daily-stats', async (req, res) => {
  try {
    const stats = await readJsonFile(DAILY_STATS_FILE, []);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch daily stats' });
  }
});

app.post('/api/daily-stats', async (req, res) => {
  try {
    const stats = await readJsonFile(DAILY_STATS_FILE, []);
    const existingIndex = stats.findIndex(s => s.date === req.body.date);
    
    if (existingIndex !== -1) {
      stats[existingIndex] = req.body;
    } else {
      stats.push(req.body);
    }
    
    await writeJsonFile(DAILY_STATS_FILE, stats);
    res.json(req.body);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update daily stats' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Backup endpoint (upload all data)
app.post('/api/backup', async (req, res) => {
  try {
    const backupData = req.body;
    const BACKUP_FILE = path.join(DATA_DIR, 'backup.json');
    await writeJsonFile(BACKUP_FILE, backupData);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save backup' });
  }
});

// Restore endpoint (download all data)
app.get('/api/backup', async (req, res) => {
  try {
    const BACKUP_FILE = path.join(DATA_DIR, 'backup.json');
    const backupData = await readJsonFile(BACKUP_FILE, {});
    res.json(backupData);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load backup' });
  }
});

// Serve static files from frontend build
app.use(express.static(path.join(__dirname, '../dist')));

// For any route not handled by your API, serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist', 'index.html'));
});

// Initialize and start server
async function startServer() {
  try {
    await ensureDataDir();
    app.listen(PORT, () => {
      console.log(`🚀 Park Master Pro Backend Server running on port ${PORT}`);
      console.log(`📊 API endpoints available at http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
