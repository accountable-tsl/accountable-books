import { z } from 'zod';

export const Email = z.string().trim().toLowerCase().email('Please enter a valid email address');
