# Accountable Books Web App

React/TypeScript frontend for the Accountable Books platform.

## 🚀 Quick Start

From the root directory:

```bash
make setup      # One-time setup (installs deps, configures environment)
make web-dev    # Start web development server
```

Web app will be available at: **http://localhost:5173**

### Direct Development

```bash
cd apps/web
pnpm dev        # Start development server
pnpm test       # Run tests
pnpm build      # Build for production
```

## 🏗️ Architecture

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and building
- **Styling**: Tailwind CSS with Shadcn/UI components
- **State Management**: React Query for server state, Zustand for client state
- **Routing**: React Router v6
- **Forms**: React Hook Form with Zod validation
- **Testing**: Vitest + React Testing Library

## 📁 Project Structure

```
src/
├── components/           # Reusable UI components
│   ├── ui/              # Base UI components (Shadcn/UI)
│   └── data-table/      # Advanced data table components
├── features/            # Feature-based modules
│   ├── auth/           # Authentication
│   ├── coa/            # Chart of Accounts
│   ├── bank-transactions/ # Transaction management
│   └── onboarding/     # User onboarding
├── domains/            # Domain-specific logic
│   ├── company/        # Company management
│   ├── user/          # User management
│   └── bank-accounts/ # Bank account integration
├── shared/             # Shared utilities and services
│   ├── hooks/         # Custom React hooks
│   ├── services/      # API service functions
│   └── constants/     # Application constants
├── layouts/           # Page layout components
├── lib/              # External library configurations
└── assets/           # Static assets (fonts, images)
```

### Component Organization

Components are organized by feature and complexity:

- **`components/ui/`**: Base components (Button, Input, Dialog, etc.)
- **`components/`**: Composed components used across features
- **`features/*/components/`**: Feature-specific components
- **`layouts/`**: Page layout wrappers

## 🎨 Styling & UI

### Design System

Built with a cohesive design system:
- **Tailwind CSS**: Utility-first CSS framework
- **Shadcn/UI**: High-quality component library
- **Design tokens**: Consistent colors, spacing, typography
- **Dark mode**: Supported throughout the application

### Key Components

- **Data Tables**: Advanced tables with filtering, sorting, pagination
- **Forms**: Validated forms with error handling
- **Charts**: Financial data visualization
- **Modals & Dialogs**: Consistent modal patterns
- **Navigation**: Responsive sidebar and breadcrumb navigation

### Adding New Styles

```typescript
// Use Tailwind utilities
<div className="flex items-center space-x-4 p-6 bg-white rounded-lg shadow">

// For complex styling, use CSS modules or styled components
// Follow existing patterns in the codebase
```

## 🔧 Environment Configuration

Environment variables are loaded from `apps/web/.env.local` (created automatically by `make setup`).

Key variables for local development:
- `VITE_BACKEND_URL` - API backend URL (default: http://localhost:5000)
- `VITE_MONO_PUBLIC_KEY` - Mono bank integration key (optional)

See [Environment Variables Guide](../../docs/ENVIRONMENT.md) for complete configuration.

## 🔌 API Integration

### Type-Safe API Calls

The app uses generated TypeScript types from OpenAPI contracts:

```typescript
import type { paths } from '@accountable-books/api-types/types';
import { api } from '../lib/axios';

// Fully typed request/response
type LoginRequest = paths['/auth/login']['post']['requestBody']['content']['application/json'];
type LoginResponse = paths['/auth/login']['post']['responses']['200']['content']['application/json'];

export async function login(data: LoginRequest): Promise<LoginResponse> {
  const response = await api.post('/auth/login', data);
  return response.data;
}
```

### Data Fetching

Uses React Query for server state management:

```typescript
import { useQuery } from '@tanstack/react-query';
import { getCompanies } from '../api/companies';

export function useCompanies() {
  return useQuery({
    queryKey: ['companies'],
    queryFn: getCompanies,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Usage in component
function CompanyList() {
  const { data: companies, isLoading, error } = useCompanies();
  
  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error loading companies</div>;
  
  return (
    <ul>
      {companies?.map(company => (
        <li key={company.id}>{company.name}</li>
      ))}
    </ul>
  );
}
```

## 🧪 Testing

### Running Tests

```bash
pnpm test              # Run all tests
pnpm test:watch        # Run tests in watch mode
pnpm test:ui           # Run tests with Vitest UI
```

### Testing Philosophy

- **Component tests**: Test component behavior and user interactions
- **Integration tests**: Test feature workflows end-to-end
- **Utilities**: Mock API calls and external dependencies

### Writing Tests

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { LoginForm } from './LoginForm';

// Mock API calls
vi.mock('../api/auth', () => ({
  login: vi.fn()
}));

test('submits login form with correct data', async () => {
  render(<LoginForm />);
  
  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: 'test@example.com' }
  });
  
  fireEvent.change(screen.getByLabelText(/password/i), {
    target: { value: 'password123' }
  });
  
  fireEvent.click(screen.getByRole('button', { name: /login/i }));
  
  expect(login).toHaveBeenCalledWith({
    email: 'test@example.com',
    password: 'password123'
  });
});
```

## 🔐 Authentication & Security

### Authentication Flow

1. **Login**: User enters credentials → JWT tokens stored in secure cookies
2. **Protected Routes**: Routes check authentication status
3. **Token Refresh**: Automatic token refresh on expiration
4. **Logout**: Clear tokens and redirect to login

### Route Protection

```typescript
import { ProtectedRoute } from '../components/ProtectedRoute';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <DashboardPage />
        </ProtectedRoute>
      } />
    </Routes>
  );
}
```

## 🗂️ Feature Development

### Adding New Features

1. **Create feature directory**: `src/features/my-feature/`
2. **Add components**: Feature-specific components
3. **Add API integration**: Type-safe API calls
4. **Add routes**: React Router configuration
5. **Add tests**: Component and integration tests

### Example Feature Structure

```
src/features/invoices/
├── components/
│   ├── InvoiceList.tsx
│   ├── InvoiceForm.tsx
│   └── InvoiceDetail.tsx
├── api.ts              # API integration
├── hooks.ts           # Feature-specific hooks  
├── types.ts           # TypeScript types
├── constants.ts       # Feature constants
└── utils.ts           # Feature utilities
```

## 📊 Data Management

### Server State (React Query)

For data from the API:
```typescript
// Queries for fetching data
const { data, isLoading, error } = useQuery({...});

