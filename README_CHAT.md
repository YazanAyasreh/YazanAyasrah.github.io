# Developer Chat - Setup Guide

A real-time chat application with Google OAuth authentication, built as an extension to the static portfolio website.

## Features

- Google OAuth for secure authentication
- Real-time messaging with Socket.IO
- Multiple chat rooms (general + custom rooms)
- Online users list with live count
- User profiles with avatars
- Typing indicators
- Message history
- Dark theme matching website design

## Tech Stack

**Backend:**
- Node.js + Express
- PostgreSQL database
- Socket.IO (WebSocket)
- Passport.js + Google OAuth 2.0
- bcryptjs for password hashing
- JWT for session management

**Frontend:**
- Vanilla JavaScript
- Socket.IO client
- Custom CSS matching existing website design

## Prerequisites

1. Node.js (v16 or higher)
2. PostgreSQL (v12 or higher)
3. Google Cloud Console account (for OAuth credentials)

## Setup Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

**Required environment variables:**

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3000) |
| `SESSION_SECRET` | Random secret for session encryption |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret |
| `GOOGLE_CALLBACK_URL` | OAuth callback URL (usually http://localhost:3000/auth/google/callback) |
| `JWT_SECRET` | Secret for JWT token signing |
| `DATABASE_URL` | PostgreSQL connection string |
| `NODE_ENV` | `development` or `production` |

### 3. Set Up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the **Google+ API** (or Google OAuth 2.0)
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Choose **Web application**
6. Add authorized redirect URIs:
   - Development: `http://localhost:3000/auth/google/callback`
   - Production: `https://yourdomain.com/auth/google/callback`
7. Copy the Client ID and Client Secret to your `.env`

### 4. Set Up PostgreSQL

Create a database:

```bash
createdb developer_chat
```

Or using psql:

```sql
CREATE DATABASE developer_chat;
```

Update your `DATABASE_URL` in `.env`:

```
postgresql://username:password@localhost:5432/developer_chat
```

### 5. Start the Server

**Development:**
```bash
npm run dev
```
Uses nodemon for auto-reload.

**Production:**
```bash
npm start
```

Server will run at: `http://localhost:3000`

### 6. Access Chat

1. Open your browser to `http://localhost:3000/chat.html`
2. Click "Sign in with Google"
3. Authorize the application
4. You'll be redirected to the chat interface

**Note:** Since this is a static website, you need to serve the HTML files alongside the backend. For local development, you can either:
- Use a simple HTTP server: `npx http-server . -p 5500`
- Configure Express to serve static files from the project root:
  ```js
  app.use(express.static(__dirname));
  ```

## Database Schema

Three main tables:

1. **users** - Google OAuth users
   ```
   id, email, name, avatar, provider, created_at
   ```

2. **rooms** - Chat rooms
   ```
   id, name, description, created_by, is_private, created_at
   ```

3. **messages** - Chat messages
   ```
   id, room_id, user_id, content, created_at
   ```

Indexes are created automatically on startup for performance.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/me` | GET | Get current user info |
| `/api/auth/logout` | POST | Log out user |
| `/api/rooms` | GET | List all public rooms |
| `/api/rooms` | POST | Create a new room (authenticated) |
| `/api/rooms/:roomId/messages` | GET | Get messages for a room |
| `/auth/google` | GET | Initiate Google OAuth |
| `/auth/google/callback` | GET | OAuth callback |

## WebSocket Events

**Client → Server:**
- `send_message` - Send chat message
- `join_room` - Join a chat room
- `leave_room` - Leave a chat room
- `typing_start` - User started typing
- `typing_stop` - User stopped typing

**Server → Client:**
- `new_message` - New message received
- `users_online` - Online users count updated
- `user_typing` - Another user is typing
- `user_stopped_typing` - User stopped typing
- `joined_room` - Confirmation of room join
- `error_message` - Error occurred

## Production Deployment

### Environment Changes

1. Set `NODE_ENV=production`
2. Update `GOOGLE_CALLBACK_URL` to your production domain
3. Configure CORS in `server.js` for your domain
4. Use a process manager like PM2:
   ```bash
   npm install -g pm2
   pm2 start server.js --name "dev-chat"
   ```

### Database

- Use connection pooling for production
- Consider using a managed PostgreSQL service (e.g., Neon, Supabase, Railway)
- Set up regular backups

### Security Notes

- Change all default secrets (`SESSION_SECRET`, `JWT_SECRET`)
- Use HTTPS in production
- Enable database SSL connection
- Implement rate limiting (already included)
- Consider adding message filtering/moderation

## File Structure

```
MyOwnWebsite/
├── server.js              # Main backend server
├── package.json           # Dependencies
├── .env.example           # Environment template
├── .env                   # Your environment variables (not committed)
├── chat.html              # Chat frontend
├── index.html             # Updated with Chat link
├── projects.html          # Updated with Chat link
├── contact.html           # Updated with Chat link
├── styles.css             # Main CSS (chat-specific styles inline in chat.html)
└── README_CHAT.md         # This documentation
```

## Troubleshooting

**Google OAuth Error:**
- Verify Client ID and Secret
- Check redirect URI matches exactly
- Ensure Google+ API is enabled

**Database Connection Error:**
- Check PostgreSQL is running
- Verify DATABASE_URL format
- Ensure database exists

**Socket.IO Connection Failed:**
- Check CORS settings match your frontend URL
- Verify server is running on correct port
- Check console for authentication errors

**Messages Not Sending:**
- Ensure you're authenticated
- Check room_id is valid
- Verify database connection

## Next Steps

Potential improvements:
- Add private messaging
- Implement message editing/deletion
- Add image/file sharing
- Add emoji picker
- Implement message search
- Add user blocking/reporting
- Create admin panel
- Add message reactions
- Implement voice/video chat
