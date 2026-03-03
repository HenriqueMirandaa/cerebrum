// small script to test MySQL connection using existing pool
// run: node test-db-connection.js

const pool = require('./config/database');

async function test() {
  try {
    console.log('Connecting to DB...');
    // simple query to verify connection
    const [rows1] = await pool.execute('SELECT 1 AS ok');
    console.log('Simple query result:', rows1);

    // list tables in current database
    const [tables] = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE();");
    console.log('Tables in database:', tables.map(t => t.TABLE_NAME));

    // if users table exists, count rows
    const [usersCount] = await pool.execute("SELECT COUNT(*) AS cnt FROM users");
    console.log('users table count:', usersCount[0].cnt);

    await pool.end();
    console.log('Connection test finished successfully.');
  } catch (err) {
    console.error('DB connection test failed:', err.message);
    process.exit(1);
  }
}

test();
