import axios from "axios";

export default axios.create({
  baseURL: import.meta.env.VITE_BACKEND_URL,
  // withCredentials: true,
});


console.log(import.meta.env.VITE_BACKEND_URL);