// utils/api.js
import axios from 'axios';
import { Platform, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/* ─── Production API (Render) ─── */
const PROD_BASE = 'https://delicuteeapp.onrender.com/api';

/* ─── Local Dev API ─── */
const API_PORT = 3000;
const scriptURL = NativeModules?.SourceCode?.scriptURL ?? '';
const hostMatch = scriptURL.match(/\/\/([^:/?#]+)(?::\d+)?/);
let localHost = hostMatch?.[1] || '192.168.1.103'; // fallback Wi-Fi IP

// Special case for Android emulator
if (
  Platform.OS === 'android' &&
  (localHost === 'localhost' || localHost === '127.0.0.1')
) {
  localHost = '10.0.2.2';
}
const LOCAL_BASE = `http://${localHost}:${API_PORT}/api`;

/* ─── Pick base URL ─── */
const BASE_URL = __DEV__ ? LOCAL_BASE : PROD_BASE;

/* ─── Axios instance ─── */
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

/* ─── Attach token ─── */
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/* ─── Error logging ─── */
api.interceptors.response.use(
  (res) => res,
  (err) => {
    console.error(
      '❌ API error:',
      err.config?.method?.toUpperCase(),
      `${err.config?.baseURL}${err.config?.url}`,
      '| msg:', err.message,
      '| status:', err.response?.status
    );
    return Promise.reject(err);
  }
);

export default api;
