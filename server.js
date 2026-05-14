const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const session = require('express-session');
const connectPgSimple = require('connect-pg-simple')(session);
const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? 'https://yazanayasreh.github.io'
      : 'http://localhost:5500',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Session store with PostgreSQL
const sessionStore = new connectPgSimple({
  pool: pool,
  tableName: 'session'
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.socket.io"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  }
}));
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? 'https://yazanayasreh.github.io'
    : 'http://localhost:5500',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Serve static files (HTML, CSS, JS)
app.use(express.static(__dirname));

// Session configuration
app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// Passport configuration
app.use(passport.initialize());
app.use(passport.session());

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const { emails, displayName, photos } = profile;
    const email = emails[0].value;
    const name = displayName;
    const avatar = photos && photos[0] ? photos[0].value : null;

    // Check if user exists
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      const user = existingUser.rows[0];
      return done(null, user);
    }

    // Create new user
    const newUser = await pool.query(
      `INSERT INTO users (email, name, avatar, provider, created_at)
       VALUES ($1, $2, $3, 'google', NOW())
       RETURNING *`,
      [email, name, avatar]
    );

    return done(null, newUser.rows[0]);
  } catch (error) {
    console.error('Google OAuth error:', error);
    return done(error, null);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await pool.query('SELECT id, email, name, avatar FROM users WHERE id = $1', [id]);
    done(null, user.rows[0]);
  } catch (error) {
    done(error, null);
  }
});

// Routes

// Google OAuth routes
app.get('/auth/google',
  passport.authenticate('google', {
    scope: ['profile', 'email']
  })
);

app.get('/auth/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/login.html',
    successRedirect: '/chat.html'
  }),
  (req, res) => {
    res.redirect('/chat.html');
  }
);

// Get current user
app.get('/api/auth/me', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      avatar: req.user.avatar
    }
  });
});

// Get JWT token for WebSocket authentication
app.get('/api/auth/token', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const token = jwt.sign(
    {
      userId: req.user.id,
      userName: req.user.name
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  // Also return user info
  res.json({
    token,
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      avatar: req.user.avatar
    }
  });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ message: 'Logged out' });
  });
});

// Chat API endpoints

// Get all public rooms
app.get('/api/rooms', async (req, res) => {
  try {
    const rooms = await pool.query(`
      SELECT r.*,
             COUNT(DISTINCT m.id) as message_count,
             MAX(m.created_at) as last_message_at
      FROM rooms r
      LEFT JOIN messages m ON r.id = m.room_id
      WHERE r.is_private = false
      GROUP BY r.id
      ORDER BY r.created_at DESC
    `);
    res.json(rooms.rows);
  } catch (error) {
    console.error('Get rooms error:', error);
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

// Get messages for a room
app.get('/api/rooms/:roomId/messages', async (req, res) => {
  const { roomId } = req.params;
  const { limit = 50, before } = req.query;

  try {
    let query = `
      SELECT m.*, u.name, u.avatar
      FROM messages m
      JOIN users u ON m.user_id = u.id
      WHERE m.room_id = $1
    `;
    const params = [roomId];

    if (before) {
      query += ` AND m.created_at < $2`;
      params.push(before);
    }

    query += ` ORDER BY m.created_at DESC LIMIT ${limit}`;

    const messages = await pool.query(query, params);
    res.json(messages.rows.reverse());
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Create a new room
app.post('/api/rooms', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { name, description, is_private } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Room name is required' });
  }

  try {
    const room = await pool.query(
      `INSERT INTO rooms (name, description, created_by, is_private, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING *`,
      [name, description || null, req.user.id, is_private || false]
    );
    res.status(201).json(room.rows[0]);
  } catch (error) {
    console.error('Create room error:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// WebSocket handling
const onlineUsers = new Map();

io.use((socket, next) => {
  // Authentication middleware for Socket.IO
  const token = socket.handshake.auth.token;

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      socket.userName = decoded.userName;
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  } else {
    next(new Error('Authentication required'));
  }
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.userName} (${socket.userId})`);

  // Track online user
  onlineUsers.set(socket.userId, {
    id: socket.userId,
    name: socket.userName,
    joinedAt: new Date(),
    socketId: socket.id
  });

  // Broadcast online users count
  io.emit('users_online', onlineUsers.size);

  // Join default room (general)
  socket.join('general');

  // Handle chat messages
  socket.on('send_message', async (data) => {
    const { roomId, content } = data;

    if (!content || !roomId) {
      socket.emit('error_message', { error: 'Content and room ID are required' });
      return;
    }

    try {
      const message = await pool.query(
        `INSERT INTO messages (room_id, user_id, content, created_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING *`,
        [roomId, socket.userId, content]
      );

      const fullMessage = await pool.query(
        `SELECT m.*, u.name, u.avatar
         FROM messages m
         JOIN users u ON m.user_id = u.id
         WHERE m.id = $1`,
        [message.rows[0].id]
      );

      io.to(roomId).emit('new_message', fullMessage.rows[0]);
    } catch (error) {
      console.error('Send message error:', error);
      socket.emit('error_message', { error: 'Failed to send message' });
    }
  });

  // Join room
  socket.on('join_room', (roomId) => {
    socket.join(roomId);
    socket.emit('joined_room', { roomId });
  });

  // Leave room
  socket.on('leave_room', (roomId) => {
    socket.leave(roomId);
  });

  // Typing indicator
  socket.on('typing_start', (roomId) => {
    socket.to(roomId).emit('user_typing', {
      userId: socket.userId,
      userName: socket.userName
    });
  });

  socket.on('typing_stop', (roomId) => {
    socket.to(roomId).emit('user_stopped_typing', {
      userId: socket.userId
    });
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.userId}`);
    onlineUsers.delete(socket.userId);
    io.emit('users_online', onlineUsers.size);
  });
});

// Initialize database
async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        avatar TEXT,
        provider VARCHAR(50) DEFAULT 'google',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_by INTEGER REFERENCES users(id),
        is_private BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS session (
        sid VARCHAR NOT NULL PRIMARY KEY,
        sess JSON NOT NULL,
        expired TIMESTAMP NOT NULL
      )
    `);

    // Create index for faster queries
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_room_created ON messages(room_id, created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id)`);

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

// Start server
const PORT = process.env.PORT || 3000;

initializeDatabase().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Google OAuth callback: ${process.env.GOOGLE_CALLBACK_URL}`);
  });
});

module.exports = { app, server, io, pool };
