/**
 * Open-Meteo daily-forecast client — PURE HTTP, no DB.
 *
 * Open-Meteo (https://open-meteo.com) is a free, no-API-key weather
 * service released under CC-BY 4.0 / public-domain data terms. The
 * daily `weather-pull` job calls this once per farm location to pull a
 * short window of recent + near-future daily weather, which then feeds
 * the GDD accumulator and the spray-window / disease-risk evaluators
 * (`src/lib/agro/{gdd,rules}.ts`).
 *
 * Contract:
 *   • one GET to the forecast endpoint with the requested daily vars,
 *   • a 15s AbortController timeout (mirrors the OpenRouter provider),
 *   • a throw on any non-2xx,
 *   • the parallel `daily.*` arrays zipped into one row per calendar day.
 *
 * The module client is mocked in tests (`jest.mock`) — see the unit
 * test which stubs the global `fetch`.
 */

const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

/** Default network budget — matches the OpenRouter provider's shape. */
const FETCH_TIMEOUT_MS = 15_000;

/** One calendar day of weather as the agro layer consumes it. */
export interface DailyWeather {
    /** ISO calendar day (YYYY-MM-DD), as returned by Open-Meteo `daily.time`. */
    date: string;
    tempMaxC: number | null;
    tempMinC: number | null;
    /** Daily mean — Open-Meteo `temperature_2m_mean`; null if the API omits it. */
    tempMeanC: number | null;
    precipMm: number | null;
    windMaxKmh: number | null;
    /** Daily mean relative humidity (%). Optional — only some grids carry it. */
    humidityMean: number | null;
}

export interface FetchDailyWeatherOptions {
    /** Past days to include (Open-Meteo `past_days`, default 7). */
    days?: number;
    /** Forecast days to include (Open-Meteo `forecast_days`, default 2). */
    forecastDays?: number;
    /** IANA timezone or 'auto' (default 'auto' — the grid's local zone). */
    timezone?: string;
    /** Override the fetch timeout (ms). */
    timeoutMs?: number;
}

/** The slice of the Open-Meteo response we read. All arrays are index-aligned. */
interface OpenMeteoDailyResponse {
    daily?: {
        time?: string[];
        temperature_2m_max?: (number | null)[];
        temperature_2m_min?: (number | null)[];
        temperature_2m_mean?: (number | null)[];
        precipitation_sum?: (number | null)[];
        wind_speed_10m_max?: (number | null)[];
        relative_humidity_2m_mean?: (number | null)[];
    };
}

/** Safe array index — returns null when the array is absent or short. */
function at(arr: (number | null)[] | undefined, i: number): number | null {
    if (!arr || i >= arr.length) return null;
    const v = arr[i];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Fetch a window of daily weather for one lat/lon. Pure HTTP; the
 * caller (the weather-pull job) maps these rows onto WeatherObservation
 * upserts and feeds them to the agro evaluators.
 */
export async function fetchDailyWeather(
    latitude: number,
    longitude: number,
    opts: FetchDailyWeatherOptions = {},
): Promise<DailyWeather[]> {
    const pastDays = opts.days ?? 7;
    const forecastDays = opts.forecastDays ?? 2;
    const timezone = opts.timezone ?? 'auto';

    const params = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        daily: [
            'temperature_2m_max',
            'temperature_2m_min',
            'temperature_2m_mean',
            'precipitation_sum',
            'wind_speed_10m_max',
            'relative_humidity_2m_mean',
        ].join(','),
        past_days: String(pastDays),
        forecast_days: String(forecastDays),
        timezone,
    });
    const url = `${OPEN_METEO_FORECAST_URL}?${params.toString()}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? FETCH_TIMEOUT_MS);

    let response: Response;
    try {
        response = await fetch(url, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeout);
    }

    if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown');
        throw new Error(`Open-Meteo error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const data = (await response.json()) as OpenMeteoDailyResponse;
    const time = data.daily?.time;
    if (!Array.isArray(time) || time.length === 0) {
        // A valid 200 with no daily series — treat as an empty window
        // rather than a throw, so a grid edge doesn't fail the job.
        return [];
    }

    const out: DailyWeather[] = [];
    for (let i = 0; i < time.length; i++) {
        out.push({
            date: time[i],
            tempMaxC: at(data.daily?.temperature_2m_max, i),
            tempMinC: at(data.daily?.temperature_2m_min, i),
            tempMeanC: at(data.daily?.temperature_2m_mean, i),
            precipMm: at(data.daily?.precipitation_sum, i),
            windMaxKmh: at(data.daily?.wind_speed_10m_max, i),
            humidityMean: at(data.daily?.relative_humidity_2m_mean, i),
        });
    }
    return out;
}
