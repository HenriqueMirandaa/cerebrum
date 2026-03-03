const http = require('http');
const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/subjects/minhas',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiaWF0IjoxNzcwODI3MjIyLCJleHAiOjE3NzE0MzIwMjJ9.YnDr0VCE6A7K9uW0-72YnJA7rjFiyTUmTyCxq8Dw7aM'
  }
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
