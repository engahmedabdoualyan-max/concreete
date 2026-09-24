# Concrete ERP System

A comprehensive ERP system for concrete and asphalt plants with multi-language support and real-time operations management.

## ⚠️ Runbook before mobile/release work

Before building Android, changing the app-account tree, or deploying the website, read **[BUILD_TROUBLESHOOTING.md](BUILD_TROUBLESHOOTING.md)**. It documents the EAS/monorepo fixes, Firebase tree data flow, password-hash handling, deployment checks, and the exact R&D/HR role workflow.

**Important:** the app-account tree is stored in Firebase Firestore (`concrete-erb/companyTrees`), not in the website Supabase database.

## Features

### 🎯 Core Functionality
- **Multi-language Support**: Arabic, English, and Urdu
- **Authentication System**: Secure login, registration with email verification
- **Admin Panel**: Complete content management interface
- **Responsive Design**: Works on desktop and mobile devices
- **Real-time Updates**: Local storage and Firebase integration
- **Modern Tech Stack**: React 19, TypeScript, Vite, Tailwind CSS

### 🏗️ Available Modules
- **ERP Concrete**: Complete concrete plant management system
- **ERP Asphalt**: Asphalt plant management (Coming Soon)
- **Automation**: Station automation (Coming Soon)
- **Maintenance**: Maintenance and repair management
- **R&D**: Research and Development module
- **Workshop**: Workshop and equipment management
- **OEE Evaluation**: Operations Efficiency monitoring
- **Inventory**: Material inventory management
- **Deliveries**: Order delivery tracking
- **Schedule**: Pouring schedule management

## Installation & Setup

### Prerequisites
- Node.js 18 or higher
- npm or yarn

### Installation Steps

```bash
# Clone the repository
cd /path/to/concrete

# Install dependencies
npm install

# Run the development server
npm run dev

# Build for production
npm run build

# Preview the built application
npm run preview
```

## Project Structure

```
concrete/
├── src/
│   ├── context/           # React context providers
│   │   ├── AuthContext.tsx    # Authentication
│   │   ├── LangContext.tsx    # Language support
│   │   ├── DateContext.tsx    # Date handling
│   │   └── AdminContext.tsx   # Admin panel content
│   ├── components/         # Reusable UI components
│   │   ├── LoginRegister.tsx # Login and registration forms
│   │   ├── LangSelector.tsx  # Language selector
│   │   └── QuickJump.tsx     # Quick navigation
│   ├── pages/              # Application pages
│   │   ├── Dashboard.tsx     # Main dashboard
│   │   ├── Operations.tsx    # Operations tracker
│   │   ├── Workshop.tsx      # Workshop management
│   │   ├── MixingQuality.tsx # Mixing and quality control
│   │   ├── Production.tsx    # Production and inventory
│   │   ├── Evaluation.tsx    # OEE evaluation
│   │   ├── Schedule.tsx      # Pouring schedule
│   │   ├── Orders.tsx        # Order management
│   │   ├── ResearchDevelopment.tsx # R&D module
│   │   └── Admin.tsx         # Admin panel
│   └── App.tsx             # Main application component
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## Key Features

### 🌐 Multi-language Support
The application supports three languages:
- **Arabic** (العربية) - Default language
- **English** (English)
- **Urdu** (اردو)

All UI text, labels, and content are fully translated.

### 🔐 Authentication System
The authentication system includes:

#### Login
- Username and password authentication
- Firebase and localStorage backup support
- Remember me functionality

#### Registration
- Comprehensive user profile fields:
  - Username
  - Email
  - Plant name
  - Country and city
  - Phone number
  - Password
- Email verification with 6-digit code
- Automatic code resend option

#### Verification
- Email verification system
- Code validation against generated code
- Account activation after successful verification

### 🎛️ Admin Panel
The admin panel provides:
- Full content management
- Edit/add/remove projects
- Update company information
- Reset to default content
- Real-time content updates

### 📱 Responsive Design
- Mobile-first approach
- Tailwind CSS utility classes
- Flexible grid layouts
- Touch-friendly interfaces

## Usage Examples

### Accessing the Application
1. **Visit the main website**: `http://localhost:5173/` or your production URL
2. **Authentication**: Click "Login/Register" button to access authentication
3. **Dashboard**: After login, view the main dashboard with project access
4. **Admin Panel**: Access admin panel from dashboard header

### Navigating Between Modules
- Use the "Quick Jump" dropdown in the header
- Click on project cards in the dashboard
- Direct navigation available through URL paths

### Language Switching
- Use the language selector in the header
- Changes are saved to localStorage
- All content updates dynamically

## Development Scripts

### Available Scripts

```json
{
  "scripts": {
    "dev": "vite",                    # Start development server
    "build": "vite build",            # Build for production
    "preview": "vite preview",        # Preview built application
    "lint": "eslint src --ext .ts,.tsx", # Code linting
    "typecheck": "tsc --noEmit"        # Type checking
  }
}
```

### Development Workflow

```bash
# Start development server
npm run dev

# Open in browser
# Default URL: http://localhost:5173/

# For production deployment
npm run build
npm run preview

# Type checking (recommended for development)
npm run typecheck
```

## Contributing

### Code Standards
- TypeScript for type safety
- ESLint for code quality
- Prettier for formatting
- Component-based architecture

### Contribution Guidelines
1. Fork the repository
2. Create a feature branch
3. Follow existing code patterns
4. Add tests for new functionality
5. Update documentation
6. Submit a pull request

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Support

For support and inquiries:
- **Email**: info@fimtosoft.com
- **Phone**: +20 100 100 6627
- **Website**: https://fimtosoft.com

## Acknowledgements

Special thanks to:
- Dr. Ahmed Abdo Alyan for design and development
- FIMTO Software for technological support
- All open-source contributors
