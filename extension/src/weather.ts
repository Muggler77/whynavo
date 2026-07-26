import { cacheWeather, readWeather } from "./db";
import type { WeatherDay, WeatherState } from "./types";

type GeoResult = {
  results?: Array<{ name: string; latitude: number; longitude: number; country?: string; admin1?: string }>;
};

type ReverseGeoResult = {
  results?: Array<{ name: string; country?: string; admin1?: string }>;
};

type ForecastResult = {
  current?: {
    temperature_2m: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max?: number[];
  };
};

type WeatherPlace = {
  city: string;
  latitude: number;
  longitude: number;
};

const MAX_WEATHER_RESPONSE_BYTES = 1024 * 1024;
const WEATHER_REQUEST_TIMEOUT_MS = 12_000;
const finiteInRange = (value: unknown, minimum: number, maximum: number): value is number => (
  typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
);

async function fetchWeatherJson<T>(url: URL): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), WEATHER_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`天气服务返回 ${response.status}`);
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > MAX_WEATHER_RESPONSE_BYTES) throw new Error("天气服务响应过大");
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_WEATHER_RESPONSE_BYTES) {
      throw new Error("天气服务响应过大");
    }
    return JSON.parse(text) as T;
  } finally {
    window.clearTimeout(timeout);
  }
}

const cleanPlacePart = (value?: string) => value?.replace(/市$/u, "").trim();

const joinPlaceParts = (...parts: Array<string | undefined>) => {
  const unique = parts
    .map(cleanPlacePart)
    .filter((part): part is string => Boolean(part))
    .filter((part, index, list) => list.indexOf(part) === index);
  return unique.join(" · ");
};

const formatPlace = (place: { name: string; country?: string; admin1?: string }) => {
  const isChina = place.country === "中国" || place.country === "China";
  if (isChina) return joinPlaceParts(place.admin1, place.name) || place.name;
  return joinPlaceParts(place.name, place.admin1, place.country) || place.name;
};

async function placeFromCity(city: string): Promise<WeatherPlace> {
  const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
  geoUrl.searchParams.set("name", city);
  geoUrl.searchParams.set("count", "1");
  geoUrl.searchParams.set("language", "zh");
  geoUrl.searchParams.set("format", "json");

  const geo = await fetchWeatherJson<GeoResult>(geoUrl);
  const place = geo.results?.[0];
  if (
    !place
    || typeof place.name !== "string"
    || place.name.length > 500
    || !finiteInRange(place.latitude, -90, 90)
    || !finiteInRange(place.longitude, -180, 180)
  ) throw new Error("没有找到这个城市");
  return {
    city: formatPlace(place),
    latitude: place.latitude,
    longitude: place.longitude
  };
}

async function placeFromCoordinates(latitude: number, longitude: number, fallbackCity?: string): Promise<WeatherPlace> {
  const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/reverse");
  geoUrl.searchParams.set("latitude", String(latitude));
  geoUrl.searchParams.set("longitude", String(longitude));
  geoUrl.searchParams.set("count", "1");
  geoUrl.searchParams.set("language", "zh");
  geoUrl.searchParams.set("format", "json");

  const geo = await fetchWeatherJson<ReverseGeoResult>(geoUrl).catch(() => undefined);
  const place = geo?.results?.[0];
  return {
    city: place && typeof place.name === "string" && place.name.length <= 500
      ? formatPlace(place)
      : (fallbackCity || "定位位置").slice(0, 500),
    latitude,
    longitude
  };
}

function buildForecastDays(daily?: ForecastResult["daily"]): WeatherDay[] {
  if (!daily?.time?.length) return [];
  return daily.time.slice(0, 15).flatMap((date, index) => {
    const weatherCode = daily.weather_code?.[index];
    const temperatureMax = daily.temperature_2m_max?.[index];
    const temperatureMin = daily.temperature_2m_min?.[index];
    const precipitationProbability = daily.precipitation_probability_max?.[index];
    if (
      typeof date !== "string"
      || !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || !finiteInRange(weatherCode, 0, 999)
      || !finiteInRange(temperatureMax, -100, 100)
      || !finiteInRange(temperatureMin, -100, 100)
      || (precipitationProbability !== undefined && !finiteInRange(precipitationProbability, 0, 100))
    ) return [];
    return [{ date, weatherCode, temperatureMax, temperatureMin, precipitationProbability }];
  });
}

