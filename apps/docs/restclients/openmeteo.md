# `@aibulat/restclients/openmeteo`

[open-meteo.com](https://open-meteo.com) — weather forecasts, historical
weather and geocoding. No key for non-commercial use.

```js
import {OpenMeteoApi} from '@aibulat/restclients/openmeteo';

const api = new OpenMeteoApi();

const res = await api.forecast({
    latitude: 52.52,
    longitude: 13.41,
    hourly: ['temperature_2m', 'wind_speed_10m'],
    timezone: 'auto'
});

const {time, temperature_2m} = (await res.json()).hourly;
```

---

## Column-oriented responses

Open-Meteo does not return a list of readings. You name the variables you
want, and it returns **one parallel array per variable**, all indexed by the
same `time` array:

```json
{
  "hourly": {
    "time": ["2026-08-11T00:00", "2026-08-11T01:00"],
    "temperature_2m": [17.4, 16.9]
  },
  "hourly_units": {"time": "iso8601", "temperature_2m": "°C"}
}
```

That is why `TimeSeries` is indexed rather than a fixed set of fields — the
caller picks the variables at the call site, so their names are not knowable
in advance. `hourly`, `daily` and `current` are each absent unless you asked
for them.

Variable lists may be arrays; they are comma-joined, which is the only form
Open-Meteo accepts. A repeated `hourly=a&hourly=b` comes back as a
400.

`timezone: 'auto'` resolves the zone from the coordinates, which is almost
always what you want for a daily forecast.

---

## Methods

```ts
forecast(options, config?)          // -> Forecast
archive(options, config?)           // past weather; start_date and end_date required
geocode(name, options?, config?)    // -> GeocodeResponse
```

```ts
interface ForecastOptions {
    latitude: number,
    longitude: number,
    hourly?: string | Array<string>,
    daily?: string | Array<string>,
    current?: string | Array<string>,
    timezone?: string,
    forecast_days?: number,
    past_days?: number,
    start_date?: string,
    end_date?: string,
    temperature_unit?: 'celsius' | 'fahrenheit',
    wind_speed_unit?: 'kmh' | 'ms' | 'mph' | 'kn',
    precipitation_unit?: 'mm' | 'inch'
}
```

Asking for no variables at all is valid and returns just the metadata.

### Geocoding is a different host

`geocode` calls `geocoding-api.open-meteo.com`, so it passes an absolute URL
which replaces `baseUrl` for that one request. The natural pairing:

```js
const found = await api.geocode('Berlin', {count: 1});
const place = (await found.json()).results?.[0];

if (place) {
    const weather = await api.forecast({
        latitude: place.latitude,
        longitude: place.longitude,
        daily: ['temperature_2m_max', 'temperature_2m_min'],
        timezone: 'auto'
    });
}
```

`results` is **absent, not empty**, when nothing matches — hence the `?.`.

---

## Types

`Forecast`, `TimeSeries`, `Units`, `CurrentWeather`, `ForecastOptions`,
`GeocodeResponse`, `GeocodeResult`, `GeocodeOptions`, `OpenMeteoError`.

`current` is a single reading rather than a series, so it is a flat object
where `hourly` and `daily` are arrays.

Failures are a 400 with `{error: true, reason: string}` — the reason names the
variable it could not parse, which is usually enough to spot a typo.

---

## Notes

- **Latitude 0 is a real coordinate**, not a missing one. The shared params
  helper only drops `undefined`, so `{latitude: 0, longitude: 0}` is sent as
  written.
- Open-Meteo asks that commercial use go through their paid plans. Point the
  client at the customer endpoint with `baseUrl` if you have one.
