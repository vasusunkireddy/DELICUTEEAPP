// utils/api.js
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PORT = 3000;
// 👉 your Windows Wi-Fi IPv4
const LOCAL_LAN_IP = '192.168.1.103';

const BASE_URL = `http://${LOCAL_LAN_IP}:${PORT}`;

const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  timeout: 8000,
});

api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    console.log(`➡️ ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`, config.headers);
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('❌ API Error:', error.response?.status, error.response?.data);
    return Promise.reject(error);
  }
);

export default api;
