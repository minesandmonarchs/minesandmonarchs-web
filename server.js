const express = require('express');
const path = require('path');
const app = express();
const mount = '/minesandmonarchs.com';
const root = path.join(__dirname);

// Serve static files under the mount path
app.use(mount, express.static(root, { extensions: ['html'] }));

// SPA fallback for routes under the mount
app.get(mount + '/*', (req, res) => {
  res.sendFile(path.join(root, 'index.html'));
});

const port = process.env.PORT || 8000;
app.listen(port, () => console.log(`Dev server running at http://localhost:${port}${mount}/`));
