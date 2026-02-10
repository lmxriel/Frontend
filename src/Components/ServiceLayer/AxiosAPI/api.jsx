import axios from "axios"; // to make HTTP requests from the frontend (React) to a backend

const apiClient = axios.create({
  baseURL: "https://backend-ul9i.onrender.com", // or your API base
  withCredentials: true, // crucial for cookie-based auth!
});

export default apiClient;
export const REFRESH_TOKEN_URL = "/users/refresh-token"; // or whatever your refresh endpoint is
