import axios from 'axios';

const backendUrl = import.meta.env.VITE_BACKEND_URL;

export const fetchBank = async () => {
  try {
    const response = await axios.get(`${backendUrl}/api/banks`);

    if (response.data.success === false) {
      console.error('Failed to fetch Banks:', response.data);
      return;
    }

    return response.data;
  } catch (error) {
    console.error('Failed to fetch Banks:', error);
  }
};
