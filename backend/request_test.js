const http = require('http');
const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/subjects/minhas',
  method: 'GET',
  headers: process.env.TEST_AUTH_TOKEN
    ? { Authorization: `Bearer ${process.env.TEST_AUTH_TOKEN}` }
    : {}
};

const req = http.request(options, res => {
  console.log(`statusCode: ${res.statusCode}`);
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('body:', data);
  });
});

req.on('error', error => {
  console.error('request error', error);
});

req.end();
