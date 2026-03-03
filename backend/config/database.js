const mysql = require('mysql2/promise');
require('dotenv').config();

function parseDbUrl(dbUrl) {
    if (!dbUrl) return null;
    try {
        const u = new URL(dbUrl);
        return {
            host: u.hostname,
            port: Number(u.port || 3306),
            user: decodeURIComponent(u.username || ''),
            password: decodeURIComponent(u.password || ''),
            database: (u.pathname || '').replace(/^\/+/, ''),
        };
    } catch (err) {
        return null;
    }
}

const urlConfig = parseDbUrl(process.env.DATABASE_URL || process.env.MYSQL_URL || process.env.MYSQL_PUBLIC_URL);
const dbConfig = {
    // Prefer URL-based credentials when available (Railway standard), then fallback to explicit vars.
    host: (urlConfig && urlConfig.host) || process.env.DB_HOST || process.env.MYSQLHOST,
    port: Number((urlConfig && urlConfig.port) || process.env.DB_PORT || process.env.MYSQLPORT || 3306),
    user: (urlConfig && urlConfig.user) || process.env.DB_USER || process.env.MYSQLUSER,
    password: (urlConfig && urlConfig.password) || process.env.DB_PASSWORD || process.env.MYSQLPASSWORD,
    database: (urlConfig && urlConfig.database) || process.env.DB_NAME || process.env.MYSQLDATABASE,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: process.env.DB_SSL_STRICT === 'true' } : undefined,
};

const pool = mysql.createPool({
    ...dbConfig,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool;
module.exports.dbConfig = dbConfig;
