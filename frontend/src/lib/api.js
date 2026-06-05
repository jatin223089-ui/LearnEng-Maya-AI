import axios from 'axios';
import { API } from './config';

export { API };

const client = axios.create({ baseURL: API });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('englearn_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default client;
