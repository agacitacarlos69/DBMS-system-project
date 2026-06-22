/* need node.js installed then run 'npm install express pg cors dotenv' in terminal ata not so sure i forgor*/
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();
const app = express();
const PORT = process.env.PORT || 5000;

// ===== MIDDLEWARE =====
app.use(cors());          
app.use(express.json());  
app.use(express.static('public')); // use this if pinagsama-sama yung mga html file in one folder. "public" is the folder name.

// ===== DATABASE CONNECTION =====
const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST, /* there should be a .env in the folder that has the database credentials included to hide it */
    port: process.env.DB_PORT,
    database: process.env.DB_NAME
});

pool.query('SELECT NOW()', (err, res) => {
    if (err) console.error('❌ Database connection failure:', err.message);
    else console.log('✅ Connected to PostgreSQL database safely.');
});

/* ====================================================
    ERROR HANDLING HELPER
    Logs the real error server-side and returns a
    friendly, user-facing message to the client so we
    never leak raw 500 / database internals to the UI.
==================================================== */
function fail(res, err, message, status = 500) {
    console.error('❌', message, '→', err && err.message ? err.message : err);
    let friendly = message;
    const detail = err && err.message ? err.message : '';
    if (/duplicate key|unique constraint/i.test(detail)) {
        friendly = 'That record already exists. Please use a different ID/value.';
    } else if (/foreign key|violates foreign key constraint/i.test(detail)) {
        friendly = 'This record is linked to other data, or references something that does not exist.';
    } else if (/not-null|null value/i.test(detail)) {
        friendly = 'A required field is missing. Please complete the form and try again.';
    }
    res.status(status).json({ message: friendly });
}

/* ====================================================
    MANAGER AUTHENTICATION & PROFILE
    Login validates against the manager_settings table
    (seeded from the .env MANAGER_USERNAME/PASSWORD on
    first run). The .env values remain a fallback so the
    app still works before the migration is applied.
==================================================== */
const MANAGER_USERNAME = process.env.MANAGER_USERNAME || 'MN100205';
const MANAGER_PASSWORD = process.env.MANAGER_PASSWORD || 'Manager@123';

// In-memory reset codes for the simulated forgot-password flow.
const resetCodes = new Map(); // username -> { code, expires }

// Ensure a manager_settings row exists; seed it from .env if missing.
async function ensureManagerSettings() {
    try {
        const { rows } = await pool.query('SELECT 1 FROM manager_settings WHERE id = 1;');
        if (rows.length === 0) {
            await pool.query(`
                INSERT INTO manager_settings (id, username, password_hash, handoff_notes)
                VALUES (1, $1, crypt($2, gen_salt('bf')), '')
                ON CONFLICT (id) DO NOTHING;
            `, [MANAGER_USERNAME, MANAGER_PASSWORD]);
            console.log('🔐 Seeded manager_settings from .env defaults.');
        }
    } catch (err) {
        // Table may not exist yet (migration not applied) — fall back to .env.
        console.warn('⚠️  manager_settings unavailable (run the migration). Using .env fallback:', err.message);
    }
}
ensureManagerSettings();

// Returns the stored manager settings row, or null if the table is unavailable.
async function getManagerSettings() {
    try {
        const { rows } = await pool.query('SELECT id, username, handoff_notes FROM manager_settings WHERE id = 1;');
        return rows[0] || null;
    } catch {
        return null;
    }
}

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body || {};
    try {
        if (!username || !password) {
            return res.status(400).json({ message: "Username and password are required." });
        }
        // Try DB-backed credentials first.
        let valid = false;
        let resolvedUser = MANAGER_USERNAME;
        try {
            const { rows } = await pool.query(`
                SELECT username, (password_hash = crypt($2, password_hash)) AS ok
                FROM manager_settings
                WHERE id = 1 AND username = $1;
            `, [username, password]);
            if (rows.length) { valid = rows[0].ok === true; resolvedUser = rows[0].username; }
        } catch {
            // Fall through to .env check below.
        }
        if (!valid) {
            valid = (username === MANAGER_USERNAME && password === MANAGER_PASSWORD);
            resolvedUser = MANAGER_USERNAME;
        }
        if (!valid) {
            return res.status(401).json({ message: "Invalid username or password." });
        }
        res.json({
            token: "mock-jwt-token-xyz-123",
            user: { username: resolvedUser, role: "Manager" }
        });
    } catch (err) {
        fail(res, err, "Sign-in could not be processed. Please try again.");
    }
});

