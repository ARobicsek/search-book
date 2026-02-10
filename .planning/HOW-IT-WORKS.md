# How SearchBook Was Built: A Guide for Coding Newbies

This document explains the key technologies and patterns used in SearchBook. If you're new to coding, this will help you understand how modern web applications work.

---

## Table of Contents

1. [The Big Picture: Full-Stack Architecture](#the-big-picture-full-stack-architecture)
2. [The Frontend: React and How It Works](#the-frontend-react-and-how-it-works)
3. [The Backend: Express.js API Server](#the-backend-expressjs-api-server)
4. [The Database: From SQLite to Turso](#the-database-from-sqlite-to-turso)
5. [Prisma: The Database Translator](#prisma-the-database-translator)
6. [Deployment: How Vercel Makes It Live](#deployment-how-vercel-makes-it-live)
7. [Photo Storage: Local Files vs. Blob Storage](#photo-storage-local-files-vs-blob-storage)
8. [Auto-Save: The Magic Behind Instant Saving](#auto-save-the-magic-behind-instant-saving)
9. [Progressive Web App (PWA): Your iPhone App](#progressive-web-app-pwa-your-iphone-app)
10. [Key Takeaways](#key-takeaways)

---

## The Big Picture: Full-Stack Architecture

SearchBook is a **full-stack application**, meaning it has two main parts:

```
┌─────────────────────────────────────────────────────────┐
│                     YOUR BROWSER                         │
│  ┌─────────────────────────────────────────────────────┐ │
│  │               CLIENT (Frontend)                      │ │
│  │   React app that shows the UI and handles clicks    │ │
│  └───────────────────────┬─────────────────────────────┘ │
└──────────────────────────┼──────────────────────────────┘
                           │ HTTP Requests (fetch/API calls)
                           ▼
┌─────────────────────────────────────────────────────────┐
│                  SERVER (Backend)                        │
│  ┌─────────────────────────────────────────────────────┐ │
│  │   Express.js app that handles API requests          │ │
│  │   - Receives requests from the client               │ │
│  │   - Reads/writes to the database                    │ │
│  │   - Sends responses back                            │ │
│  └───────────────────────┬─────────────────────────────┘ │
└──────────────────────────┼──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                     DATABASE                             │
│  Stores all your contacts, companies, conversations     │
│  (SQLite locally, Turso in production)                  │
└─────────────────────────────────────────────────────────┘
```

**Why separate them?** This separation allows:
- The frontend to be fast and responsive (it can show loading states while waiting for data)
- The backend to be secure (users can't access the database directly)
- Different developers to work on different parts
- Easy swapping of pieces (e.g., change the database without touching the frontend)

---

## The Frontend: React and How It Works

The `client/` folder contains a **React** application. React is a JavaScript library that lets you build user interfaces by breaking them into **components**.

### What's a Component?

A component is a reusable piece of UI. Think of it like LEGO bricks:

```typescript
// A simple component - it's just a function that returns HTML-like syntax
function ContactCard({ name, title, email }) {
  return (
    <div className="card">
      <h2>{name}</h2>
      <p>{title}</p>
      <a href={`mailto:${email}`}>{email}</a>
    </div>
  );
}

// Use it anywhere:
<ContactCard name="John Smith" title="CEO" email="john@example.com" />
```

### State: How React Remembers Things

React uses **state** to remember data that can change:

```typescript
function Counter() {
  // useState returns [currentValue, functionToUpdateIt]
  const [count, setCount] = useState(0);

  return (
    <button onClick={() => setCount(count + 1)}>
      Clicked {count} times
    </button>
  );
}
```

When `setCount` is called, React automatically re-renders the component with the new value.

### Vite: The Build Tool

**Vite** (pronounced "veet", French for "fast") is what transforms your code into something browsers understand. When you run `npm start`:

1. Vite starts a development server at `localhost:5173`
2. It watches your files for changes
3. When you save, it instantly updates the browser (called "hot module replacement")

For production, Vite bundles all your code into optimized files.

---

## The Backend: Express.js API Server

The `server/` folder contains an **Express.js** application. Express is a minimal framework for building web servers in Node.js.

### How an API Endpoint Works

```typescript
// server/src/routes/contacts.ts

// When someone requests GET /api/contacts
router.get('/', async (req, res) => {
  try {
    // 1. Read from database
    const contacts = await prisma.contact.findMany({
      include: { company: true }  // Also get related company
    });

    // 2. Send response as JSON
    res.json(contacts);
  } catch (error) {
    // 3. Handle errors
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// When someone sends POST /api/contacts (to create a new contact)
router.post('/', async (req, res) => {
  // req.body contains the data sent from the frontend
  const { name, email, title } = req.body;

  const newContact = await prisma.contact.create({
    data: { name, email, title }
  });

  res.json(newContact);
});
```

### The Request-Response Cycle

1. **Frontend** calls `fetch('/api/contacts')`
2. **Express** receives the request
3. **Route handler** queries the database
4. **Database** returns data
5. **Express** sends JSON response
6. **Frontend** receives data and updates the UI

---

## The Database: From SQLite to Turso

### SQLite: Your Local Database

**SQLite** is a database that stores everything in a single file. It's perfect for development because:
- No server to install or run
- Data lives in `server/prisma/dev.db`
- Fast and reliable

### Turso: SQLite in the Cloud

When you deploy to the internet, you need a database that's accessible from anywhere. **Turso** is a cloud database service that's compatible with SQLite.

**The clever part:** Our code uses the same database queries whether running locally or in production:

```typescript
// server/src/db.ts - This is the "database factory"

function createPrismaClient() {
  // Check if we have Turso credentials (production)
  if (process.env.TURSO_DATABASE_URL) {
    // Connect to Turso cloud database
    const adapter = new PrismaLibSQL({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    return new PrismaClient({ adapter });
  }

  // Otherwise, use local SQLite file
  return new PrismaClient();
}
```

**Environment variables** like `TURSO_DATABASE_URL` are secret values stored outside the code. In development, they're in `.env` files. In production, they're set in Vercel's dashboard.

---

## Prisma: The Database Translator

**Prisma** is an **ORM** (Object-Relational Mapper). It lets you work with database data using JavaScript objects instead of writing raw SQL.

### The Schema: Defining Your Data Structure

```prisma
// server/prisma/schema.prisma

model Contact {
  id        Int      @id @default(autoincrement())  // Primary key
  name      String                                   // Required field
  email     String?                                  // Optional (the ?)
  title     String?
  status    String   @default("NEW")                 // Default value

  // Relationship: a contact belongs to a company
  companyId Int?
  company   Company? @relation(fields: [companyId], references: [id])

  // Timestamps
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### Using Prisma in Code

Instead of writing SQL like this:
```sql
SELECT * FROM contacts WHERE status = 'CONNECTED' ORDER BY name
```

You write TypeScript like this:
```typescript
const contacts = await prisma.contact.findMany({
  where: { status: 'CONNECTED' },
  orderBy: { name: 'asc' }
});
```

**Benefits:**
- Type safety (your editor knows what fields exist)
- Automatic migrations (Prisma updates the database when you change the schema)
- Protection against SQL injection attacks

---

## Deployment: How Vercel Makes It Live

**Vercel** is a platform that hosts websites and applications. Here's how SearchBook goes from your computer to the internet:

### The Deployment Flow

```
1. You run: git push
       │
       ▼
2. GitHub receives your code
       │
       ▼
3. Vercel detects the push (it's connected to GitHub)
       │
       ▼
4. Vercel runs: npm run build:vercel
   - Installs dependencies
   - Builds the React app
   - Prepares the server code
       │
       ▼
5. Vercel deploys:
   - Static files (HTML, CSS, JS) → CDN (Content Delivery Network)
   - Server code → Serverless Functions
       │
       ▼
6. Your app is live at searchbook-three.vercel.app!
```

### Serverless Functions: The Backend Magic

Traditional servers run 24/7, even when nobody's using them. **Serverless functions** only run when needed:

1. User visits your app → No server running yet
2. User clicks "Load Contacts" → Request hits Vercel
3. Vercel wakes up your function → Runs the Express code
4. Function returns data → Goes back to sleep
5. You only pay for actual usage

The `api/index.ts` file is the entry point that wraps your Express app:

```typescript
// api/index.ts
import app from '../server/src/app';

export default function handler(req, res) {
  return app(req, res);  // Forward to Express
}
```

### The vercel.json Configuration

```json
{
  "buildCommand": "npm run build:vercel",
  "outputDirectory": "client/dist",
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

The **rewrites** section is important:
- `/api/*` requests go to your serverless function
- All other requests serve `index.html` (so React Router can handle client-side navigation)

---

## Photo Storage: Local Files vs. Blob Storage

Photos present a challenge: where do you store files that users upload?

### Local Development: Simple File Storage

```typescript
// When running locally, photos go to server/data/photos/
const localUpload = multer({
  storage: multer.diskStorage({
    destination: 'data/photos',
    filename: (req, file, cb) => {
      // Create unique filename: 1707200000-abc123.jpg
      cb(null, Date.now() + '-' + Math.random() + path.extname(file.originalname));
    }
  })
});
```

### Production: Vercel Blob Storage

Serverless functions can't store files permanently (they're temporary by design). **Vercel Blob** is cloud storage for files:

```typescript
// When running in production
import { put } from '@vercel/blob';

const blob = await put(filename, fileBuffer, {
  access: 'public',
  contentType: 'image/jpeg'
});

// Returns a permanent URL like:
// https://abcdef.public.blob.vercel-storage.com/photo-123.jpg
```

### The Smart Handler

```typescript
// server/src/routes/upload.ts

router.post('/photo', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    // Production: use Vercel Blob
    const blob = await put(filename, req.file.buffer, { access: 'public' });
    res.json({ path: blob.url });
  } else {
    // Development: save to local folder
    res.json({ path: `/photos/${req.file.filename}` });
  }
});
```

The database stores just the URL string—it doesn't care whether it's a local path or a cloud URL.

---

## Auto-Save: The Magic Behind Instant Saving

Auto-save makes editing feel like Google Docs—changes are saved automatically as you type.

### The Challenge

You don't want to save on every keystroke (that would flood the server). The solution: **debouncing**.

### What is Debouncing?

Debouncing means "wait until the user stops doing something before acting."

```
User types: H...e...l...l...o...
            │  │  │  │  │
            │  │  │  │  └─ Wait 1.5 seconds...
            │  │  │  └──── Reset timer
            │  │  └─────── Reset timer
            │  └────────── Reset timer
            └───────────── Start 1.5 second timer

After 1.5s of no typing → SAVE!
```

### The useAutoSave Hook

```typescript
// client/src/hooks/use-auto-save.ts

export function useAutoSave({ data, originalData, onSave, debounceMs = 1500 }) {
  const [status, setStatus] = useState('idle');

  // Check if data has changed from original
  const isDirty = !deepEqual(data, originalData);

  useEffect(() => {
    if (!isDirty) return;  // Nothing changed, don't save

    // Set a timer
    const timeout = setTimeout(async () => {
      setStatus('saving');
      try {
        await onSave(data);
        setStatus('saved');
      } catch (e) {
        setStatus('error');
      }
    }, debounceMs);

    // If data changes again, cancel the timer and start over
    return () => clearTimeout(timeout);
  }, [data]);

  return { status, isDirty };
}
```

### Using It in a Form

```typescript
function ContactForm({ contactId }) {
  const [form, setForm] = useState({ name: '', email: '' });
  const [original, setOriginal] = useState(null);

  // Load existing contact
  useEffect(() => {
    const contact = await api.get(`/contacts/${contactId}`);
    setForm(contact);
    setOriginal(contact);  // Remember what we started with
  }, [contactId]);

  // Auto-save when form changes
  const { status } = useAutoSave({
    data: form,
    originalData: original,
    onSave: (data) => api.put(`/contacts/${contactId}`, data),
  });

  return (
    <form>
      <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
      <SaveStatus status={status} />  {/* Shows "Saving..." or "Saved ✓" */}
    </form>
  );
}
```

---

## Progressive Web App (PWA): Your iPhone App

A **PWA** is a website that can be installed on your phone like a native app.

### What Makes SearchBook a PWA?

1. **Manifest file** (`manifest.json`) - Tells the phone about your app:
   ```json
   {
     "name": "SearchBook",
     "short_name": "SearchBook",
     "display": "standalone",  // Hide browser UI
     "start_url": "/",
     "icons": [...]
   }
   ```

2. **Service Worker** - A script that runs in the background:
   - Caches files so the app loads offline
   - Can sync data in the background
   - Enables push notifications

3. **HTTPS** - Required for security (Vercel provides this automatically)

### Installing on iPhone

1. Open Safari → Go to searchbook-three.vercel.app
2. Tap Share → "Add to Home Screen"
3. Now it opens like a native app!

---

## Key Takeaways

### Architecture Patterns

1. **Separation of Concerns** - Frontend, backend, and database each have one job
2. **Environment-Aware Code** - Same code works locally and in production
3. **Type Safety** - TypeScript catches errors before they happen

### Technologies You've Learned About

| Technology | Purpose |
|------------|---------|
| React | Building user interfaces |
| Express.js | Handling HTTP requests |
| Prisma | Database access without SQL |
| SQLite/Turso | Storing data |
| Vite | Fast development and builds |
| Vercel | Hosting and deployment |
| Blob Storage | Storing uploaded files |
| PWA | Mobile app experience |

### Key Concepts

- **API**: A way for programs to talk to each other
- **State**: Data that can change over time
- **Debouncing**: Waiting for activity to stop before acting
- **Serverless**: Functions that only run when needed
- **ORM**: Talking to databases with code instead of SQL

---

## What's Next?

Now that you understand how SearchBook works, you can:

1. **Modify the UI** - Try changing colors or layouts in the client components
2. **Add new fields** - Update the Prisma schema and regenerate
3. **Create new features** - Add new routes and components
4. **Explore the code** - Read through `client/src/pages/` to see how pages work

The best way to learn is by experimenting. Break things, fix them, and you'll understand even more!

---

*Document created for SearchBook educational purposes. Feel free to ask questions about any section!*
