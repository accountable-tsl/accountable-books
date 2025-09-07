import { z } from 'zod';

export const Email = z.email('Please enter a valid email address').trim().toLowerCase();
