import { io } from "socket.io-client";

export const socket = io(import.meta.env.VITE_API_BASE_URL, {
  withCredentials: true,
});

// initializes a Socket.IO client that connects the frontend to the backend server