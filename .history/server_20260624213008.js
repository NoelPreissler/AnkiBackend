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
  host: 'localhost',              // Da das Backend auf demselben Server läuft
  database: 'AnkiDB',             // Name deiner Datenbank
  password: 'Kurtlarvadisi',      // Das Passwort des Nutzers
  port: 8888,                     // Dein geänderter PostgreSQL-Port!
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

// --- NEUE ROUTE 3: ALLE VOKABELSÄTZE EINES USERS ABFRAGEN ---
// Liefert die Liste der Decks für das Dropdown-Menü im Frontend
app.get('/api/saetze/:benutzer_id', async (req, res) => {
  const { benutzer_id } = req.params;
  try {
    const result = await pool.query(
      'SELECT id, name FROM vokabelsaetze WHERE benutzer_id = $1 ORDER BY name ASC',
      [benutzer_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Laden der Vokabelsätze.' });
  }
});

// --- NEUE ROUTE 4: ALLE VOKABELN EINES SPEZIFISCHEN SATZES LADEN ---
// Holt die Karten für das Quiz, sobald ein DB-Deck gestartet wird
app.get('/api/vokabeln/satz/:satz_id', async (req, res) => {
  const { satz_id } = req.params;
  try {
    const result = await pool.query(
      'SELECT deutsch, zielsprache FROM vokabeln WHERE satz_id = $1 ORDER BY erstellt_am DESC',
      [satz_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Laden der Vokabeln.' });
  }
});

// --- NEUE ROUTE 5: INTELLIGENTER VOKABEL-UPLOAD (ERSTELLEN ODER ERWEITERN) ---
app.post('/api/vokabeln/upload', async (req, res) => {
  const { benutzer_id, satz_name, vokabeln } = req.body;
  
  if (!benutzer_id || !satz_name || !vokabeln || !Array.isArray(vokabeln)) {
    return res.status(400).json({ error: 'Ungültige Daten übermittelt.' });
  }

  try {
    await pool.query('BEGIN'); // SQL-Transaktion starten

    // 1. Prüfen, ob der Satz für diesen User bereits existiert
    let satzId;
    const satzCheck = await pool.query(
      'SELECT id FROM vokabelsaetze WHERE benutzer_id = $1 AND name = $2',
      [benutzer_id, satz_name.trim()]
    );

    if (satzCheck.rows.length > 0) {
      // Modus: ERWEITERN -> Satz existiert, nimm die bestehende ID
      satzId = satzCheck.rows[0].id;
    } else {
      // Modus: NEU ANLEGEN -> Satz existiert nicht, erstelle ihn frisch
      const neuerSatz = await pool.query(
        'INSERT INTO vokabelsaetze (benutzer_id, name) VALUES ($1, $2) RETURNING id',
        [benutzer_id, satz_name.trim()]
      );
      satzId = neuerSatz.rows[0].id;
    }

    // 2. Vokabeln in diesen spezifischen Satz einfügen
    for (const v of vokabeln) {
      const deutsch = v.deutsch || v.vorn || Object.values(v)[0];
      const zielsprache = v.zielsprache || v.hinten || Object.values(v)[1];

      await pool.query(
        'INSERT INTO vokabeln (satz_id, deutsch, zielsprache) VALUES ($1, $2, $3)',
        [satzId, deutsch, zielsprache]
      );
    }

    await pool.query('COMMIT'); // Änderungen in die Datenbank schreiben
    res.status(201).json({ message: `Erfolgreich gespeichert im Satz "${satz_name}".` });
  } catch (err) {
    await pool.query('ROLLBACK'); // Bei Fehlern komplett zurückrollen
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Speichern der Vokabeln.' });
  }
});

// Server starten
app.listen(PORT, () => {
  console.log(`Backend-Server läuft erfolgreich auf http://localhost:${PORT}`);
});