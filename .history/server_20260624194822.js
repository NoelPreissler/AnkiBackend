const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const PORT = 5000;

// Middleware aktivieren
app.use(cors());          // Erlaubt Anfragen vom React-Frontend
app.use(express.json());  // Ermöglicht dem Server, JSON-Daten zu lesen

// Verbindung zur PostgreSQL-Datenbank einrichten
const pool = new Pool({
  user: 'postgres',               // Dein DB-Nutzer
  host: 'localhost',               // Da das Backend auf demselben Server läuft
  database: 'AnkiDB',     // Name deiner Datenbank
  password: 'Kurtlarvadisi', // Das Passwort des Nutzers
  port: 8888,                      // Dein geänderter PostgreSQL-Port!
});

// --- ROUTE 1: REGISTRIERUNG ---
app.post('/api/register', async (req, res) => {
  const { benutzername } = req.body;
  if (!benutzername) return res.status(400).json({ error: 'Benutzername fehlt.' });

  try {
    // Prüfen, ob der Benutzer bereits existiert
    const userCheck = await pool.query('SELECT * FROM benutzer WHERE benutzername = $1', [benutzername]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Dieser Benutzername ist bereits vergeben.' });
    }

    // Neuen Benutzer in die DB eintragen
    const newUser = await pool.query(
      'INSERT INTO benutzer (benutzername) VALUES ($1) RETURNING *',
      [benutzername]
    );
    res.status(201).json({ message: 'Registrierung erfolgreich', user: newUser.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Datenbankfehler bei der Registrierung.' });
  }
});

// --- ROUTE 2: LOGIN ---
app.post('/api/login', async (req, res) => {
  const { benutzername } = req.body;
  if (!benutzername) return res.status(400).json({ error: 'Benutzername fehlt.' });

  try {
    const user = await pool.query('SELECT * FROM benutzer WHERE benutzername = $1', [benutzername]);
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden. Bitte registriere dich zuerst.' });
    }
    // Benutzer gefunden -> Daten (inkl. ID) zurücksenden
    res.json({ message: 'Login erfolgreich', user: user.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Datenbankfehler beim Login.' });
  }
});

// --- ROUTE 3: VOKABEL-UPLOAD (JSON) ---
app.post('/api/vokabeln/upload', async (req, res) => {
  const { benutzer_id, vokabeln } = req.body; // Erwartet die User-ID und das JSON-Array
  if (!benutzer_id || !vokabeln || !Array.isArray(vokabeln)) {
    return res.status(400).json({ error: 'Ungültige Daten übermittelt.' });
  }

  try {
    // Da wir mehrere Vokabeln gleichzeitig einfügen, nutzen wir eine Schleife.
    // Für optimale Performance nutzen wir hier eine SQL-Transaktion.
    await pool.query('BEGIN');
    
    for (const v of vokabeln) {
      // Flexibel bleiben: Akzeptiert sowohl {vorn, hinten} als auch alternative JSON-Keys
      const deutsch = v.deutsch || v.vorn || Object.values(v)[0];
      const zielsprache = v.zielsprache || v.hinten || Object.values(v)[1];

      await pool.query(
        'INSERT INTO vokabeln (benutzer_id, deutsch, zielsprache) VALUES ($1, $2, $3)',
        [benutzer_id, deutsch, zielsprache]
      );
    }

    await pool.query('COMMIT');
    res.status(201).json({ message: `${vokabeln.length} Vokabeln erfolgreich gespeichert.` });
  } catch (err) {
    await pool.query('ROLLBACK'); // Falls ein Fehler auftritt, machen wir alles rückgängig
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Speichern der Vokabeln.' });
  }
});

// --- ROUTE 4: VOKABELN EINES NUTZERS LADEN ---
app.get('/api/vokabeln/:benutzer_id', async (req, res) => {
  const { benutzer_id } = req.params;

  try {
    const result = await pool.query(
      'SELECT deutsch, zielsprache FROM vokabeln WHERE benutzer_id = $1 ORDER BY erstellt_am DESC',
      [benutzer_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Laden deiner Vokabeln.' });
  }
});

// Server starten
app.listen(PORT, () => {
  console.log(`Backend-Server läuft erfolgreich auf http://localhost:${PORT}`);
});