async function fetchForecast(place: WeatherPlace, userId?: string): Promise<WeatherState> {
  const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
  forecastUrl.searchParams.set("latitude", String(place.latitude));
  forecastUrl.searchParams.set("longitude", String(place.longitude));
  forecastUrl.searchParams.set("current", "temperature_2m,weather_code,wind_speed_10m");
  forecastUrl.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max");
  forecastUrl.searchParams.set("forecast_days", "15");
  forecastUrl.searchParams.set("timezone", "auto");

  const forecast = await fetchWeatherJson<ForecastResult>(forecastUrl);
  if (
    !forecast.current
    || !finiteInRange(forecast.current.temperature_2m, -100, 100)
    || !finiteInRange(forecast.current.weather_code, 0, 999)
    || !finiteInRange(forecast.current.wind_speed_10m, 0, 500)
  ) throw new Error("天气服务暂时不可用");

  const weather: WeatherState = {
    city: place.city,
    temperature: forecast.current.temperature_2m,
    weatherCode: forecast.current.weather_code,
    windSpeed: forecast.current.wind_speed_10m,
    forecast: buildForecastDays(forecast.daily),
    sourceUrl: "https://open-meteo.com/",
    latitude: place.latitude,
    longitude: place.longitude,
    updatedAt: new Date().toISOString()
  };
  await cacheWeather(weather, userId);
  return weather;
}

export async function fetchWeather(city: string, userId?: string): Promise<WeatherState> {
  return fetchForecast(await placeFromCity(city), userId);
}

export async function fetchWeatherByCoordinates(latitude: number, longitude: number, fallbackCity?: string, userId?: string): Promise<WeatherState> {
  return fetchForecast(await placeFromCoordinates(latitude, longitude, fallbackCity), userId);
}

export async function requestDeviceLocationPermission() {
  if (window.location.protocol !== "chrome-extension:" || !globalThis.chrome?.permissions) return true;
  const permission = { permissions: ["geolocation"] };
  if (await chrome.permissions.contains(permission)) return true;
  return chrome.permissions.request(permission);
}

export function getDevicePosition(): Promise<{ latitude: number; longitude: number }> {
  if (!navigator.geolocation) return Promise.reject(new Error("当前浏览器不支持定位"));
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => reject(new Error("没有获得定位权限")),
      { enableHighAccuracy: false, maximumAge: 30 * 60 * 1000, timeout: 8000 }
    );
  });
}

export async function getCachedWeather(userId?: string) {
  const weather = await readWeather<WeatherState>(userId);
  if (
    !weather
    || typeof weather.city !== "string"
    || weather.city.length > 500
    || !finiteInRange(weather.temperature, -100, 100)
    || !finiteInRange(weather.weatherCode, 0, 999)
    || !finiteInRange(weather.windSpeed, 0, 500)
    || !Array.isArray(weather.forecast)
    || weather.forecast.length > 15
    || weather.forecast.some((day) => (
      !day
      || typeof day.date !== "string"
      || !/^\d{4}-\d{2}-\d{2}$/.test(day.date)
      || !finiteInRange(day.weatherCode, 0, 999)
      || !finiteInRange(day.temperatureMax, -100, 100)
      || !finiteInRange(day.temperatureMin, -100, 100)
      || (day.precipitationProbability !== undefined && !finiteInRange(day.precipitationProbability, 0, 100))
    ))
    || typeof weather.sourceUrl !== "string"
    || !Number.isFinite(Date.parse(weather.updatedAt))
    || (weather.latitude !== undefined && !finiteInRange(weather.latitude, -90, 90))
    || (weather.longitude !== undefined && !finiteInRange(weather.longitude, -180, 180))
  ) return undefined;
  return {
    ...weather,
    sourceUrl: "https://open-meteo.com/"
  };
}

export function weatherLabel(code?: number) {
  if (code === undefined) return "未知";
  if (code === 0) return "晴";
  if ([1, 2, 3].includes(code)) return "多云";
  if ([45, 48].includes(code)) return "雾";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "雨";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "雪";
  if ([95, 96, 99].includes(code)) return "雷雨";
  return "天气";
}
