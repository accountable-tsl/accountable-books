import { NewUserInput } from '../../../../src/domains/users/users.types';

export interface DemoUser extends NewUserInput {
  id: string;
  password: string;
}
const DEMO_USER_PASSWORD = 'StrongDemoPass!';

const BASE_USER = { password: DEMO_USER_PASSWORD, is_demo_user: true };

export const US_USER: DemoUser = {
  ...BASE_USER,
  id: '00000000-0000-4000-8000-000000000001',
  firstname: 'Uma',
  lastname: 'Doe',
  email: 'demo.us@example.com',
} as const;

export const NG_USER: DemoUser = {
  ...BASE_USER,
  id: '00000000-0000-4000-8000-000000000002',
  firstname: 'Ronke',
  lastname: 'Doe',
  email: 'demo.ng@example.com',
} as const;

export const DEMO_USERS = [US_USER, NG_USER];