/* ---- Simulated forgot-password flow (no real email) ---- */
app.post('/api/auth/forgot-password', async (req, res) => {
    const { username } = req.body || {};
    try {
        const settings = await getManagerSettings();
        const knownUser = settings ? settings.username : MANAGER_USERNAME;
        // Always respond success-like to avoid user enumeration, but only
        // generate a code for the known manager account.
        if (username && username === knownUser) {
            const code = String(Math.floor(100000 + Math.random() * 900000));
            resetCodes.set(knownUser, { code, expires: Date.now() + 10 * 60 * 1000 });
            console.log(`📧 [SIMULATED EMAIL] Password reset code for ${knownUser}: ${code} (valid 10 min)`);
            return res.json({
                message: 'A reset code has been generated. (Simulated email — check the server console.)',
                simulated_code: code // returned for this academic/demo flow
            });
        }
        res.json({ message: 'If that account exists, a reset code has been generated.' });
    } catch (err) {
        fail(res, err, 'Could not start the password reset. Please try again.');
    }
});

app.post('/api/auth/reset-password', async (req, res) => {
    const { username, code, new_password } = req.body || {};
    try {
        if (!username || !code || !new_password) {
            return res.status(400).json({ message: 'Username, code and new password are required.' });
        }
        const entry = resetCodes.get(username);
        if (!entry || entry.code !== String(code) || entry.expires < Date.now()) {
            return res.status(400).json({ message: 'Invalid or expired reset code.' });
        }
        await pool.query(`
            UPDATE manager_settings
            SET password_hash = crypt($2, gen_salt('bf')), updated_at = NOW()
            WHERE id = 1 AND username = $1;
        `, [username, new_password]);
        resetCodes.delete(username);
        res.json({ message: 'Password updated successfully. You can now sign in.' });
    } catch (err) {
        fail(res, err, 'Could not reset the password. Please try again.');
    }
});

/* ---- Manager profile (handoff page) ---- */
app.get('/api/profile', async (req, res) => {
    try {
        const settings = await getManagerSettings();
        if (!settings) {
            return res.json({ username: MANAGER_USERNAME, handoff_notes: '' });
        }
        res.json({ username: settings.username, handoff_notes: settings.handoff_notes || '' });
    } catch (err) {
        fail(res, err, 'Could not load the profile.');
    }
});

app.put('/api/profile', async (req, res) => {
    const { handoff_notes } = req.body || {};
    try {
        await pool.query(`
            UPDATE manager_settings SET handoff_notes = $1, updated_at = NOW() WHERE id = 1;
        `, [handoff_notes ?? '']);
        res.json({ message: 'Handoff notes saved successfully.' });
    } catch (err) {
        fail(res, err, 'Could not save the handoff notes.');
    }
});

app.post('/api/profile/change-password', async (req, res) => {
    const { current_password, new_password } = req.body || {};
    try {
        if (!current_password || !new_password) {
            return res.status(400).json({ message: 'Current and new password are required.' });
        }
        const { rows } = await pool.query(`
            SELECT (password_hash = crypt($1, password_hash)) AS ok FROM manager_settings WHERE id = 1;
        `, [current_password]);
        if (!rows.length || rows[0].ok !== true) {
            return res.status(400).json({ message: 'Current password is incorrect.' });
        }
        await pool.query(`
            UPDATE manager_settings
            SET password_hash = crypt($1, gen_salt('bf')), updated_at = NOW()
            WHERE id = 1;
        `, [new_password]);
        res.json({ message: 'Manager password changed successfully.' });
    } catch (err) {
        fail(res, err, 'Could not change the password.');
    }
});

