// utils/api.js
import axios from 'axios';
import { Platform, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Your production (Render) API ───
const PROD_BASE = 'https://delicuteeapp.onrender.com/api';

// ─── Compute local dev API ───
const API_PORT = 3000;
const scriptURL = NativeModules?.SourceCode?.scriptURL ?? '';
const hostMatch = scriptURL.match(/\/\/([^:/?#]+)(?::\d+)?/);
let localHost = hostMatch?.[1] || '192.168.1.103'; // fallback Wi-Fi IP

if (Platform.OS === 'android' && (localHost === 'localhost' || localHost === '127.0.0.1')) {
  localHost = '10.0.2.2';
}
const LOCAL_BASE = `http://${localHost}:${API_PORT}/api`;

// ─── Decide base URL ───
// Priority: 1) Override from AsyncStorage  2) Local (if __DEV__)  3) Render (default)
let cachedBaseURL;

async function resolveBaseURL() {
  if (cachedBaseURL) return cachedBaseURL;

  try {
    const override = await AsyncStorage.getItem('API_BASE_URL');
    if (override) {
      cachedBaseURL = override;
      return cachedBaseURL;
    }
  } catch {}

  if (__DEV__) {
    cachedBaseURL = LOCAL_BASE; // in dev mode, use local server
  } else {
    cachedBaseURL = PROD_BASE; // in prod mode, always use Render
  }

  return cachedBaseURL;
}

// ─── Axios instance ───
const api = axios.create({ timeout: 10000 });

api.interceptors.request.use(async (config) => {
  if (!config.baseURL) {
    config.baseURL = await resolveBaseURL();
  }
  const token = await AsyncStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    console.error('API error:', err.response?.status, err.response?.data || err.message);
    return Promise.reject(err);
  }
);

export default api;
