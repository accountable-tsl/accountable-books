import api from '@/lib/axios';

export const fetchBank = async () => {
  try {
    const response = await api.get('/api/banks');

    if (response.data.success === false) {
      console.error('Failed to fetch Banks:', response.data);
      return;
    }

    return response.data;
  } catch (error) {
    console.error('Failed to fetch Banks:', error);
  }
};
