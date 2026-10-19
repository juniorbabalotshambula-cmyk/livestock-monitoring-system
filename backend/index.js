require('dotenv').config();

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

const THINGSPEAK_CHANNEL_ID = process.env.THINGSPEAK_CHANNEL_ID;
const THINGSPEAK_READ_API_KEY = process.env.THINGSPEAK_READ_API_KEY;
const THINGSPEAK_POLL_INTERVAL_MS = 20000;
const fs = require('fs');
const CURSOR_FILE = './.thingspeak-cursor.json';

function loadCursor() {
  try {
    const data = JSON.parse(fs.readFileSync(CURSOR_FILE, 'utf8'));
    return data.lastProcessedEntryId || 0;
  } catch {
    return 0;
  }
}

function saveCursor(id) {
  fs.writeFileSync(CURSOR_FILE, JSON.stringify({ lastProcessedEntryId: id }));
}

let lastProcessedEntryId = loadCursor();

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

// ---------- Shared creation logic (used by both the API routes and the ThingSpeak poller) ----------
async function createGpsReading(animalId, latitude, longitude) {
  const bounds = await getGeofenceBounds(animalId);

  let outsideFence = false;
  if (bounds.established) {
    outsideFence =
      latitude < bounds.latLow ||
      latitude > bounds.latHigh ||
      longitude < bounds.lonLow ||
      longitude > bounds.lonHigh;
  }

  const reading = await prisma.gpsReading.create({
    data: { animalId, latitude, longitude, outsideFence },
  });

  return {
    reading,
    geofenceStatus: bounds.established
      ? `Checked against this animal's own geo-fence (built from ${bounds.basedOnReadings} prior readings).`
      : `Geo-fence not yet established (needs ${MIN_READINGS_FOR_GEOFENCE} readings, has ${bounds.basedOnReadings}). Marked inside fence by default.`,
  };
}

async function createHealthReading(animalId, temperatureC) {
  const { threshold, method, basedOnReadings } = await getTemperatureThreshold(animalId);
  const alertFlag = temperatureC > threshold;

  const reading = await prisma.healthReading.create({
    data: { animalId, temperatureC, alert: alertFlag },
  });

  return {
    reading,
    thresholdUsed: Number(threshold.toFixed(2)),
    thresholdMethod: method,
    basedOnReadings,
  };
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
  const { reading, geofenceStatus } = await createGpsReading(
    Number(animalId),
    Number(latitude),
    Number(longitude)
  );
  res.status(201).json({ ...reading, geofenceStatus });
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
  const { reading, thresholdUsed, thresholdMethod, basedOnReadings } =
    await createHealthReading(Number(animalId), Number(temperatureC));
  res.status(201).json({ ...reading, thresholdUsed, thresholdMethod, basedOnReadings });
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

// ================= THINGSPEAK IOT POLLER =================
async function pollThingSpeak() {
  if (!THINGSPEAK_CHANNEL_ID || !THINGSPEAK_READ_API_KEY) {
    console.log('ThingSpeak not configured — skipping poll.');
    return;
  }

  try {
    const url = `https://api.thingspeak.com/channels/${THINGSPEAK_CHANNEL_ID}/feeds.json?api_key=${THINGSPEAK_READ_API_KEY}&results=20`;
    const res = await fetch(url);
    const data = await res.json();

    const newEntries = (data.feeds || []).filter(
      (f) => f.entry_id > lastProcessedEntryId
    );

    for (const entry of newEntries) {
      const animalId = parseInt(entry.field1, 10);
      const latitude = parseFloat(entry.field2);
      const longitude = parseFloat(entry.field3);
      const temperatureC = parseFloat(entry.field4);

      if (!animalId || isNaN(latitude) || isNaN(longitude) || isNaN(temperatureC)) {
        continue; // skip incomplete entries
      }

      const animalExists = await prisma.animal.findUnique({ where: { id: animalId } });
      if (!animalExists) {
        console.log(`ThingSpeak entry #${entry.entry_id}: unknown animalId ${animalId}, skipped.`);
        continue;
      }

      const gpsResult = await createGpsReading(animalId, latitude, longitude);
      const healthResult = await createHealthReading(animalId, temperatureC);

      console.log(
        `[ThingSpeak] entry #${entry.entry_id} -> animal ${animalId}: ` +
        `GPS ${gpsResult.reading.outsideFence ? 'OUTSIDE FENCE' : 'ok'}, ` +
        `temp ${temperatureC}°C ${healthResult.reading.alert ? 'ALERT' : 'ok'} ` +
        `(${healthResult.thresholdMethod} threshold ${healthResult.thresholdUsed}°C)`
      );

            lastProcessedEntryId = entry.entry_id;
      saveCursor(lastProcessedEntryId);
    }
  } catch (err) {
    console.error('ThingSpeak poll failed:', err.message);
  }
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  if (THINGSPEAK_CHANNEL_ID && THINGSPEAK_READ_API_KEY) {
    console.log(`Polling ThingSpeak channel ${THINGSPEAK_CHANNEL_ID} every ${THINGSPEAK_POLL_INTERVAL_MS / 1000}s...`);
    setInterval(pollThingSpeak, THINGSPEAK_POLL_INTERVAL_MS);
    pollThingSpeak(); // run once immediately on startup
  }
});