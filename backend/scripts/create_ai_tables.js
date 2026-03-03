const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

async function main() {
  try {
    const sqlPath = path.join(__dirname, '..', 'sql', 'offline_ai_schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    // Split statements on semicolon followed by whitespace/newline. Keep simple.
    const statements = sql.split(/;\s*\n/).map(s => s.trim()).filter(Boolean);
    console.log('Found', statements.length, 'statements. Executing...');
    for (const stmt of statements) {
      try {
        await pool.execute(stmt);
      } catch (err) {
        console.error('Failed statement:', stmt.substring(0,80).replace(/\n/g,' '), '\nError:', err.message);
      }
    }
    console.log('Done. AI tables created/updated (if permissions allow).');
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Fatal error creating AI tables', err);
    try { await pool.end(); } catch (e) {}
    process.exit(1);
  }
}

main();
