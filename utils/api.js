// utils/api.js
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SERVERS, IS_PRODUCTION } from './config';

// single source of truth
const BASE_URL = IS_PRODUCTION ? SERVERS.render : SERVERS.local;

const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  timeout: 10000,
});

api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    // quick visibility
    console.log(`API → ${config.method?.toUpperCase()} ${api.defaults.baseURL}${config.url}`);
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (res) => res,
  (error) => {
    console.error('API ERROR', error.response?.status, error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export default api;
