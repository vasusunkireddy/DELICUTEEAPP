// utils/config.js
export const SERVERS = {
  local: 'http://192.168.1.105:3000',                 // your Wi-Fi server (if you ever test locally)
  render: 'https://delicuteeapp.onrender.com',        // 24/7 Render
};

// 👉 For customer / real APK
export const IS_PRODUCTION = true;         // true = always use Render
export const DEFAULT_SERVER = 'render';    // default if not overridden when IS_PRODUCTION = false
