// utils/api.js
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Always use production Render API ───
const BASE_URL = 'https://delicuteeapp.onrender.com/api';

// ─── Axios instance ───
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000, // longer timeout for Render cold starts
});

// ─── Attach token if available ───
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Log errors cleanly ───
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
