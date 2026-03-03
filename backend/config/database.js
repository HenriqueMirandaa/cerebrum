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
    host: process.env.DB_HOST || process.env.MYSQLHOST || (urlConfig && urlConfig.host),
    port: Number(process.env.DB_PORT || process.env.MYSQLPORT || (urlConfig && urlConfig.port) || 3306),
    user: process.env.DB_USER || process.env.MYSQLUSER || (urlConfig && urlConfig.user),
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || (urlConfig && urlConfig.password),
    database: process.env.DB_NAME || process.env.MYSQLDATABASE || (urlConfig && urlConfig.database),
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
