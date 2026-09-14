import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const API_BASE = 'http://localhost:5000';
const DEFAULT_CENTER = [-32.75, 26.8333]; // Raymond Mhlaba, Eastern Cape

function Section({ title, children }) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-semibold text-gray-800 mb-3 border-b pb-1">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-gray-700">
      {label}
      {children}
    </label>
  );
}

const inputClass =
  'border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500';
const buttonClass =
  'bg-green-700 hover:bg-green-800 disabled:bg-gray-400 text-white font-medium rounded-md px-4 py-2 text-sm transition-colors';

export default function App() {
  const [animals, setAnimals] = useState([]);
  const [gpsReadings, setGpsReadings] = useState([]);
  const [healthReadings, setHealthReadings] = useState([]);
  const [alerts, setAlerts] = useState([]);

  const [tagNumber, setTagNumber] = useState('');
  const [species, setSpecies] = useState('');
  const [breed, setBreed] = useState('');
  const [status, setStatus] = useState('healthy');
  const [animalMsg, setAnimalMsg] = useState(null);
  const [animalErr, setAnimalErr] = useState(null);

  const [gpsAnimalId, setGpsAnimalId] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [gpsMsg, setGpsMsg] = useState(null);
  const [gpsErr, setGpsErr] = useState(null);

  const [healthAnimalId, setHealthAnimalId] = useState('');
  const [temperatureC, setTemperatureC] = useState('');
  const [healthMsg, setHealthMsg] = useState(null);
  const [healthErr, setHealthErr] = useState(null);

  const fetchAll = () => {
    fetch(`${API_BASE}/animals`).then((r) => r.json()).then(setAnimals);
    fetch(`${API_BASE}/gps-readings`).then((r) => r.json()).then(setGpsReadings);
    fetch(`${API_BASE}/health-readings`).then((r) => r.json()).then(setHealthReadings);
    fetch(`${API_BASE}/alerts`).then((r) => r.json()).then(setAlerts);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const tagFor = (id) => animals.find((a) => a.id === id)?.tagNumber || `#${id}`;

  const submitAnimal = async (e) => {
    e.preventDefault();
    setAnimalErr(null);
    setAnimalMsg(null);
    if (!tagNumber.trim() || !species.trim()) {
      setAnimalErr('Tag number and species are required.');
      return;
    }
    const res = await fetch(`${API_BASE}/animals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagNumber, species, breed, status }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setAnimalErr(d.message || 'Failed to add animal.');
      return;
    }
    const newAnimal = await res.json();
    setAnimalMsg(`Animal "${newAnimal.tagNumber}" added.`);
    setTagNumber('');
    setSpecies('');
    setBreed('');
    setStatus('healthy');
    fetchAll();
  };

  const submitGps = async (e) => {
    e.preventDefault();
    setGpsErr(null);
    setGpsMsg(null);
    if (!gpsAnimalId || latitude === '' || longitude === '') {
      setGpsErr('Animal, latitude, and longitude are required.');
      return;
    }
    const res = await fetch(`${API_BASE}/gps-readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        animalId: Number(gpsAnimalId),
        latitude: Number(latitude),
        longitude: Number(longitude),
      }),
    });
    if (!res.ok) {
      setGpsErr('Failed to record GPS reading.');
      return;
    }
    const data = await res.json();
    setGpsMsg(
      `Recorded. ${data.outsideFence ? 'Outside geo-fence.' : 'Inside geo-fence.'} ${data.geofenceStatus}`
    );
    setLatitude('');
    setLongitude('');
    fetchAll();
  };

  const submitHealth = async (e) => {
    e.preventDefault();
    setHealthErr(null);
    setHealthMsg(null);
    if (!healthAnimalId || temperatureC === '') {
      setHealthErr('Animal and temperature are required.');
      return;
    }
    const res = await fetch(`${API_BASE}/health-readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        animalId: Number(healthAnimalId),
        temperatureC: Number(temperatureC),
      }),
    });
    if (!res.ok) {
      setHealthErr('Failed to record health reading.');
      return;
    }
    const data = await res.json();
    setHealthMsg(
      `Recorded. ${data.alert ? 'ALERT' : 'Normal'} - threshold used: ${data.thresholdUsed}C (${data.thresholdMethod}, based on ${data.basedOnReadings} prior readings).`
    );
    setTemperatureC('');
    fetchAll();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-green-800 text-white py-5 shadow">
        <h1 className="text-2xl font-bold text-center">
          Livestock Monitoring Dashboard
        </h1>
        <p className="text-center text-green-100 text-sm mt-1">
          Raymond Mhlaba Local Municipality - GPS Tracking and Health Monitoring
        </p>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">

        {/* ================= ALERTS PANEL ================= */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-800 mb-3 border-b pb-1">
            Active Alerts
          </h2>
          {alerts.length === 0 ? (
            <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg p-4 text-sm">
              No active alerts. All animals within normal ranges and geo-fence boundaries.
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.map((a, i) => (
                <div
                  key={i}
                  className="bg-red-50 border border-red-300 text-red-800 rounded-lg p-4 text-sm flex justify-between items-center"
                >
                  <div>
                    <span className="font-semibold">
                      {a.type === 'health' ? 'Health Alert' : 'GPS Alert'} - {a.tagNumber}
                    </span>
                    <p className="text-red-700">{a.detail}</p>
                  </div>
                  <span className="text-xs text-red-500 whitespace-nowrap ml-4">
                    {new Date(a.recordedAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ANIMALS */}
        <Section title="Register New Animal">
          <form onSubmit={submitAnimal} className="grid sm:grid-cols-2 gap-4 bg-white p-5 rounded-lg shadow-sm border max-w-2xl">
            <Field label="Tag Number *">
              <input className={inputClass} value={tagNumber} onChange={(e) => setTagNumber(e.target.value)} placeholder="e.g. A002" />
            </Field>
            <Field label="Species *">
              <input className={inputClass} value={species} onChange={(e) => setSpecies(e.target.value)} placeholder="e.g. Cow" />
            </Field>
            <Field label="Breed">
              <input className={inputClass} value={breed} onChange={(e) => setBreed(e.target.value)} placeholder="optional" />
            </Field>
            <Field label="Status">
              <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="healthy">Healthy</option>
                <option value="sick">Sick</option>
                <option value="under observation">Under Observation</option>
              </select>
            </Field>
            {animalErr && <p className="text-red-600 text-sm sm:col-span-2">{animalErr}</p>}
            {animalMsg && <p className="text-green-700 text-sm sm:col-span-2">{animalMsg}</p>}
            <button className={`${buttonClass} sm:col-span-2 w-fit`}>Add Animal</button>
          </form>

          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm bg-white rounded-lg shadow-sm border">
              <thead className="bg-gray-100 text-left">
                <tr>
                  <th className="p-2">ID</th><th className="p-2">Tag</th><th className="p-2">Species</th><th className="p-2">Breed</th><th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {animals.map((a) => (
                  <tr key={a.id} className="border-t">
                    <td className="p-2">{a.id}</td><td className="p-2">{a.tagNumber}</td><td className="p-2">{a.species}</td><td className="p-2">{a.breed || '-'}</td><td className="p-2">{a.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* GPS MAP */}
        <Section title="GPS Map">
          <div className="rounded-lg overflow-hidden border shadow-sm" style={{ height: '400px' }}>
            <MapContainer center={DEFAULT_CENTER} zoom={13} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {gpsReadings.map((r) => (
                <CircleMarker
                  key={r.id}
                  center={[r.latitude, r.longitude]}
                  radius={7}
                  pathOptions={{ color: r.outsideFence ? '#dc2626' : '#16a34a', fillOpacity: 0.7 }}
                >
                  <Popup>
                    <strong>{tagFor(r.animalId)}</strong><br />
                    {r.outsideFence ? 'Outside geo-fence' : 'Inside geo-fence'}<br />
                    {new Date(r.recordedAt).toLocaleString()}
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
        </Section>

        {/* GPS FORM + TABLE */}
        <Section title="Record GPS Reading">
          <form onSubmit={submitGps} className="grid sm:grid-cols-2 gap-4 bg-white p-5 rounded-lg shadow-sm border max-w-2xl">
            <Field label="Animal *">
              <select className={inputClass} value={gpsAnimalId} onChange={(e) => setGpsAnimalId(e.target.value)}>
                <option value="">-- Select --</option>
                {animals.map((a) => <option key={a.id} value={a.id}>{a.tagNumber} ({a.species})</option>)}
              </select>
            </Field>
            <div />
            <Field label="Latitude *">
              <input type="number" step="any" className={inputClass} value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder="-32.7500" />
            </Field>
            <Field label="Longitude *">
              <input type="number" step="any" className={inputClass} value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="26.8333" />
            </Field>
            {gpsErr && <p className="text-red-600 text-sm sm:col-span-2">{gpsErr}</p>}
            {gpsMsg && <p className="text-green-700 text-sm sm:col-span-2">{gpsMsg}</p>}
            <button className={`${buttonClass} sm:col-span-2 w-fit`}>Record GPS Reading</button>
          </form>
          <p className="text-xs text-gray-500 mt-2">
            Outside-fence status is calculated automatically from each animal own historical 5th-95th percentile range (needs 10+ prior readings).
          </p>

          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm bg-white rounded-lg shadow-sm border">
              <thead className="bg-gray-100 text-left">
                <tr><th className="p-2">ID</th><th className="p-2">Animal</th><th className="p-2">Lat</th><th className="p-2">Lon</th><th className="p-2">Fence</th><th className="p-2">Recorded</th></tr>
              </thead>
              <tbody>
                {gpsReadings.map((r) => (
                  <tr key={r.id} className={`border-t ${r.outsideFence ? 'bg-red-50' : ''}`}>
                    <td className="p-2">{r.id}</td><td className="p-2">{tagFor(r.animalId)}</td><td className="p-2">{r.latitude}</td><td className="p-2">{r.longitude}</td>
                    <td className="p-2">{r.outsideFence ? 'Outside' : 'Inside'}</td>
                    <td className="p-2">{new Date(r.recordedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* HEALTH FORM + TABLE */}
        <Section title="Record Health Reading">
          <form onSubmit={submitHealth} className="grid sm:grid-cols-2 gap-4 bg-white p-5 rounded-lg shadow-sm border max-w-2xl">
            <Field label="Animal *">
              <select className={inputClass} value={healthAnimalId} onChange={(e) => setHealthAnimalId(e.target.value)}>
                <option value="">-- Select --</option>
                {animals.map((a) => <option key={a.id} value={a.id}>{a.tagNumber} ({a.species})</option>)}
              </select>
            </Field>
            <Field label="Temperature (C) *">
              <input type="number" step="any" className={inputClass} value={temperatureC} onChange={(e) => setTemperatureC(e.target.value)} placeholder="38.6" />
            </Field>
            {healthErr && <p className="text-red-600 text-sm sm:col-span-2">{healthErr}</p>}
            {healthMsg && <p className="text-green-700 text-sm sm:col-span-2">{healthMsg}</p>}
            <button className={`${buttonClass} sm:col-span-2 w-fit`}>Record Health Reading</button>
          </form>
          <p className="text-xs text-gray-500 mt-2">
            Alerts are calculated automatically: an adaptive per-animal threshold (mean + 2 SD) once 5+ readings exist, otherwise the literature threshold of 39.5C.
          </p>

          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm bg-white rounded-lg shadow-sm border">
              <thead className="bg-gray-100 text-left">
                <tr><th className="p-2">ID</th><th className="p-2">Animal</th><th className="p-2">Temp (C)</th><th className="p-2">Alert</th><th className="p-2">Recorded</th></tr>
              </thead>
              <tbody>
                {healthReadings.map((r) => (
                  <tr key={r.id} className={`border-t ${r.alert ? 'bg-red-50' : ''}`}>
                    <td className="p-2">{r.id}</td><td className="p-2">{tagFor(r.animalId)}</td><td className="p-2">{r.temperatureC}</td>
                    <td className="p-2">{r.alert ? 'Alert' : 'Normal'}</td>
                    <td className="p-2">{new Date(r.recordedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </main>
    </div>
  );
}