require('dotenv').config();

const WRITE_KEY = process.env.THINGSPEAK_WRITE_API_KEY;
const BASE_LAT = -32.7500;
const BASE_LON = 26.8333;

// Two simulated "collars" — one per registered animal
const animals = [
  { animalId: 1, tag: 'A001', lat: BASE_LAT, lon: BASE_LON, temp: 38.4 },
  { animalId: 2, tag: 'A002', lat: BASE_LAT + 0.01, lon: BASE_LON - 0.01, temp: 38.6 },
];

let tick = 0;

async function sendReading(animal) {
  // Small random walk for GPS, to simulate grazing movement
  animal.lat += (Math.random() - 0.5) * 0.001;
  animal.lon += (Math.random() - 0.5) * 0.001;

  // Normally small temperature drift; every 10th tick, simulate a fever spike
  const isSpike = tick > 0 && tick % 10 === 0 && animal.animalId === 1;
  animal.temp = isSpike
    ? 40.2 + Math.random() * 0.4
    : 38.2 + Math.random() * 0.6;

  const url = `https://api.thingspeak.com/update?api_key=${WRITE_KEY}` +
    `&field1=${animal.animalId}` +
    `&field2=${animal.lat.toFixed(6)}` +
    `&field3=${animal.lon.toFixed(6)}` +
    `&field4=${animal.temp.toFixed(2)}`;

  try {
    const res = await fetch(url);
    const entryId = await res.text();
    console.log(
      `[${new Date().toLocaleTimeString()}] Sent ${animal.tag}: ` +
      `lat=${animal.lat.toFixed(5)} lon=${animal.lon.toFixed(5)} ` +
      `temp=${animal.temp.toFixed(2)}°C${isSpike ? ' (SPIKE)' : ''} ` +
      `-> ThingSpeak entry #${entryId}`
    );
  } catch (err) {
    console.error('Failed to send to ThingSpeak:', err.message);
  }
}

async function loop() {
  const animal = animals[tick % animals.length];
  await sendReading(animal);
  tick++;
  setTimeout(loop, 16000); // ThingSpeak free tier: minimum 15s between updates
}

console.log('Starting sensor simulator... sending one reading every ~16 seconds.');
console.log('Press Ctrl+C to stop.');
loop();