/* ====================================================
                EMPLOYEES ENDPOINTS
==================================================== */
app.get('/api/employees', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                emp_id, 
                full_name, 
                personal_email, 
                contact_number, 
                tenurity, 
                role, 
                status, 
                mgmt_id 
            FROM Employee 
            ORDER BY mgmt_id ASC;
        `);
        res.json(result.rows);
    } catch (err) {
        fail(res, err, 'The request could not be completed. Please try again.');
    }
});

app.post('/api/employees', async (req, res) => {
    const { emp_id, mgmt_id, full_name, personal_email, contact_number, tenurity, role, status } = req.body;
    try {
        const result = await pool.query(`
            INSERT INTO Employee (emp_id, mgmt_id, full_name, personal_email, contact_number, tenurity, role, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING emp_id;
        `, [emp_id, mgmt_id, full_name, personal_email, contact_number, tenurity, role, status]);

        /* When an employee is added it is automatically reflected in the
           Users table: the database trigger trg_employee_create_user
           (function create_user_for_employee) inserts a matching users row
           with a generated user_id and the default password 'Password123!'.
           We fetch that auto-created user here and return it in the response
           so the client can confirm the linked account was created. */
        const userResult = await pool.query(`
            SELECT user_id, emp_id, email, date_time_created, password_changed_at
            FROM Users
            WHERE emp_id = $1;
        `, [result.rows[0].emp_id]);

        res.status(201).json({
            message: 'Saved successfully',
            id: result.rows[0].emp_id,
            user: userResult.rows[0] || null
        });
    } catch (err) {
        fail(res, err, 'The request could not be completed. Please try again.');
    }
});

app.put('/api/employees/:id', async (req, res) => {
    const { id } = req.params;
    const { mgmt_id, full_name, personal_email, contact_number, tenurity, role, status } = req.body;
    try {
        await pool.query(`
            UPDATE Employee 
            SET mgmt_id = $1, full_name = $2, personal_email = $3, contact_number = $4, tenurity = $5, role = $6, status = $7
            WHERE emp_id = $8;
        `, [mgmt_id, full_name, personal_email, contact_number, tenurity, role, status, id]);
        
        res.json({ message: 'Update saved successfully.' });
    } catch (err) {
        fail(res, err, 'The request could not be completed. Please try again.');
    }
});

app.delete('/api/employees/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM Employee WHERE emp_id = $1;', [req.params.id]);
        res.json({ message: 'Record removed successfully.' });
    } catch (err) {
        fail(res, err, 'The request could not be completed. Please try again.');
    }
});


/* ====================================================
    USERS ENDPOINTS
    emp_id is the username (used for login).
    Passwords are bcrypt-hashed in the DB via pgcrypto
    (crypt(... , gen_salt('bf'))). The users table trigger
    auto-updates password_changed_at when password_hash changes.
==================================================== */
const DEFAULT_PASSWORD = 'Password123!';

app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                user_id, 
                emp_id, 
                email, 
                date_time_created, 
                password_changed_at 
            FROM Users 
            ORDER BY user_id ASC;
        `);
        res.json(result.rows);
    } catch (err) { 
        fail(res, err, 'Could not load users.'); 
    }
});

app.post('/api/users', async (req, res) => {
    const { emp_id, email, password } = req.body;
    const pw = password || DEFAULT_PASSWORD;
    try {
        const result = await pool.query(`
            INSERT INTO Users (emp_id, email, password_hash) 
            VALUES ($1, $2, crypt($3, gen_salt('bf'))) 
            RETURNING user_id;
        `, [emp_id, email, pw]);
        res.status(201).json(result.rows[0]);
    } catch (err) { 
        fail(res, err, 'Could not create the user.'); 
    }
});

app.put('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    const { emp_id, email, password } = req.body;
    try {
        if (password) {
            await pool.query(`
                UPDATE Users 
                SET emp_id = $1, email = $2, password_hash = crypt($3, gen_salt('bf')) 
                WHERE user_id = $4;
            `, [emp_id, email, password, id]);
        } else {
            await pool.query(`
                UPDATE Users 
                SET emp_id = $1, email = $2 
                WHERE user_id = $3;
            `, [emp_id, email, id]);
        }
        res.json({ message: 'User settings updated successfully' });
    } catch (err) { 
        fail(res, err, 'Could not update the user.'); 
    }
});

