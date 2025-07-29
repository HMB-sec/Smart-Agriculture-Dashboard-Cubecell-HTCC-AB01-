const express = require('express');
const session = require('express-session');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = require('http').createServer(app);
const io = socketIo(server);

// Session middleware
app.use(session({
  secret: 'smart_agri_secret_123',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Sensor data storage with history for charts
let sensorData = {
  timestamps: [],
  temperature: [],
  humidity: [],
  moisture: [],
  mq135: [],
  latitude: [],
  longitude: [],
  rssi: [],
  snr: [],
  // History for charts (last 50 readings)
  history: {
    timestamps: [],
    temperature: [],
    humidity: [],
    moisture: [],
    mq135: []
  }
};

// Initialize serial port
let port;
let parser;

try {
  port = new SerialPort({ 
    path: 'COM4', 
    baudRate: 115200,
    autoOpen: false
  });

  parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

  // Packet buffer
  let packetBuffer = {
    data: null, rssi: null, snr: null,
    reset: function() { this.data = null; this.rssi = null; this.snr = null; }
  };

  // Serial port handlers
  port.on('error', (err) => console.error('Serial error:', err));
  port.on('open', () => console.log('Serial port opened on COM4'));
  
  port.open((err) => {
    if (err) {
      console.error('Port open error:', err);
    }
  });

  // Process incoming data
  parser.on('data', (line) => {
    try {
      line = line.trim();
      console.log('Serial line:', line);

      if (line.startsWith('=====') || line === '') return;

      if (line.startsWith('Data:')) {
        packetBuffer.data = line.substring(5).trim();
      } else if (line.startsWith('RSSI:')) {
        packetBuffer.rssi = line;
      } else if (line.startsWith('SNR:')) {
        packetBuffer.snr = line;
      }

      if (packetBuffer.data && packetBuffer.rssi && packetBuffer.snr) {
        const fullPacket = `${packetBuffer.data} ${packetBuffer.rssi} ${packetBuffer.snr}`;
        console.log('Complete packet:', fullPacket);

        const getValue = (prefix, nextPrefix) => {
          const start = fullPacket.indexOf(prefix) + prefix.length;
          const end = nextPrefix ? fullPacket.indexOf(nextPrefix, start) : fullPacket.length;
          const value = parseFloat(fullPacket.substring(start, end).trim());
          return isNaN(value) ? null : value;
        };

        const timestamp = new Date().toLocaleTimeString();
        const sensorValues = {
          temperature: getValue('TEMP:', 'HUM:'),
          humidity: getValue('HUM:', 'MOISTURE:'),
          moisture: getValue('MOISTURE:', 'MQ135:'),
          mq135: getValue('MQ135:', 'LAT:'),
          latitude: getValue('LAT:', 'LON:'),
          longitude: getValue('LON:', 'RSSI:'),
          rssi: getValue('RSSI:', 'SNR:'),
          snr: getValue('SNR:', null),
          timestamp: timestamp
        };

        // Validate and store
        if (sensorValues.temperature !== null && sensorValues.latitude !== null) {
          // Store all values with the same timestamp
          sensorData.timestamps.push(timestamp);
          sensorData.temperature.push(sensorValues.temperature);
          sensorData.humidity.push(sensorValues.humidity);
          sensorData.moisture.push(sensorValues.moisture);
          sensorData.mq135.push(sensorValues.mq135);
          sensorData.latitude.push(sensorValues.latitude);
          sensorData.longitude.push(sensorValues.longitude);
          sensorData.rssi.push(sensorValues.rssi);
          sensorData.snr.push(sensorValues.snr);
          
          // Update history for charts (last 50 readings)
          sensorData.history.timestamps = [...sensorData.timestamps].slice(-50);
          sensorData.history.temperature = [...sensorData.temperature].slice(-50);
          sensorData.history.humidity = [...sensorData.humidity].slice(-50);
          sensorData.history.moisture = [...sensorData.moisture].slice(-50);
          sensorData.history.mq135 = [...sensorData.mq135].slice(-50);

          // Keep only the last 50 readings in main arrays
          if (sensorData.timestamps.length > 50) {
            sensorData.timestamps.shift();
            sensorData.temperature.shift();
            sensorData.humidity.shift();
            sensorData.moisture.shift();
            sensorData.mq135.shift();
            sensorData.latitude.shift();
            sensorData.longitude.shift();
            sensorData.rssi.shift();
            sensorData.snr.shift();
          }

          // Emit data to clients with complete history
          io.emit('sensorData', { 
            ...sensorValues, 
            history: {
              timestamps: [...sensorData.history.timestamps],
              temperature: [...sensorData.history.temperature],
              humidity: [...sensorData.history.humidity],
              moisture: [...sensorData.history.moisture],
              mq135: [...sensorData.history.mq135]
            }
          });
          console.log('Processed:', sensorValues);
        }

        packetBuffer.reset();
      }
    } catch (err) {
      console.error('Processing error:', err);
      packetBuffer.reset();
    }
  });
} catch (err) {
  console.error('Serial port initialization error:', err);
}

// Authentication middleware
const requireLogin = (req, res, next) => {
  if (req.session.loggedIn) {
    next();
  } else {
    res.redirect('/');
  }
};

// Routes
app.get('/', (req, res) => {
  if (req.session.loggedIn) {
    res.redirect('/dashboard');
  } else {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'admin123') {
    req.session.loggedIn = true;
    res.redirect('/dashboard');
  } else {
    res.redirect('/?error=1');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

app.get('/dashboard', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// API endpoint to get historical data for charts
app.get('/api/data', (req, res) => {
  if (!req.session.loggedIn) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json({
    timestamps: sensorData.history.timestamps,
    temperature: sensorData.history.temperature,
    humidity: sensorData.history.humidity,
    moisture: sensorData.history.moisture,
    mq135: sensorData.history.mq135,
    latitude: sensorData.latitude,
    longitude: sensorData.longitude
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});