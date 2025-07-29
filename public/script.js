// Chart configuration
const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { 
      display: true,
      position: 'top',
      labels: {
        color: '#333',
        font: {
          weight: 'bold'
        }
      }
    },
    tooltip: { 
      mode: 'index', 
      intersect: false,
      callbacks: {
        label: function(context) {
          return `${context.dataset.label}: ${context.parsed.y}`;
        }
      }
    }
  },
  scales: {
    x: { 
      grid: { display: true },
      ticks: { 
        color: '#666',
        maxRotation: 45,
        minRotation: 45
      }
    },
    y: { 
      beginAtZero: false,
      grid: { color: 'rgba(0,0,0,0.05)' },
      ticks: { color: '#666' }
    }
  },
  elements: {
    line: { tension: 0.1 }
  }
};

// Initialize charts with color-coded datasets
const tempChart = new Chart(
  document.getElementById('tempChart').getContext('2d'),
  { 
    type: 'line', 
    data: { 
      labels: [], 
      datasets: [{
        label: 'Temperature (°C)',
        data: [],
        borderColor: '#e74c3c',
        backgroundColor: 'rgba(231, 76, 60, 0.1)',
        borderWidth: 2,
        fill: true
      }]
    }, 
    options: chartOptions 
  }
);

const humidityChart = new Chart(
  document.getElementById('humidityChart').getContext('2d'),
  { 
    type: 'line', 
    data: { 
      labels: [], 
      datasets: [{
        label: 'Humidity (%)',
        data: [],
        borderColor: '#3498db',
        backgroundColor: 'rgba(52, 152, 219, 0.1)',
        borderWidth: 2,
        fill: true
      }]
    }, 
    options: chartOptions 
  }
);

const moistureChart = new Chart(
  document.getElementById('moistureChart').getContext('2d'),
  { 
    type: 'line', 
    data: { 
      labels: [], 
      datasets: [{
        label: 'Soil Moisture (units)',
        data: [],
        borderColor: '#2ecc71',
        backgroundColor: 'rgba(46, 204, 113, 0.1)',
        borderWidth: 2,
        fill: true
      }]
    }, 
    options: chartOptions 
  }
);

const mq135Chart = new Chart(
  document.getElementById('mq135Chart').getContext('2d'),
  { 
    type: 'line', 
    data: { 
      labels: [], 
      datasets: [{
        label: 'Air Quality (ppm)',
        data: [],
        borderColor: '#9b59b6',
        backgroundColor: 'rgba(155, 89, 182, 0.1)',
        borderWidth: 2,
        fill: true
      }]
    }, 
    options: chartOptions 
  }
);

// Initialize map
let map = L.map('map').setView([0, 0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);
let marker = L.marker([0, 0]).addTo(map).bindPopup('Waiting for location...');

// Socket.IO connection
const socket = io({
  reconnection: true,
  reconnectionAttempts: Infinity
});

socket.on('connect', () => {
  document.getElementById('connectionStatus').textContent = 'Status: Connected';
});

socket.on('disconnect', () => {
  document.getElementById('connectionStatus').textContent = 'Status: Disconnected - Reconnecting...';
});

socket.on('sensorData', (data) => {
  // Update current values
  document.getElementById('temperature').textContent = data.temperature.toFixed(1);
  document.getElementById('humidity').textContent = data.humidity.toFixed(1);
  document.getElementById('moisture').textContent = data.moisture;
  document.getElementById('mq135').textContent = data.mq135;
  document.getElementById('rssiValue').textContent = data.rssi;
  document.getElementById('snrValue').textContent = data.snr.toFixed(1);
  document.getElementById('locationText').textContent = 
    `Latitude: ${data.latitude.toFixed(4)}, Longitude: ${data.longitude.toFixed(4)}`;
  document.getElementById('lastUpdate').textContent = `Last update: ${data.timestamp}`;

  // Update charts
  updateChart(tempChart, data.history.timestamps, data.history.temperature);
  updateChart(humidityChart, data.history.timestamps, data.history.humidity);
  updateChart(moistureChart, data.history.timestamps, data.history.moisture);
  updateChart(mq135Chart, data.history.timestamps, data.history.mq135);

  // Update map
  if (data.latitude && data.longitude) {
    const position = [data.latitude, data.longitude];
    marker.setLatLng(position);
    map.setView(position, 15);
    marker.bindPopup(`
      <b>Device Location</b><br>
      Lat: ${data.latitude.toFixed(4)}<br>
      Lon: ${data.longitude.toFixed(4)}<br>
      Temp: ${data.temperature.toFixed(1)}°C<br>
      Humidity: ${data.humidity.toFixed(1)}%
    `).openPopup();
  }
});

function updateChart(chart, labels, data) {
  const minLength = Math.min(labels.length, data.length);
  chart.data.labels = labels.slice(-minLength);
  chart.data.datasets[0].data = data.slice(-minLength);
  chart.update();
}

// Load initial data
fetch('/api/data')
  .then(response => response.json())
  .then(data => {
    if (data.timestamps.length > 0) {
      updateChart(tempChart, data.timestamps, data.temperature);
      updateChart(humidityChart, data.timestamps, data.humidity);
      updateChart(moistureChart, data.timestamps, data.moisture);
      updateChart(mq135Chart, data.timestamps, data.mq135);
      
      const lastIdx = data.latitude.length - 1;
      if (data.latitude[lastIdx] && data.longitude[lastIdx]) {
        const position = [data.latitude[lastIdx], data.longitude[lastIdx]];
        marker.setLatLng(position);
        map.setView(position, 15);
      }
    }
  })
  .catch(error => console.error('Error fetching initial data:', error));