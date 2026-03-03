require('dotenv').config();
const jwt = require('jsonwebtoken');
const id = process.argv[2] || 1;
const token = jwt.sign({ id: Number(id) }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
console.log(token);
