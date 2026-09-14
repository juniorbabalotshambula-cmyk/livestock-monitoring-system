const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 5000;
const LITERATURE_TEMP_THRESHOLD = 39.5;
const MIN_READINGS_FOR_ADAPTIVE = 5;
const MIN_READINGS_FOR_GEOFENCE = 10;

app.get('/', (req, res) => {
  res.json({ message: 'Livestock monitoring backend is running!' });
});

// ---------- Helper: adaptive temperature threshold per animal ----------
async function getTemperatureThreshold(animalId) {
  const priorReadings = await prisma.healthReading.findMany({
    where: { animalId },
    orderBy: { recordedAt: 'asc' },
  });

  if (priorReadings.length >= MIN_READINGS_FOR_ADAPTIVE) {
    const temps = priorReadings.map((r) => r.temperatureC);
    const mean = temps.reduce((a, b) => a + b, 0) / temps.length;
    const variance =
      temps.reduce((a, b) => a + (b - mean) ** 2, 0) / temps.length;
    const std = Math.sqrt(variance);
    return {
      threshold: mean + 2 * std,
      method: 'adaptive',
      basedOnReadings: priorReadings.length,
    };
  }

  return {
    threshold: LITERATURE_TEMP_THRESHOLD,
    method: 'literature',
    basedOnReadings: priorReadings.length,
  };
}

// ---------- Helper: geo-fence bounds per animal ----------
async function getGeofenceBounds(animalId) {
  const priorReadings = await prisma.gpsReading.findMany({
    where: { animalId },
  });

  if (priorReadings.length >= MIN_READINGS_FOR_GEOFENCE) {
    const lats = priorReadings.map((r) => r.latitude).sort((a, b) => a - b);
    const lons = priorReadings.map((r) => r.longitude).sort((a, b) => a - b);
    const percentile = (arr, p) => arr[Math.floor(p * (arr.length - 1))];

    return {
      established: true,
      latLow: percentile(lats, 0.05),
      latHigh: percentile(lats, 0.95),
      lonLow: percentile(lons, 0.05),
      lonHigh: percentile(lons, 0.95),
      basedOnReadings: priorReadings.length,
    };
  }

  return { established: false, basedOnReadings: priorReadings.length };
}

// ================= ANIMALS =================
app.get('/animals', async (req, res) => {
  const animals = await prisma.animal.findMany();
  res.json(animals);
});

app.post('/animals', async (req, res) => {
  const { tagNumber, species, breed, status } = req.body;
  try {
    const animal = await prisma.animal.create({
      data: { tagNumber, species, breed, status: status || 'healthy' },
    });
    res.status(201).json(animal);
  } catch (err) {
    res.status(400).json({ message: 'Tag number may already be in use.' });
  }
});

// ================= GPS READINGS =================
app.get('/gps-readings', async (req, res) => {
  const readings = await prisma.gpsReading.findMany({
    orderBy: { recordedAt: 'desc' },
  });
  res.json(readings);
});

app.post('/gps-readings', async (req, res) => {
  const { animalId, latitude, longitude } = req.body;
  const bounds = await getGeofenceBounds(Number(animalId));

  let outsideFence = false;
  if (bounds.established) {
    outsideFence =
      latitude < bounds.latLow ||
      latitude > bounds.latHigh ||
      longitude < bounds.lonLow ||
      longitude > bounds.lonHigh;
  }

  const reading = await prisma.gpsReading.create({
    data: {
      animalId: Number(animalId),
      latitude: Number(latitude),
      longitude: Number(longitude),
      outsideFence,
    },
  });

  res.status(201).json({
    ...reading,
    geofenceStatus: bounds.established
      ? `Checked against this animal's own geo-fence (built from ${bounds.basedOnReadings} prior readings).`
      : `Geo-fence not yet established (needs ${MIN_READINGS_FOR_GEOFENCE} readings, has ${bounds.basedOnReadings}). Marked inside fence by default.`,
  });
});

// ================= HEALTH READINGS =================
app.get('/health-readings', async (req, res) => {
  const readings = await prisma.healthReading.findMany({
    orderBy: { recordedAt: 'desc' },
  });
  res.json(readings);
});

app.post('/health-readings', async (req, res) => {
  const { animalId, temperatureC } = req.body;
  const { threshold, method, basedOnReadings } = await getTemperatureThreshold(
    Number(animalId)
  );

  const alertFlag = Number(temperatureC) > threshold;

  const reading = await prisma.healthReading.create({
    data: {
      animalId: Number(animalId),
      temperatureC: Number(temperatureC),
      alert: alertFlag,
    },
  });

  res.status(201).json({
    ...reading,
    thresholdUsed: Number(threshold.toFixed(2)),
    thresholdMethod: method,
    basedOnReadings,
  });
});
// ================= ALERTS SUMMARY =================
app.get('/alerts', async (req, res) => {
  const animals = await prisma.animal.findMany();

  const alerts = [];

  for (const animal of animals) {
    const latestHealth = await prisma.healthReading.findFirst({
      where: { animalId: animal.id },
      orderBy: { recordedAt: 'desc' },
    });

    const latestGps = await prisma.gpsReading.findFirst({
      where: { animalId: animal.id },
      orderBy: { recordedAt: 'desc' },
    });

    if (latestHealth?.alert) {
      alerts.push({
        type: 'health',
        tagNumber: animal.tagNumber,
        detail: `Temperature ${latestHealth.temperatureC}°C flagged as abnormal`,
        recordedAt: latestHealth.recordedAt,
      });
    }

    if (latestGps?.outsideFence) {
      alerts.push({
        type: 'gps',
        tagNumber: animal.tagNumber,
        detail: `Last known position is outside geo-fence`,
        recordedAt: latestGps.recordedAt,
      });
    }
  }

  alerts.sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt));
  res.json(alerts);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});