/* Reset a user's password to a freshly generated one. The plaintext is
   returned ONCE in the response so the manager can hand it over; it is
   never stored in plaintext (only the bcrypt hash is persisted). */
app.post('/api/users/:id/reset-password', async (req, res) => {
    const { id } = req.params;
    try {
        // Generate a reasonably strong temporary password.
        const gen = 'Tmp' + Math.random().toString(36).slice(-8) + '!' + Math.floor(10 + Math.random() * 89);
        const result = await pool.query(`
            UPDATE Users 
            SET password_hash = crypt($1, gen_salt('bf')) 
            WHERE user_id = $2 
            RETURNING user_id, emp_id, email;
        `, [gen, id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }
        res.json({
            message: 'Password reset successfully. Share this password with the user — it will not be shown again.',
            user_id: result.rows[0].user_id,
            new_password: gen
        });
    } catch (err) {
        fail(res, err, 'Could not reset the password.');
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM Users WHERE user_id = $1;', [req.params.id]);
        res.json({ message: 'User record dropped successfully' });
    } catch (err) { 
        fail(res, err, 'Could not delete the user.'); 
    }
});


/* ====================================================
                MANAGEMENT ENDPOINTS
==================================================== */
app.get('/api/management', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                m.mgmt_id, 
                m.training_id, 
                m.shift_id, 
                m.tlead_id, 
                m.sme_id,
                tl.tlead_name,
                s.sme_name,
                m.mgmt_id AS mgmt_name -- Structural fallback for UI rendering lists
            FROM Management m
            LEFT JOIN Team_Lead tl ON m.tlead_id = tl.tlead_id
            LEFT JOIN SME       s  ON m.sme_id   = s.sme_id
            ORDER BY m.mgmt_id ASC;
        `);
        res.json(result.rows);
    } catch (err) { fail(res, err, 'Could not load management records.'); }
});

app.post('/api/management', async (req, res) => {
    const { mgmt_id, training_id, shift_id, tlead_id, sme_id } = req.body;
    try {
        const result = await pool.query(`
            INSERT INTO Management (mgmt_id, training_id, shift_id, tlead_id, sme_id) 
            VALUES ($1, $2, $3, $4, $5) 
            RETURNING mgmt_id;
        `, [mgmt_id, training_id, shift_id, tlead_id, sme_id]);
        res.status(201).json(result.rows[0]);
    } catch (err) { fail(res, err, 'The request could not be completed. Please try again.'); }
});

app.put('/api/management/:id', async (req, res) => {
    const { id } = req.params;
    const { training_id, shift_id, tlead_id, sme_id } = req.body;
    try {
        await pool.query(`
            UPDATE Management 
            SET training_id = $1, shift_id = $2, tlead_id = $3, sme_id = $4 
            WHERE mgmt_id = $5;
        `, [training_id, shift_id, tlead_id, sme_id, id]);
        res.json({ message: 'Management updated successfully' });
    } catch (err) { fail(res, err, 'The request could not be completed. Please try again.'); }
});

app.delete('/api/management/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM Management WHERE mgmt_id = $1;', [req.params.id]);
        res.json({ message: 'Management deleted successfully' });
    } catch (err) { fail(res, err, 'The request could not be completed. Please try again.'); }
});


/* ====================================================
                TEAM LEADS ENDPOINTS
==================================================== */
app.get('/api/team-leads', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                tlead_id, 
                emp_id, 
                tlead_name,
                tlead_id AS tlead_id 
            FROM Team_Lead 
            ORDER BY tlead_id ASC;
        `);
        res.json(result.rows);
    } catch (err) { fail(res, err, 'The request could not be completed. Please try again.'); }
});

app.post('/api/team-leads', async (req, res) => {
    const { tlead_id, emp_id, tlead_name } = req.body;
    try {
        const result = await pool.query(`
            INSERT INTO Team_Lead (tlead_id, emp_id, tlead_name) 
            VALUES ($1, $2, $3) 
            RETURNING tlead_id;
        `, [tlead_id, emp_id, tlead_name]);
        res.status(201).json(result.rows[0]);
    } catch (err) { fail(res, err, 'The request could not be completed. Please try again.'); }
});

