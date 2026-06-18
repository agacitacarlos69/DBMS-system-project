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
    MANAGER AUTHENTICATION ENDPOINT
    Validates the login against a single manager
    credential held in the .env file
    (MANAGER_USERNAME / MANAGER_PASSWORD).
==================================================== */
const MANAGER_USERNAME = process.env.MANAGER_USERNAME || 'MN100205';
const MANAGER_PASSWORD = process.env.MANAGER_PASSWORD || 'Manager@123';

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body || {};
    try {
        if (!username || !password) {
            return res.status(400).json({ message: "Username and password are required." });
        }
        if (username !== MANAGER_USERNAME || password !== MANAGER_PASSWORD) {
            return res.status(401).json({ message: "Invalid username or password." });
        }
        res.json({
            token: "mock-jwt-token-xyz-123",
            user: { username: MANAGER_USERNAME, role: "Manager" }
        });
    } catch (err) {
        res.status(500).json({ message: "Sign-in processing failure." });
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
        res.status(500).json({ error: err.message });
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
        
        res.status(201).json({ message: 'Saved successfully', id: result.rows[0].emp_id });
    } catch (err) {
        res.status(500).json({ error: err.message });
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
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/employees/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM Employee WHERE emp_id = $1;', [req.params.id]);
        res.json({ message: 'Record removed successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
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
                password_plain, 
                date_time_created, 
                password_changed_at 
            FROM Users 
            ORDER BY user_id ASC;
        `);
        res.json(result.rows);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

app.post('/api/users', async (req, res) => {
    const { emp_id, email, password } = req.body;
    const pw = password || DEFAULT_PASSWORD;
    try {
        const result = await pool.query(`
            INSERT INTO Users (emp_id, email, password_hash, password_plain) 
            VALUES ($1, $2, crypt($3, gen_salt('bf')), $3) 
            RETURNING user_id;
        `, [emp_id, email, pw]);
        res.status(201).json(result.rows[0]);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

app.put('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    const { emp_id, email, password } = req.body;
    try {
        if (password) {
            await pool.query(`
                UPDATE Users 
                SET emp_id = $1, email = $2, password_hash = crypt($3, gen_salt('bf')), password_plain = $3 
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
        res.status(500).json({ error: err.message }); 
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM Users WHERE user_id = $1;', [req.params.id]);
        res.json({ message: 'User record dropped successfully' });
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});


/* ====================================================
                MANAGEMENT ENDPOINTS
==================================================== */
app.get('/api/management', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                mgmt_id, 
                training_id, 
                shift_id, 
                tlead_id, 
                sme_id,
                mgmt_id AS mgmt_name -- Structural fallback for UI rendering lists
            FROM Management 
            ORDER BY mgmt_id ASC;
        `);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
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
    } catch (err) { res.status(500).json({ error: err.message }); }
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
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/management/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM Management WHERE mgmt_id = $1;', [req.params.id]);
        res.json({ message: 'Management deleted successfully' });
    } catch (err) { res.status(500).json({ error: err.message }); }
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
    } catch (err) { res.status(500).json({ error: err.message }); }
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
    } catch (err) { res.status(500).json({ error: err.message }); }
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
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/team-leads/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM Team_Lead WHERE tlead_id = $1;', [req.params.id]);
        res.json({ message: 'Team Lead deleted successfully' });
    } catch (err) { res.status(500).json({ error: err.message }); }
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
    } catch (err) { res.status(500).json({ error: err.message }); }
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
    } catch (err) { res.status(500).json({ error: err.message }); }
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
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/smes/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM SME WHERE sme_id = $1;', [req.params.id]);
        res.json({ message: 'SME deleted successfully' });
    } catch (err) { res.status(500).json({ error: err.message }); }
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
    } catch (err) { res.status(500).json({ error: err.message }); }
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
    } catch (err) { res.status(500).json({ error: err.message }); }
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
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/trainings/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM Training WHERE training_id = $1;', [req.params.id]);
        res.json({ message: 'Training record deleted successfully' });
    } catch (err) { res.status(500).json({ error: err.message }); }
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
    } catch (err) { res.status(500).json({ error: err.message }); }
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
    } catch (err) { res.status(500).json({ error: err.message }); }
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
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/shifts/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM Shift WHERE shift_id = $1;', [req.params.id]);
        res.json({ message: 'Shift deleted successfully' });
    } catch (err) { res.status(500).json({ error: err.message }); }
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
    } catch (err) { res.status(500).json({ error: err.message }); }
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
    } catch (err) { res.status(500).json({ error: err.message }); }
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
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/rooms/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM Room WHERE room_id = $1;', [req.params.id]);
        res.json({ message: 'Room deleted successfully' });
    } catch (err) { res.status(500).json({ error: err.message }); }
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
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server processing requests actively on port ${PORT}`);
});
