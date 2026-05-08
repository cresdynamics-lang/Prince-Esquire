# Prince Esquire E-commerce

A modern e-commerce platform built with React, TypeScript, and PostgreSQL.

## Features

- 🛍️ Product catalog with categories and subcategories
- 🛒 Shopping cart with persistent storage
- 👤 User authentication and profiles
- 💳 Multiple payment options (Stripe, M-Pesa, Cash on Delivery)
- 📱 Responsive design with Tailwind CSS
- 🔍 Advanced product search and filtering
- 📦 Order management and tracking
- 👨‍💼 Admin dashboard for product management

## Tech Stack

- **Frontend**: React 19, TypeScript, TanStack Router, Tailwind CSS, Shadcn/ui
- **Backend**: Next.js API Routes, PostgreSQL, JWT authentication
- **Deployment**: Vercel with Vercel Postgres
- **Payments**: Stripe, M-Pesa STK Push
- **Storage**: Local file storage (configurable)

## Local Development

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd prince-esquare-style
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Set up PostgreSQL database**
   - Install PostgreSQL locally or use a cloud provider
   - Run the database migrations from `supabase/migrations/`
   - Or use the seed script: `npm run seed-database.js`

5. **Start development servers**
   ```bash
   # Start the API server
   npm run dev:server

   # In another terminal, start the frontend
   npm run dev
   ```

6. **Open your browser**
   - Frontend: http://localhost:5173
   - API: http://localhost:4000

## Vercel Deployment

### 1. Set up Vercel Postgres

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Create a new project or select existing
3. Go to **Storage** → **Create Database** → **Postgres**
4. Create a new database
5. Copy the `DATABASE_URL` from the database settings

### 2. Configure Environment Variables

In your Vercel project settings, add these environment variables:

```bash
# Database
DATABASE_URL=postgresql://username:password@hostname:5432/database

# Authentication
JWT_SECRET=your-secure-jwt-secret-here

# Stripe (for payments)
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...

# M-Pesa (optional, for mobile payments)
MPESA_CONSUMER_KEY=your-mpesa-consumer-key
MPESA_CONSUMER_SECRET=your-mpesa-consumer-secret
MPESA_PASSKEY=your-mpesa-passkey
MPESA_SHORTCODE=your-mpesa-shortcode
MPESA_CALLBACK_URL=https://your-domain.vercel.app/api/mpesa/callback
MPESA_ENV=sandbox

# Email (optional, for notifications)
RESEND_API_KEY=your-resend-api-key

# Site configuration
SITE_URL=https://your-domain.vercel.app
```

### 3. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel --prod
```

### 4. Set up Database Schema

After deployment, run the database migrations:

1. Connect to your Vercel Postgres database
2. Run the SQL files in `supabase/migrations/` in order
3. Or use the seed script if available

## Database Schema

The application uses PostgreSQL with the following main tables:

- `auth.users` - User authentication
- `public.profiles` - User profiles
- `public.categories` - Product categories
- `public.products` - Product catalog
- `public.product_variants` - Product variations (size, color, stock)
- `public.product_images` - Product images
- `public.orders` - Customer orders
- `public.order_items` - Order line items
- `public.user_roles` - User permissions
- `public.attendant_profiles` - Staff profiles

## API Endpoints

- `POST /api/db` - Database queries (Supabase-compatible)
- `POST /api/auth/signin` - User login
- `POST /api/auth/signup` - User registration
- `GET /api/auth/session` - Get current session
- `GET /api/auth/user` - Get user info
- `POST /api/functions/[name]` - Serverless functions
- `POST /api/storage/[bucket]/upload` - File upload
- `GET /api/storage/[bucket]/public/*` - Serve public files

## Development Scripts

```bash
# Development
npm run dev              # Start frontend dev server
npm run dev:server       # Start API server
npm run build            # Build for production
npm run preview          # Preview production build

# Database
npm run products:sync-images    # Sync product images
npm run products:backfill-subcategories  # Update subcategories

# Code quality
npm run lint             # Run ESLint
npm run format           # Format code with Prettier
```

## Project Structure

```
├── api/                    # Vercel API routes
├── src/
│   ├── components/         # React components
│   ├── integrations/       # External service integrations
│   ├── lib/               # Utility libraries
│   ├── routes/            # TanStack Router pages
│   └── styles.css         # Global styles
├── server/                # Local development server
├── supabase/              # Database migrations and config
└── scripts/               # Utility scripts
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

This project is licensed under the MIT License.