app.put('/api/team-leads/:id', async (req, res) => {
    const { id } = req.params;
    const { emp_id, tlead_name } = req.body;
    try {
        await pool.query(`
            UPDATE Team_Lead 
            SET emp_id = $1, tlead_name = $2 
            WHERE tlead_id = $3;
        `, [emp_id, tlead_name, id]);
        res.json({ message: 'Team Lead updated successfully' });
    } catch (err) { fail(res, err, 'The request could not be completed. Please try again.'); }
});

app.delete('/api/team-leads/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM Team_Lead WHERE tlead_id = $1;', [req.params.id]);
        res.json({ message: 'Team Lead deleted successfully' });
    } catch (err) { fail(res, err, 'The request could not be completed. Please try again.'); }
});


/* ====================================================
                    SME ENDPOINTS
==================================================== */
app.get('/api/smes', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                sme_id, 
                emp_id, 
                sme_name 
            FROM SME 
            ORDER BY sme_id ASC;
        `);
        res.json(result.rows);
    } catch (err) { fail(res, err, 'The request could not be completed. Please try again.'); }
});

app.post('/api/smes', async (req, res) => {
    const { sme_id, emp_id, sme_name } = req.body;
    try {
        const result = await pool.query(`
            INSERT INTO SME (sme_id, emp_id, sme_name) 
            VALUES ($1, $2, $3) 
            RETURNING sme_id;
        `, [sme_id, emp_id, sme_name]);
        res.status(201).json(result.rows[0]);
    } catch (err) { fail(res, err, 'The request could not be completed. Please try again.'); }
});

app.put('/api/smes/:id', async (req, res) => {
    const { id } = req.params;
    const { emp_id, sme_name } = req.body;
    try {
        await pool.query(`
            UPDATE SME 
            SET emp_id = $1, sme_name = $2 
            WHERE sme_id = $3;
        `, [emp_id, sme_name, id]);
        res.json({ message: 'SME updated successfully' });
    } catch (err) { fail(res, err, 'The request could not be completed. Please try again.'); }
});

app.delete('/api/smes/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM SME WHERE sme_id = $1;', [req.params.id]);
        res.json({ message: 'SME deleted successfully' });
    } catch (err) { fail(res, err, 'The request could not be completed. Please try again.'); }
});


/* ====================================================
                TRAININGS ENDPOINTS
==================================================== */
app.get('/api/trainings', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                training_id, 
                room_id, 
                training_start, 
                training_end,
                training_id AS program_name -- UI label preservation mapping
            FROM Training 
            ORDER BY training_id ASC;
        `);
        res.json(result.rows);
    } catch (err) { fail(res, err, 'The request could not be completed. Please try again.'); }
});

app.post('/api/trainings', async (req, res) => {
    const { training_id, room_id, training_start, training_end } = req.body;
    try {
        const result = await pool.query(`
            INSERT INTO Training (training_id, room_id, training_start, training_end) 
            VALUES ($1, $2, $3, $4) 
            RETURNING training_id;
        `, [training_id, room_id, training_start, training_end]);
        res.status(201).json(result.rows[0]);
    } catch (err) { fail(res, err, 'The request could not be completed. Please try again.'); }
});

app.put('/api/trainings/:id', async (req, res) => {
    const { id } = req.params;
    const { room_id, training_start, training_end } = req.body;
    try {
        await pool.query(`
            UPDATE Training 
            SET room_id = $1, training_start = $2, training_end = $3 
            WHERE training_id = $4;
        `, [room_id, training_start, training_end, id]);
        res.json({ message: 'Training program updated successfully' });
    } catch (err) { fail(res, err, 'The request could not be completed. Please try again.'); }
});

app.delete('/api/trainings/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM Training WHERE training_id = $1;', [req.params.id]);
        res.json({ message: 'Training record deleted successfully' });
    } catch (err) { fail(res, err, 'The request could not be completed. Please try again.'); }
});


