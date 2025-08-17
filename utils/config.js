// utils/config.js
export const SERVERS = {
  // ⬇️ put YOUR laptop's IPv4 here (ipconfig)
  local: 'http://192.168.1.103:3000',
  render: 'https://delicuteeapp.onrender.com',
};

// true  => always use Render
// false => use localhost (SERVERS.local)
export const IS_PRODUCTION = false;
