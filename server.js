import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadState, DEFAULT_STATE_PATH } from './src/state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Explicit root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Redirect accidental /3000 to root
app.get('/3000', (req, res) => {
  res.redirect('/');
});

// Main endpoint requested by specification
app.get('/api/state', (req, res) => {
  const state = loadState();
  if (!state) {
    return res.status(404).json({
      error: 'State not initialized. Run the planning command first: node src/run.js <file>'
    });
  }
  res.json(state);
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Event Planner Agent API server listening on http://localhost:${PORT}`);
  console.log(`GET /api/state -> returns current state.json`);
});