/* ====================================================
                    SHIFTS ENDPOINTS 
==================================================== */
app.get('/api/shifts', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                shift_id, 
                room_id, 
                shift_value, 
                shift_start, 
                shift_end,
                shift_value AS roster_label -- UI label preservation mapping
            FROM Shift 
            ORDER BY shift_id ASC;
        `);
        res.json(result.rows);
    } catch (err) { fail(res, err, 'The request could not be completed. Please try again.'); }
});

app.post('/api/shifts', async (req, res) => {
    const { shift_id, room_id, shift_value, shift_start, shift_end } = req.body;
    try {
        const result = await pool.query(`
            INSERT INTO Shift (shift_id, room_id, shift_value, shift_start, shift_end) 
            VALUES ($1, $2, $3, $4, $5) 
            RETURNING shift_id;
        `, [shift_id, room_id, shift_value, shift_start, shift_end]);
        res.status(201).json(result.rows[0]);
    } catch (err) { fail(res, err, 'The request could not be completed. Please try again.'); }
});

app.put('/api/shifts/:id', async (req, res) => {
    const { id } = req.params;
    const { room_id, shift_value, shift_start, shift_end } = req.body;
    try {
        await pool.query(`
            UPDATE Shift 
            SET room_id = $1, shift_value = $2, shift_start = $3, shift_end = $4 
            WHERE shift_id = $5;
        `, [room_id, shift_value, shift_start, shift_end, id]);
        res.json({ message: 'Shift updated successfully' });
    } catch (err) { fail(res, err, 'The request could not be completed. Please try again.'); }
});

app.delete('/api/shifts/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM Shift WHERE shift_id = $1;', [req.params.id]);
        res.json({ message: 'Shift deleted successfully' });
    } catch (err) { fail(res, err, 'The request could not be completed. Please try again.'); }
});


/* ====================================================
                    ROOMS ENDPOINTS
==================================================== */
app.get('/api/rooms', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                room_id, 
                room_name,
                room_name AS block_location -- UI layout preservation placeholder
            FROM Room 
            ORDER BY room_id ASC;
        `);
        res.json(result.rows);
    } catch (err) { fail(res, err, 'The request could not be completed. Please try again.'); }
});

app.post('/api/rooms', async (req, res) => {
    const { room_id, room_name } = req.body;
    try {
        const result = await pool.query(`
            INSERT INTO Room (room_id, room_name) 
            VALUES ($1, $2) 
            RETURNING room_id;
        `, [room_id, room_name]);
        res.status(201).json(result.rows[0]);
    } catch (err) { fail(res, err, 'The request could not be completed. Please try again.'); }
});

app.put('/api/rooms/:id', async (req, res) => {
    const { id } = req.params;
    const { room_name } = req.body;
    try {
        await pool.query(`
            UPDATE Room 
            SET room_name = $1 
            WHERE room_id = $2;
        `, [room_name, id]);
        res.json({ message: 'Room updated successfully' });
    } catch (err) { fail(res, err, 'The request could not be completed. Please try again.'); }
});

app.delete('/api/rooms/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM Room WHERE room_id = $1;', [req.params.id]);
        res.json({ message: 'Room deleted successfully' });
    } catch (err) { fail(res, err, 'The request could not be completed. Please try again.'); }
});

/* ====================================================
    DASHBOARD SUMMARY ENDPOINT
    Returns up to 30 employees joined with their
    Management, Team Lead, SME, Training, Shift and Room
    for the dashboard summary table.
==================================================== */
app.get('/api/dashboard/summary', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                e.emp_id,
                e.full_name,
                e.role,
                e.status,
                m.mgmt_id,
                tl.tlead_name,
                s.sme_name,
                t.training_id,
                sh.shift_value,
                r.room_name
            FROM Employee e
            LEFT JOIN Management m  ON e.mgmt_id    = m.mgmt_id
            LEFT JOIN Team_Lead  tl ON m.tlead_id   = tl.tlead_id
            LEFT JOIN SME        s  ON m.sme_id      = s.sme_id
            LEFT JOIN Training   t  ON m.training_id = t.training_id
            LEFT JOIN Shift      sh ON m.shift_id    = sh.shift_id
            LEFT JOIN Room       r  ON sh.room_id    = r.room_id
            ORDER BY e.emp_id ASC
            LIMIT 30;
        `);
        res.json(result.rows);
    } catch (err) {
        fail(res, err, 'The request could not be completed. Please try again.');
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server processing requests actively on port ${PORT}`);
});