// Mutations for creating/updating data  
const mutation = useMutation({
  mutationFn: createInvoice,
  onSuccess: () => {
    // Invalidate related queries
    queryClient.invalidateQueries(['invoices']);
  }
});
```

### Client State (Zustand)

For UI state and temporary data:
```typescript
import { create } from 'zustand';

interface UIState {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));
```

## 🎯 Performance

### Build Optimization

- **Code splitting**: Automatic route-based code splitting
- **Tree shaking**: Dead code elimination
- **Asset optimization**: Image and font optimization
- **Bundle analysis**: Use `pnpm build --analyze` to analyze bundle

### Runtime Performance

- **React Query**: Efficient caching and background updates
- **Virtual scrolling**: For large data tables
- **Lazy loading**: Components and routes loaded on demand
- **Memoization**: Strategic use of React.memo and useMemo

## 🚢 Build & Deployment

### Development Build

```bash
pnpm dev              # Start development server with hot reload
```

### Production Build

```bash
pnpm build            # Build optimized production bundle
pnpm preview          # Preview production build locally
```

### Build Output

```
dist/
├── index.html        # Entry HTML file
├── assets/           # Hashed static assets
│   ├── index.[hash].js
│   └── index.[hash].css
└── ...
```

## 🛠️ Development Workflow

1. **Start development**:
   ```bash
   make web-dev  # From root, or pnpm dev from apps/web
   ```

2. **Make changes** to source files (hot reload enabled)

3. **Run quality checks**:
   ```bash
   make check    # Lint, typecheck, format from root
   ```

4. **Run tests**:
   ```bash
   pnpm test     # From apps/web
   ```

5. **Update types** (if API contracts changed):
   ```bash
   make contracts  # From root to regenerate types
   ```

## 🔍 Common Issues

### Build Issues
If Vite build fails:
```bash
rm -rf node_modules/.vite  # Clear Vite cache
pnpm dev                   # Restart development server
```

### Type Issues
If TypeScript compilation fails:
```bash
make contracts     # Regenerate API types
pnpm typecheck    # Check for remaining type errors
```

### API Connection Issues
If API calls fail:
- Verify API is running on http://localhost:5000
- Check `VITE_BACKEND_URL` in `.env.local`
- Check browser network tab for CORS errors

See [Troubleshooting Guide](../../docs/TROUBLESHOOTING.md) for comprehensive solutions.

## 📚 Key Dependencies

- **React**: UI framework
- **Vite**: Build tool and development server
- **React Query**: Server state management
- **React Router**: Client-side routing
- **React Hook Form**: Form handling
- **Tailwind CSS**: Utility-first CSS framework
- **Shadcn/UI**: Component library
- **Zod**: Runtime type validation
- **Zustand**: Client state management

## 🤝 Contributing

1. **Follow existing patterns** in the codebase
2. **Use TypeScript strictly** - no `any` types
3. **Add tests** for new components and features
4. **Follow component structure** conventions
5. **Run quality checks** before committing
6. **Update documentation** for new features